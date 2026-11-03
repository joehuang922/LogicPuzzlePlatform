"""Grid detection for yajilin puzzles.

Pipeline:
1. Find quadrilateral border and warp to rectangle
2. Detect solid grid lines via morphological projection
3. Compute cell geometry from detected lines
"""
from __future__ import annotations

from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import (
    rectify_board,
    detect_grid_lines,
)



def detect_yajilin_grid(
    image: NDArray,
    debug_dir: str | None = None,
) -> BoardGrid:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)


    # Step 1: Find border and warp
    board = rectify_board(image)
    warped = board.warped
    warp_h, warp_w = warped.shape[:2]
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


    return board.to_native(BoardGrid(
        warped=warped,
        warped_gray=warped_gray,
        h_lines=h_lines,
        v_lines=v_lines,
    ))
