"""Grid detection for fillomino puzzles with dashed internal lines.

Bridges the dashes with preprocess_dashed_lines(), then fits a uniform grid to
the ink projection (detect_uniform_grid) — the square-cell fact makes an exact
uniform grid more reliable than snapping to jittery detected peaks.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import (
    detect_uniform_grid,
    find_quadrilateral_border,
    preprocess_dashed_lines,
    warp_to_rectangle,
)


@dataclass
class FillominoGeometry:
    warped: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


def detect_fillomino_grid(
    image: NDArray, debug_dir: str | None = None
) -> FillominoGeometry:
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
    mask = preprocess_dashed_lines(warped_gray)
    h_lines, v_lines = detect_uniform_grid(
        warped_gray, warp_w, warp_h, preprocessed_mask=mask
    )

    rows = len(h_lines) - 1
    cols = len(v_lines) - 1
    cell_h = (h_lines[-1] - h_lines[0]) / rows if rows > 0 else 1.0
    cell_w = (v_lines[-1] - v_lines[0]) / cols if cols > 0 else 1.0

    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 180, 0), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (180, 0, 0), 1)
        cv2.imwrite(str(debug_path / "03_gridlines.png"), vis)

    return FillominoGeometry(
        warped=warped,
        rows=rows,
        cols=cols,
        h_lines=h_lines,
        v_lines=v_lines,
        cell_h=cell_h,
        cell_w=cell_w,
    )


