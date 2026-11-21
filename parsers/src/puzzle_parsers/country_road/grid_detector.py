"""Board and grid of a Country Road photo.

Solid thin lines, thick room walls and a thick border: the shared ``rectify_board``
(flattened) and ``find_grid_lines``. Every sample also shows part of a neighbouring
board above or below; the border finder takes the complete one. Walls are read by the
parser with the shared ``classify_border_thickness``.
"""
from __future__ import annotations

from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import find_grid_lines, rectify_board


def detect_country_road(image: NDArray, debug_dir: str | None = None) -> BoardGrid:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)
    board = rectify_board(image, debug_dir=debug_dir)
    warped_gray = cv2.cvtColor(board.warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = find_grid_lines(warped_gray)
    grid = board.to_native(BoardGrid(warped=board.warped, h_lines=h_lines, v_lines=v_lines, quad=board.quad))
    if debug_path:
        vis = grid.warped.copy()
        for y in grid.h_lines:
            cv2.line(vis, (0, int(y)), (vis.shape[1], int(y)), (0, 0, 200), 1)
        for x in grid.v_lines:
            cv2.line(vis, (int(x), 0), (int(x), vis.shape[0]), (200, 0, 0), 1)
        cv2.imwrite(str(debug_path / "01_grid.png"), vis)
    return grid
