"""Symbol classifiers for nurimaze cells.

Two implementations:
- CvSymbolClassifier: heuristic-based (ink ratio, hull circularity, polygon approx)
- GeminiSymbolClassifier: vision LLM via cropped cell montage
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.nurimaze.grid_detector import NurimazeGeometry
from puzzle_parsers.vision_utils import cells_to_png_bytes, parse_json_response


class SymbolClassifier(ABC):
    @abstractmethod
    def classify(
        self,
        warped_gray: NDArray,
        geom: NurimazeGeometry,
        debug_dir: str | None = None,
    ) -> list[list[int]]:
        """Classify symbols in each cell: 0=empty, 1=circle, 2=triangle, 3=S, 4=G."""
        ...


class CvSymbolClassifier(SymbolClassifier):
    """Heuristic-based symbol classifier using CV features."""

    def classify(
        self,
        warped_gray: NDArray,
        geom: NurimazeGeometry,
        debug_dir: str | None = None,
    ) -> list[list[int]]:
        debug_path = Path(debug_dir) if debug_dir else None
        rows, cols = geom.rows, geom.cols
        cells = [[0] * cols for _ in range(rows)]

        margin_ratio = 0.2

        if debug_path:
            vis = geom.warped.copy()

        for r in range(rows):
            for c in range(cols):
                y1 = geom.h_lines[r]
                y2 = geom.h_lines[r + 1]
                x1 = geom.v_lines[c]
                x2 = geom.v_lines[c + 1]

                cell_h = y2 - y1
                cell_w = x2 - x1
                my = int(cell_h * margin_ratio)
                mx = int(cell_w * margin_ratio)

                roi = warped_gray[y1 + my: y2 - my, x1 + mx: x2 - mx]
                if roi.size == 0:
                    continue

                symbol = _classify_cell_symbol(roi)
                cells[r][c] = symbol

                if debug_path and symbol > 0:
                    label = {1: "O", 2: "T", 3: "S", 4: "G"}[symbol]
                    cx = (x1 + x2) // 2
                    cy = (y1 + y2) // 2
                    cv2.putText(vis, label, (cx - 8, cy + 5),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

        if debug_path:
            cv2.imwrite(str(debug_path / "05_symbols.png"), vis)

        return cells


class GeminiSymbolClassifier(SymbolClassifier):
    """Vision LLM-based classifier using Google Gemini."""

    def __init__(self, client=None, model: str = "gemini-2.5-flash") -> None:
        import os

        import google.generativeai as genai

        if client is not None:
            self._model = client
        else:
            api_key = os.environ.get("GEMINI_API_KEY")
            if api_key:
                genai.configure(api_key=api_key)
            self._model = genai.GenerativeModel(model)

    def classify(
        self,
        warped_gray: NDArray,
        geom: NurimazeGeometry,
        debug_dir: str | None = None,
    ) -> list[list[int]]:
        from PIL import Image

        debug_path = Path(debug_dir) if debug_dir else None
        rows, cols = geom.rows, geom.cols
        margin_ratio = 0.2

        # Crop each cell
        cell_crops: list[list[NDArray]] = []
        for r in range(rows):
            row_crops: list[NDArray] = []
            for c in range(cols):
                y1 = geom.h_lines[r]
                y2 = geom.h_lines[r + 1]
                x1 = geom.v_lines[c]
                x2 = geom.v_lines[c + 1]

                cell_h = y2 - y1
                cell_w = x2 - x1
                my = int(cell_h * margin_ratio)
                mx = int(cell_w * margin_ratio)

                roi = warped_gray[y1 + my: y2 - my, x1 + mx: x2 - mx]
                row_crops.append(roi)
            cell_crops.append(row_crops)

        # Build montage
        png_bytes = cells_to_png_bytes(cell_crops)

        if debug_path:
            debug_path.mkdir(parents=True, exist_ok=True)
            (debug_path / "05_montage.png").write_bytes(png_bytes)

        # Send to Gemini
        montage_image = Image.open(__import__("io").BytesIO(png_bytes))

        prompt = (
            "This image shows a grid of cells cropped from a nurimaze puzzle. "
            "Each cell is labeled with its row,col position. "
            "Classify each cell as one of:\n"
            "- 0: empty (no symbol)\n"
            "- 1: circle (hollow ring)\n"
            "- 2: triangle (hollow triangle)\n"
            "- 3: S (the letter S, marking the start)\n"
            "- 4: G (the letter G, marking the goal)\n\n"
            f"The grid has {rows} rows and {cols} columns. "
            "Respond with ONLY a JSON array of arrays (rows x cols of integers). "
            f"Example for a 3x3 grid: [[0,0,1],[3,0,0],[0,4,2]]. No explanation, just the JSON."
        )

        response = self._model.generate_content([montage_image, prompt])
        cells = parse_json_response(response.text)

        # Validate dimensions
        if not isinstance(cells, list) or len(cells) != rows:
            raise ValueError(
                f"Expected {rows} rows from Gemini, got {len(cells) if isinstance(cells, list) else type(cells)}"
            )
        for r, row in enumerate(cells):
            if not isinstance(row, list) or len(row) != cols:
                raise ValueError(
                    f"Expected {cols} cols in row {r}, got {len(row) if isinstance(row, list) else type(row)}"
                )

        return cells


# --- CV heuristic helpers ---


def _classify_cell_symbol(roi: NDArray) -> int:
    """Classify a single cell ROI into 0/1/2/3/4."""
    _, binary = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    ink_ratio = np.count_nonzero(binary) / binary.size
    if ink_ratio < 0.04:
        return 0

    if ink_ratio > 0.25:
        return _classify_text_symbol(binary)

    if ink_ratio > 0.05:
        return _classify_hollow_symbol(roi, binary)

    return 0


def _classify_text_symbol(binary: NDArray) -> int:
    """Distinguish S from G in a filled text region."""
    h, w = binary.shape

    bar_region_start = int(h * 0.55)
    bar_region_end = int(h * 0.7)
    right_bar = binary[bar_region_start:bar_region_end, w * 3 // 4:]
    bar_ink = np.count_nonzero(right_bar) / (right_bar.size + 1)

    if bar_ink > 0.25:
        return 4  # G

    return 3  # S


def _classify_hollow_symbol(roi: NDArray, binary: NDArray) -> int:
    """Distinguish circle from triangle in a hollow outline."""
    h, w = roi.shape

    points = np.column_stack(np.nonzero(binary))
    if len(points) < 10:
        return 0

    hull = cv2.convexHull(points)
    hull_area = cv2.contourArea(hull)
    hull_perimeter = cv2.arcLength(hull, True)

    if hull_perimeter == 0:
        return 0

    hull_circularity = 4 * np.pi * hull_area / (hull_perimeter * hull_perimeter)

    if hull_circularity > 0.78:
        return 1  # circle

    approx = cv2.approxPolyDP(hull, 0.05 * hull_perimeter, True)
    if len(approx) == 3:
        return 2  # triangle

    approx_loose = cv2.approxPolyDP(hull, 0.08 * hull_perimeter, True)
    if len(approx_loose) == 3:
        return 2  # triangle

    if hull_circularity < 0.75 and len(approx) <= 5:
        return 2  # triangle

    blurred = cv2.GaussianBlur(roi, (5, 5), 0)
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min(h, w) // 2,
        param1=60,
        param2=20,
        minRadius=min(h, w) // 8,
        maxRadius=min(h, w) // 2,
    )
    if circles is not None and len(circles[0]) > 0:
        return 1  # circle

    return 0
