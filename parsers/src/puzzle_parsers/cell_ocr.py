"""Shared cell-clue OCR for every EasyOCR-backed grid parser.

All of our sources print clues in the same Nikoli font, so every parser crops
cells and reads them the same way. The only per-puzzle settings are the
puzzle's clue rules, never OCR tuning:

- ``allow_multi_digits``: a clue may have two-plus digits (``10``). Off only
  where clues are single digits by definition (sudoku, akari, slitherlink...).
- ``allow_zero``: ``0`` is a real clue (heyawake, slitherlink, akari). Empty
  cells then read ``-1``; otherwise empty is ``0``.
- ``max_value``: the largest single-digit clue (akari 4, slitherlink 3).
  Narrowing the allowlist stops look-alikes outside the range (``1`` -> ``7``).

The crop trims less horizontally than vertically: a two-digit clue such as
``10`` is printed nearly cell-wide, and a symmetric 20% trim cut its ``0`` off.
The confidence floor drops grid-line fragments and smudges that would
otherwise surface as ghost clues.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Sequence

import numpy as np
from numpy.typing import NDArray

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend

CELL_MARGIN_Y = 0.15
CELL_MARGIN_X = 0.10
MIN_CONFIDENCE = 0.2


def crop_cell(image: NDArray, y1: float, y2: float, x1: float, x2: float) -> NDArray:
    """Inner crop of the cell bounded by ``y1..y2`` / ``x1..x2``.

    Clamped to the image; a degenerate crop becomes a small white patch so the
    recognizer reads it as empty instead of failing.
    """
    h, w = image.shape[:2]
    my = int((y2 - y1) * CELL_MARGIN_Y)
    mx = int((x2 - x1) * CELL_MARGIN_X)
    cy1, cy2 = max(0, int(y1) + my), min(h, int(y2) - my)
    cx1, cx2 = max(0, int(x1) + mx), min(w, int(x2) - mx)
    roi = image[cy1:cy2, cx1:cx2]
    if roi.size == 0:
        shape = (10, 10) if image.ndim == 2 else (10, 10, image.shape[2])
        roi = np.full(shape, 255, dtype=np.uint8)
    return roi


def crop_grid_cells(
    image: NDArray, h_lines: Sequence[float], v_lines: Sequence[float]
) -> list[list[NDArray]]:
    """Crop every cell of the grid whose lines are ``h_lines`` / ``v_lines``."""
    return [
        [
            crop_cell(image, h_lines[r], h_lines[r + 1], v_lines[c], v_lines[c + 1])
            for c in range(len(v_lines) - 1)
        ]
        for r in range(len(h_lines) - 1)
    ]


def read_cells(
    ocr: OcrBackend | None,
    cell_rois: list[list[NDArray]],
    *,
    allow_multi_digits: bool,
    allow_zero: bool = False,
    max_value: int | None = None,
) -> list[list[int]]:
    """Read one clue per crop (dark digits on a light ground).

    Empty or unreadable cells are ``0``, or ``-1`` when ``allow_zero``.
    """
    empty = -1 if allow_zero else 0
    if ocr is None:
        return [[empty] * len(row) for row in cell_rois]
    low = 0 if allow_zero else 1
    high = 9 if allow_multi_digits or max_value is None else min(9, max_value)
    if allow_multi_digits:
        allowlist = "0123456789"
    else:
        allowlist = "".join(str(d) for d in range(low, high + 1))
    raw = ocr.recognize_cells(
        cell_rois,
        multi_digit=allow_multi_digits,
        min_confidence=MIN_CONFIDENCE,
        allowlist=allowlist,
    )

    def clean(v: int) -> int:
        if v < low or (max_value is not None and v > max_value):
            return empty
        return v

    return [[clean(v) for v in row] for row in raw]


def read_grid_clues(
    ocr: OcrBackend | None,
    image: NDArray,
    h_lines: Sequence[float],
    v_lines: Sequence[float],
    *,
    allow_multi_digits: bool,
    allow_zero: bool = False,
    max_value: int | None = None,
) -> list[list[int]]:
    """Crop and read every cell of a grid in one batch."""
    rois = crop_grid_cells(image, h_lines, v_lines)
    return read_cells(
        ocr, rois, allow_multi_digits=allow_multi_digits,
        allow_zero=allow_zero, max_value=max_value,
    )
