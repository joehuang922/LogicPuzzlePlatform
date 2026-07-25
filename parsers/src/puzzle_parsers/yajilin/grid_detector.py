"""Grid detection for yajilin puzzles.

Pipeline:
1. Find quadrilateral border and warp to rectangle
2. Detect solid grid lines via morphological projection
3. Compute cell geometry from detected lines
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
class YajilinGeometry:
    warped: NDArray
    warped_gray: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


def detect_yajilin_grid(
    image: NDArray,
    expected_rows: int | None = None,
    expected_cols: int | None = None,
    debug_dir: str | None = None,
) -> YajilinGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Step 1: Find border and warp
    border_pts = find_quadrilateral_border(gray)
    warped, warp_w, warp_h = warp_to_rectangle(image, border_pts)
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    if debug_path:
        cv2.imwrite(str(debug_path / "01_warped.png"), warped)

    # Step 2: Detect solid grid lines (no dashed preprocessing needed)
    h_lines, v_lines = detect_grid_lines(warped_gray, warp_w, warp_h)

    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 0, 255), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (255, 0, 0), 1)
        cv2.imwrite(str(debug_path / "02_grid_lines.png"), vis)

    # Determine dimensions from detected lines
    rows = len(h_lines) - 1
    cols = len(v_lines) - 1

    if expected_rows and rows != expected_rows:
        rows = expected_rows
        h_lines = _uniform_lines(h_lines[0], h_lines[-1], rows + 1)
    if expected_cols and cols != expected_cols:
        cols = expected_cols
        v_lines = _uniform_lines(v_lines[0], v_lines[-1], cols + 1)

    cell_h = (h_lines[-1] - h_lines[0]) / rows if rows > 0 else 50.0
    cell_w = (v_lines[-1] - v_lines[0]) / cols if cols > 0 else 50.0

    return YajilinGeometry(
        warped=warped,
        warped_gray=warped_gray,
        rows=rows,
        cols=cols,
        h_lines=h_lines,
        v_lines=v_lines,
        cell_h=cell_h,
        cell_w=cell_w,
    )


def _uniform_lines(start: int, end: int, count: int) -> list[int]:
    """Generate uniformly spaced lines between start and end."""
    return [int(start + i * (end - start) / (count - 1)) for i in range(count)]
