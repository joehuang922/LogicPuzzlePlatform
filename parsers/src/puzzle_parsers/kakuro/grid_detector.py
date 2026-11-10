"""Kakuro grid detection: the shared board finder, flattening and grid finder.

The big Nikoli scans lean (~0.36 cell top to bottom) and bow, and their border
sits behind a heavy frame next to the page gutter, so no straight grid fits
them; ``rectify_board`` flattens them first. Flat boards pass through
unchanged.
"""
from __future__ import annotations

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import find_grid_lines, rectify_board


def detect_kakuro_grid(img: NDArray, debug_dir: str | None = None) -> BoardGrid:
    board = rectify_board(img, debug_dir=debug_dir)
    warped_gray = cv2.cvtColor(board.warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = find_grid_lines(warped_gray)
    return board.to_native(BoardGrid(warped=board.warped, h_lines=h_lines, v_lines=v_lines))
