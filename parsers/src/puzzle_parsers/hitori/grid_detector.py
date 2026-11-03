"""Hitori grid detection.

Hitori boards are a plain rectangular grid with no regions, and every cell holds
a printed number. The thin dividers are crisp solid rulings inside a thick outer
border, so we locate geometry with ``detect_grid_lines`` (morphological
projection for solid lines) and guard against an under-detected axis with
square-cell reconciliation.

The magazine pages photograph several puzzles at once: partial neighbouring
boards, a worked example, and black-boxed puzzle numbers all sit beside the
target grid. ``find_quadrilateral_border`` scores candidate quads by edge
support, so the largest fully bordered grid wins over the cropped neighbours.
"""
from __future__ import annotations

from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import (
    rectify_board,
    detect_grid_lines,
    reconcile_square_lines,
)



def detect_hitori_grid(
    image: NDArray, debug_dir: str | None = None
) -> BoardGrid:
    """Detect the Hitori grid: find border, warp, locate grid lines."""
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    board = rectify_board(image)

    warped, border_pts = board.warped, board.quad

    if debug_path:
        vis = image.copy()
        cv2.polylines(vis, [border_pts.astype(int)], True, (0, 255, 0), 3)
        cv2.imwrite(str(debug_path / "01_border.png"), vis)

    warp_h, warp_w = warped.shape[:2]

    if debug_path:
        cv2.imwrite(str(debug_path / "02_warped.png"), warped)

    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = detect_grid_lines(warped_gray, warp_w, warp_h)
    h_lines, v_lines = reconcile_square_lines(h_lines, v_lines, warp_h, warp_w)


    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 180, 0), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (180, 0, 0), 1)
        cv2.imwrite(str(debug_path / "03_gridlines.png"), vis)

    return board.to_native(BoardGrid(
        warped=warped, h_lines=h_lines, v_lines=v_lines,
    ))
