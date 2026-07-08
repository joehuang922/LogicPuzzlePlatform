"""Nurimaze grid detection — thin orchestrator over shared grid_utils."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import (
    classify_border_thickness,
    detect_grid_lines,
    find_quadrilateral_border,
    warp_to_rectangle,
)


@dataclass
class NurimazeGeometry:
    warped: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


def detect_nurimaze_grid(
    image: NDArray, debug_dir: str | None = None
) -> NurimazeGeometry:
    """Detect the nurimaze grid: find border, warp, locate grid lines."""
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    border_pts = find_quadrilateral_border(gray)

    if debug_path:
        vis = image.copy()
        cv2.polylines(vis, [border_pts.astype(int)], True, (0, 255, 0), 3)
        cv2.imwrite(str(debug_path / "01_border.png"), vis)

    warped, warp_w, warp_h = warp_to_rectangle(image, border_pts)

    if debug_path:
        cv2.imwrite(str(debug_path / "02_warped.png"), warped)

    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = detect_grid_lines(warped_gray, warp_w, warp_h)

    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 180, 0), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (180, 0, 0), 1)
        cv2.imwrite(str(debug_path / "03_gridlines.png"), vis)

    rows = len(h_lines) - 1
    cols = len(v_lines) - 1
    cell_h = (h_lines[-1] - h_lines[0]) / rows if rows > 0 else 1.0
    cell_w = (v_lines[-1] - v_lines[0]) / cols if cols > 0 else 1.0

    return NurimazeGeometry(
        warped=warped, rows=rows, cols=cols,
        h_lines=h_lines, v_lines=v_lines,
        cell_h=cell_h, cell_w=cell_w,
    )


def classify_borders(
    warped_gray: NDArray, geom: NurimazeGeometry, debug_dir: str | None = None
) -> tuple[list[list[int]], list[list[int]]]:
    """Classify each internal border as thick (1) or thin (0)."""
    debug_path = Path(debug_dir) if debug_dir else None

    h_borders, v_borders = classify_border_thickness(
        warped_gray, geom.h_lines, geom.v_lines, geom.rows, geom.cols
    )

    if debug_path:
        vis = geom.warped.copy()
        rows, cols = geom.rows, geom.cols
        for r in range(rows - 1):
            for c in range(cols):
                if h_borders[r][c] == 1:
                    y = geom.h_lines[r + 1]
                    x1 = geom.v_lines[c]
                    x2 = geom.v_lines[c + 1]
                    cv2.line(vis, (x1, y), (x2, y), (0, 0, 255), 2)
        for r in range(rows):
            for c in range(cols - 1):
                if v_borders[r][c] == 1:
                    x = geom.v_lines[c + 1]
                    y1 = geom.h_lines[r]
                    y2 = geom.h_lines[r + 1]
                    cv2.line(vis, (x, y1), (x, y2), (255, 0, 0), 2)
        cv2.imwrite(str(debug_path / "04_thick_borders.png"), vis)

    return h_borders, v_borders
