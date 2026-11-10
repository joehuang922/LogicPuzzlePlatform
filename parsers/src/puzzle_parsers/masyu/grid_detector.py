"""Grid detection for masyu: the shared board finder, flattening and grid finder.

Masyu boards come as flat scans, big scans whose lines sit ~0.1 cell off an
even grid, and phone photos of a curved page. ``rectify_board`` flattens
the last two (on a straight grid a black circle's rim poked into the cell above
and read as a white circle); ``find_grid_lines`` then finds the lines.
"""
from __future__ import annotations

from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import find_grid_lines, rectify_board


def detect_masyu_grid(image: NDArray, debug_dir: str | None = None) -> BoardGrid:
    board = rectify_board(image, debug_dir=debug_dir)
    warped_gray = cv2.cvtColor(board.warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = find_grid_lines(warped_gray)
    grid = board.to_native(BoardGrid(warped=board.warped, h_lines=h_lines, v_lines=v_lines))

    if debug_dir:
        vis = grid.warped.copy()
        for y in grid.h_lines:
            cv2.line(vis, (0, y), (vis.shape[1], y), (0, 0, 255), 2)
        for x in grid.v_lines:
            cv2.line(vis, (x, 0), (x, vis.shape[0]), (255, 0, 0), 2)
        Path(debug_dir).mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(Path(debug_dir) / "03_grid_lines.png"), vis)
    return grid
