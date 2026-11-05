"""Ripple Effect grid detection.

A Ripple Effect board is a rectangular grid pre-divided into irregular rooms by
thick borders; the internal cell dividers are thin. Both are solid by design,
but real Nikoli scans degrade the thin dividers into faint, broken segments — so
we locate geometry with the shared ``find_grid_lines`` (lattice fit, tolerant
of broken lines), then classify each internal border as thick (room boundary)
or thin with the shared classifier, exactly like LITS / Heyawake.

These scans carry a title band above the board ("1 ... Easy") and a halftone
strip at the page margin; the shared ``find_quadrilateral_border`` rejects those
itself, so we call it directly like the other border-first parsers.
"""
from __future__ import annotations

from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import (
    find_grid_lines,
    rectify_board,
)



def detect_ripple_effect_grid(
    image: NDArray, debug_dir: str | None = None
) -> BoardGrid:
    """Detect the Ripple Effect grid: find border, warp, locate grid lines."""
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
    h_lines, v_lines = find_grid_lines(warped_gray)


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
