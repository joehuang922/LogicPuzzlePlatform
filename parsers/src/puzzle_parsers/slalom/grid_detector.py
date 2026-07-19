"""Grid detection for slalom puzzles.

Pipeline:
1. Find quadrilateral border and warp to rectangle
2. Detect grid lines via morphological projection
3. Classify cells as wall (black) or empty (white) using intensity
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import (
    find_quadrilateral_border,
    warp_to_rectangle,
    detect_grid_lines,
)


@dataclass
class SlalomGeometry:
    warped: NDArray
    warped_gray: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


def detect_slalom_grid(
    image: NDArray,
    expected_rows: int | None = None,
    expected_cols: int | None = None,
    debug_dir: str | None = None,
) -> SlalomGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    border_pts = find_quadrilateral_border(gray)
    warped, warp_w, warp_h = warp_to_rectangle(image, border_pts)
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    if debug_path:
        cv2.imwrite(str(debug_path / "01_warped.png"), warped)

    h_lines, v_lines = detect_grid_lines(warped_gray, warp_w, warp_h)

    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 0, 255), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (255, 0, 0), 1)
        cv2.imwrite(str(debug_path / "02_grid_lines.png"), vis)

    rows = len(h_lines) - 1
    cols = len(v_lines) - 1

    if expected_rows and rows != expected_rows:
        rows = expected_rows
    if expected_cols and cols != expected_cols:
        cols = expected_cols

    h_lines = _uniform_lines(h_lines[0], h_lines[-1], rows + 1)
    v_lines = _uniform_lines(v_lines[0], v_lines[-1], cols + 1)

    cell_h = (h_lines[-1] - h_lines[0]) / rows if rows > 0 else 50.0
    cell_w = (v_lines[-1] - v_lines[0]) / cols if cols > 0 else 50.0

    return SlalomGeometry(
        warped=warped,
        warped_gray=warped_gray,
        rows=rows,
        cols=cols,
        h_lines=h_lines,
        v_lines=v_lines,
        cell_h=cell_h,
        cell_w=cell_w,
    )


def classify_walls(
    warped_gray: NDArray,
    geom: SlalomGeometry,
    threshold: float = 0.4,
) -> list[list[int]]:
    """Classify cells as wall (1) or empty (0) based on pixel intensity.

    A cell is a wall if the fraction of dark pixels in its central region
    exceeds the threshold.
    """
    rows, cols = geom.rows, geom.cols
    cells = [[0] * cols for _ in range(rows)]

    for r in range(rows):
        for c in range(cols):
            y1 = geom.h_lines[r]
            y2 = geom.h_lines[r + 1]
            x1 = geom.v_lines[c]
            x2 = geom.v_lines[c + 1]

            h = y2 - y1
            w = x2 - x1
            margin_y = int(h * 0.2)
            margin_x = int(w * 0.2)
            center = warped_gray[y1 + margin_y:y2 - margin_y, x1 + margin_x:x2 - margin_x]

            if center.size == 0:
                continue

            dark_ratio = np.sum(center < 128) / center.size
            if dark_ratio > threshold:
                cells[r][c] = 1

    return cells


def _uniform_lines(start: int, end: int, count: int) -> list[int]:
    """Generate uniformly spaced lines between start and end."""
    return [int(start + i * (end - start) / (count - 1)) for i in range(count)]
