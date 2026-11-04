"""Shakashaka grid detection — uses shared grid_utils."""
from __future__ import annotations


import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import (
    find_grid_lines,
    rectify_board,
)



def detect_shakashaka_grid(
    img: NDArray, debug_dir: str | None = None
) -> BoardGrid:
    board = rectify_board(img)
    warped, quad = board.warped, board.quad
    warp_h, warp_w = warped.shape[:2]
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    h_lines, v_lines = find_grid_lines(warped_gray)



    return board.to_native(BoardGrid(
        warped=warped,
        h_lines=h_lines,
        v_lines=v_lines,
        quad=quad,
    ))
