"""Grid detection for fillomino puzzles with dashed internal lines.

Bridges the dashes with preprocess_dashed_lines(), then fits a uniform grid to
the ink projection (detect_uniform_grid) — the square-cell fact makes an exact
uniform grid more reliable than snapping to jittery detected peaks.
"""
from __future__ import annotations

from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import (
    rectify_board,
    detect_uniform_grid,
    preprocess_dashed_lines,
)



def detect_fillomino_grid(
    image: NDArray, debug_dir: str | None = None
) -> BoardGrid:
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
    mask = preprocess_dashed_lines(warped_gray)
    h_lines, v_lines = detect_uniform_grid(
        warped_gray, warp_w, warp_h, preprocessed_mask=mask
    )


    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 180, 0), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (180, 0, 0), 1)
        cv2.imwrite(str(debug_path / "03_gridlines.png"), vis)

    return board.to_native(BoardGrid(
        warped=warped,
        h_lines=h_lines,
        v_lines=v_lines,
    ))


