"""Kakuro grid detection: the shared border finder, warp and line detection.

Kakuro once found its border from Hough grid lines, because rows of black cells
along the edge defeated the old contour search. The shared multi-scale,
edge-support-scored finder now handles every sample (same grid, same black-cell
map, and it keeps the perspective the axis-aligned Hough box dropped).
"""
from __future__ import annotations


import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import (
    rectify_board,
    detect_grid_lines,
)



def detect_kakuro_grid(
    img: NDArray, debug_dir: str | None = None
) -> BoardGrid:

    board = rectify_board(img)

    warped = board.warped

    warp_h, warp_w = warped.shape[:2]
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    h_lines, v_lines = detect_grid_lines(warped_gray, warp_w, warp_h)



    return board.to_native(BoardGrid(
        warped=warped,
        h_lines=h_lines,
        v_lines=v_lines,
    ))

