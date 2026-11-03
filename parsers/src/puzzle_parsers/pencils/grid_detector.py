"""Grid detection for pencils puzzles using shared grid_utils.

Pipeline:
1. Find quadrilateral border and warp to rectangle
2. Preprocess dashed grid lines into solid mask
3. Fit the grid with the shared lattice detector (``detect_uniform_grid``).
   Counting projection peaks let the pencil-shaped clues add or drop a line
   whenever the board's scale changed.
"""
from __future__ import annotations

from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import (
    rectify_board,
    preprocess_dashed_lines,
    detect_uniform_grid,
)



def detect_pencils_grid(
    image: NDArray,
    debug_dir: str | None = None,
) -> BoardGrid:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)


    board = rectify_board(image)


    warped = board.warped
    warp_h, warp_w = warped.shape[:2]
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    if debug_path:
        cv2.imwrite(str(debug_path / "01_warped.png"), warped)

    dashed_mask = preprocess_dashed_lines(warped_gray)

    if debug_path:
        cv2.imwrite(str(debug_path / "02_dashed_mask.png"), dashed_mask)

    h_lines, v_lines = detect_uniform_grid(
        warped_gray, warp_w, warp_h, preprocessed_mask=dashed_mask
    )

    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 0, 255), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (255, 0, 0), 1)
        cv2.imwrite(str(debug_path / "03_grid_lines.png"), vis)

    return board.to_native(BoardGrid(
        warped=warped,
        warped_gray=warped_gray,
        h_lines=h_lines,
        v_lines=v_lines,
    ))

