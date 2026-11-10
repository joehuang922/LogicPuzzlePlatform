"""Picto Link grid detection — thin orchestrator over shared grid_utils.

Picto Link boards are a plain rectangular grid of square cells with no regions.

A photographed magazine page bows, and the 4-corner warp only removes
perspective: on the 25x25 sample the printed columns slant ~0.2 cell across the
board, so no straight line fits them and a ruling bar lands inside the digit
crop. ``rectify_board`` flattens the board (tracing the ink mask) before the
shared grid finder.

The rulings are printed in a single ink colour (red in the samples, but the
pipeline must not assume any particular hue). We therefore drive every geometry
step off :func:`ink_intensity` — the per-channel minimum — instead of luminance
grayscale, which loses a faint coloured line because the un-absorbed channel
pulls the weighted mean back toward paper-white. See ``ink_intensity`` for why.
"""
from __future__ import annotations

from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import (
    find_grid_lines,
    rectify_board,
    ink_intensity,
)



def detect_picto_link_grid(
    image: NDArray, debug_dir: str | None = None
) -> BoardGrid:
    """Detect the Picto Link grid: find the board, flatten it, find the lines."""
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    ink = ink_intensity(image)
    board = rectify_board(image, border_image=ink, debug_dir=debug_dir)
    warped, border_pts = board.warped, board.quad

    if debug_path:
        vis = image.copy()
        cv2.polylines(vis, [border_pts.astype(int)], True, (0, 255, 0), 3)
        cv2.imwrite(str(debug_path / "01_border.png"), vis)

    warp_h, warp_w = warped.shape[:2]

    if debug_path:
        cv2.imwrite(str(debug_path / "02_warped.png"), warped)

    warped_ink = ink_intensity(warped)
    h_lines, v_lines = find_grid_lines(warped_ink)

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
