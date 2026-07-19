"""Composable cell classification via LLM vision.

Provides a generic system for classifying cell contents in logic puzzles.
Callers specify which target types to detect; the module assembles the prompt,
runs the LLM montage recognition, and returns typed results.

Usage:
    from puzzle_parsers.cell_classify import (
        classify_cells, IntegerTarget, DirectedIntegerTarget,
        Integer, DirectedInteger, Empty,
    )

    results = classify_cells(recognizer, cell_crops, [IntegerTarget(), DirectedIntegerTarget()])
    for row in results:
        for cell in row:
            if isinstance(cell, DirectedInteger):
                print(cell.value, cell.direction)
"""
from __future__ import annotations

import io
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Generic, TypeVar

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.llm_vision import parse_json_response
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer, ClaudeRecognizer

T = TypeVar("T")


# ─── Result types ───


@dataclass(frozen=True)
class Empty:
    """Cell has no meaningful content."""
    pass


@dataclass(frozen=True)
class Integer:
    """Cell contains a plain printed digit."""
    value: int


@dataclass(frozen=True)
class CircledInteger:
    """Cell contains a circled number (e.g., start cell in slalom)."""
    value: int


@dataclass(frozen=True)
class DirectedInteger:
    """Cell contains a number with a directional arrow."""
    value: int
    direction: str  # "up" | "down" | "left" | "right"


@dataclass(frozen=True)
class DualInteger:
    """Cell split by a diagonal with two numbers."""
    top_right: int
    bottom_left: int


@dataclass(frozen=True)
class PencilHead:
    """Cell contains a pencil-head arrowhead pointing in a direction."""
    direction: str  # "up" | "down" | "left" | "right"


@dataclass(frozen=True)
class Symbol:
    """Cell contains a named symbol (circle, triangle, S, G, etc.)."""
    code: int


CellClassification = Empty | Integer | CircledInteger | DirectedInteger | DualInteger | PencilHead | Symbol


# ─── Target specs ───


class TargetSpec(ABC, Generic[T]):
    """Defines a detectable cell content type."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Identifier used in LLM output's 'type' field."""
        ...

    @property
    @abstractmethod
    def prompt_fragment(self) -> str:
        """Description of this target for the LLM prompt.

        Should describe what the content looks like visually and
        the exact JSON output format expected (with 'type' field).
        """
        ...

    @abstractmethod
    def parse(self, raw: dict) -> T:
        """Parse a raw JSON object from LLM output into a typed result."""
        ...


class IntegerTarget(TargetSpec[Integer]):
    @property
    def name(self) -> str:
        return "integer"

    @property
    def prompt_fragment(self) -> str:
        return (
            "A printed digit or multi-digit number (1, 2, ..., 25, etc.). "
            'Report as {"type":"integer","value":N}.'
        )

    def parse(self, raw: dict) -> Integer:
        return Integer(value=int(raw["value"]))


class CircledIntegerTarget(TargetSpec[CircledInteger]):
    @property
    def name(self) -> str:
        return "circled_integer"

    @property
    def prompt_fragment(self) -> str:
        return (
            "A number enclosed in a circle (e.g., a circled 8 or circled 25). "
            'Report as {"type":"circled_integer","value":N}.'
        )

    def parse(self, raw: dict) -> CircledInteger:
        return CircledInteger(value=int(raw["value"]))


class DirectedIntegerTarget(TargetSpec[DirectedInteger]):
    @property
    def name(self) -> str:
        return "directed_integer"

    @property
    def prompt_fragment(self) -> str:
        return (
            "A number with a directional arrow (↑↓←→) indicating a direction. "
            "The arrow may appear above, below, or beside the number. "
            'Report as {"type":"directed_integer","value":N,"direction":"up"|"down"|"left"|"right"}.'
        )

    def parse(self, raw: dict) -> DirectedInteger:
        return DirectedInteger(value=int(raw["value"]), direction=raw["direction"])


class DualIntegerTarget(TargetSpec[DualInteger]):
    @property
    def name(self) -> str:
        return "dual_integer"

    @property
    def prompt_fragment(self) -> str:
        return (
            "A cell split by a diagonal line from upper-left to lower-right, "
            "with a number in the top-right half and a number in the bottom-left half. "
            'Report as {"type":"dual_integer","top_right":N,"bottom_left":M}.'
        )

    def parse(self, raw: dict) -> DualInteger:
        return DualInteger(top_right=int(raw["top_right"]), bottom_left=int(raw["bottom_left"]))


class PencilHeadTarget(TargetSpec[PencilHead]):
    @property
    def name(self) -> str:
        return "pencil_head"

    @property
    def prompt_fragment(self) -> str:
        return (
            "A pencil head icon: a small filled triangular arrowhead pointing in one direction. "
            "The head BELONGS TO the cell where the FLAT BASE of the triangle sits, "
            "NOT the cell the tip points toward. "
            'Report as {"type":"pencil_head","direction":"up"|"down"|"left"|"right"}.'
        )

    def parse(self, raw: dict) -> PencilHead:
        return PencilHead(direction=raw["direction"])


class SymbolTarget(TargetSpec[Symbol]):
    """Configurable symbol target.

    Args:
        symbols: Mapping of code -> visual description.
            e.g. {1: "circle (hollow ring)", 2: "triangle", 3: "letter S", 4: "letter G"}
    """

    def __init__(self, symbols: dict[int, str]) -> None:
        self._symbols = symbols

    @property
    def name(self) -> str:
        return "symbol"

    @property
    def prompt_fragment(self) -> str:
        lines = ["A symbol. Classify as one of:"]
        for code, desc in self._symbols.items():
            lines.append(f"  code {code}: {desc}")
        lines.append('Report as {"type":"symbol","code":N}.')
        return "\n".join(lines)

    def parse(self, raw: dict) -> Symbol:
        return Symbol(code=int(raw["code"]))


# ─── Prompt assembly ───

_PROMPT_TEMPLATE = (
    "This image shows a montage of cells cropped from a logic puzzle grid. "
    "Each cell is enclosed in a red border. The coordinate label (row,col) above each red box "
    "indicates the position of the cell in the original grid. "
    "Cells are arranged sequentially left-to-right, top-to-bottom. "
    "Ignore any faint dashed lines, partial ink, or grid artifacts at cell edges — "
    "focus only on the main content INSIDE each red box.\n\n"
    "Each cell contains one of the following:\n"
    "- Empty (no meaningful content). Report as {{\"type\":\"empty\"}}.\n"
    "{target_descriptions}\n\n"
    "There are {num_cells} cells to classify. "
    "Respond with ONLY a flat JSON array of {num_cells} objects, "
    "in the order shown (left-to-right, top-to-bottom). "
    "No explanation, just the JSON array."
)


def _build_prompt(targets: list[TargetSpec], num_cells: int) -> str:
    fragments = []
    for target in targets:
        fragments.append(f"- {target.prompt_fragment}")
    return _PROMPT_TEMPLATE.format(
        target_descriptions="\n".join(fragments),
        num_cells=num_cells,
    )


def _parse_result(raw: object, targets: list[TargetSpec]) -> CellClassification:
    if not isinstance(raw, dict):
        return Empty()

    raw_type = raw.get("type", "empty")
    if raw_type == "empty":
        return Empty()

    target_map = {t.name: t for t in targets}
    target = target_map.get(raw_type)
    if target is None:
        return Empty()

    return target.parse(raw)


# ─── Non-empty cell filtering + compact montage (from pencils pattern) ───


def _is_cell_non_empty(cell: NDArray, threshold: float = 0.02) -> bool:
    """Heuristic: check if central region has enough dark pixels."""
    gray = cell if len(cell.shape) == 2 else cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    margin_y = int(h * 0.15)
    margin_x = int(w * 0.15)
    center = gray[margin_y:h - margin_y, margin_x:w - margin_x]
    nonwhite = np.sum(center < 200)
    return (nonwhite / center.size) > threshold


def _build_montage(
    non_empty: list[tuple[int, int, NDArray]],
    cols_per_row: int = 10,
) -> bytes:
    """Build a compact montage PNG from a flat list of (orig_row, orig_col, crop) tuples."""
    num_cells = len(non_empty)
    num_montage_rows = (num_cells + cols_per_row - 1) // cols_per_row

    sample = non_empty[0][2]
    native_h, native_w = sample.shape[:2]
    tile_size = min(64, native_h, native_w)
    border = 2
    label_h = 14
    cell_w = tile_size + border * 2
    cell_h = tile_size + border * 2 + label_h

    canvas_h = num_montage_rows * cell_h
    canvas_w = cols_per_row * cell_w
    canvas = np.ones((canvas_h, canvas_w, 3), dtype=np.uint8) * 255

    for idx, (orig_r, orig_c, cell) in enumerate(non_empty):
        mr = idx // cols_per_row
        mc = idx % cols_per_row
        x0 = mc * cell_w
        y0 = mr * cell_h

        label = f"{orig_r},{orig_c}"
        (tw, _), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1)
        label_x = x0 + (cell_w - tw) // 2
        cv2.putText(
            canvas, label, (label_x, y0 + label_h - 2),
            cv2.FONT_HERSHEY_SIMPLEX, 0.35, (200, 0, 0), 1,
        )

        bx0, by0 = x0, y0 + label_h
        bx1, by1 = x0 + cell_w - 1, y0 + cell_h - 1
        cv2.rectangle(canvas, (bx0, by0), (bx1, by1), (0, 0, 200), border)

        ch, cw = cell.shape[:2]
        if ch > tile_size or cw > tile_size:
            scale = min(tile_size / ch, tile_size / cw)
            resized = cv2.resize(cell, (int(cw * scale), int(ch * scale)))
        else:
            resized = cell
        if len(resized.shape) == 2:
            resized = cv2.cvtColor(resized, cv2.COLOR_GRAY2BGR)
        new_h, new_w = resized.shape[:2]
        dy = (tile_size - new_h) // 2
        dx = (tile_size - new_w) // 2
        py = by0 + border + dy
        px = bx0 + border + dx
        canvas[py:py + new_h, px:px + new_w] = resized

    img = Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ─── LLM dispatch ───


def _call_recognizer(recognizer: CellRecognizer, montage_bytes: bytes, prompt: str) -> list:
    """Send a pre-built montage image to the recognizer and get parsed JSON back."""
    import base64

    montage_image = Image.open(io.BytesIO(montage_bytes))

    if isinstance(recognizer, GeminiRecognizer):
        response = recognizer._model.generate_content([montage_image, prompt])
        return parse_json_response(response.text)
    elif isinstance(recognizer, ClaudeRecognizer):
        b64_image = base64.b64encode(montage_bytes).decode("utf-8")
        response = recognizer._client.messages.create(
            model=recognizer._model,
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64_image}},
                    {"type": "text", "text": prompt},
                ],
            }],
        )
        return parse_json_response(response.content[0].text)
    else:
        raise TypeError(f"Unsupported recognizer type: {type(recognizer).__name__}")


# ─── Main API ───


def classify_cells(
    recognizer: CellRecognizer,
    cell_crops: list[list[NDArray]],
    targets: list[TargetSpec],
    *,
    empty_threshold: float = 0.02,
) -> list[list[CellClassification]]:
    """Classify cell contents using LLM vision.

    Filters empty cells using a pixel heuristic, builds a compact montage of
    non-empty cells, sends to the LLM with a composable prompt built from
    the given target specs, and maps results back to the full grid.

    Args:
        recognizer: LLM vision backend (Gemini, Claude, etc.)
        cell_crops: 2D list of cell ROI images.
        targets: Which content types to detect.
        empty_threshold: Pixel density threshold for non-empty detection.

    Returns:
        2D list matching input dimensions, with a CellClassification per cell.
    """
    num_rows = len(cell_crops)
    if num_rows == 0:
        return []
    num_cols = len(cell_crops[0])
    if num_cols == 0:
        return []

    # Initialize grid with Empty
    grid: list[list[CellClassification]] = [[Empty()] * num_cols for _ in range(num_rows)]

    # Filter non-empty cells
    non_empty: list[tuple[int, int, NDArray]] = []
    for r in range(num_rows):
        for c in range(num_cols):
            if _is_cell_non_empty(cell_crops[r][c], threshold=empty_threshold):
                non_empty.append((r, c, cell_crops[r][c]))

    if not non_empty:
        return grid

    # Build montage and prompt
    montage_bytes = _build_montage(non_empty)
    prompt = _build_prompt(targets, len(non_empty))

    # Call LLM
    raw_results = _call_recognizer(recognizer, montage_bytes, prompt)

    if not isinstance(raw_results, list) or len(raw_results) != len(non_empty):
        raise ValueError(
            f"Expected {len(non_empty)} results, "
            f"got {len(raw_results) if isinstance(raw_results, list) else type(raw_results)}"
        )

    # Map back to grid
    for idx, (r, c, _) in enumerate(non_empty):
        grid[r][c] = _parse_result(raw_results[idx], targets)

    return grid
