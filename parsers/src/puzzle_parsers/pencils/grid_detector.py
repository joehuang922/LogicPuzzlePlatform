"""Grid detection for pencils puzzles using shared grid_utils.

Pipeline:
1. Find quadrilateral border and warp to rectangle
2. Preprocess dashed grid lines into solid mask
3. Detect grid lines via morphological projection
4. Compute cell centers from detected lines
"""
from __future__ import annotations

from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import (
    find_quadrilateral_border,
    warp_to_rectangle,
    preprocess_dashed_lines,
    detect_grid_lines,
)



def detect_pencils_grid(
    image: NDArray,
    debug_dir: str | None = None,
) -> BoardGrid:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    border_pts = find_quadrilateral_border(gray)
    warped, warp_w, warp_h = warp_to_rectangle(image, border_pts)
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    if debug_path:
        cv2.imwrite(str(debug_path / "01_warped.png"), warped)

    dashed_mask = preprocess_dashed_lines(warped_gray)

    if debug_path:
        cv2.imwrite(str(debug_path / "02_dashed_mask.png"), dashed_mask)

    h_lines, v_lines = detect_grid_lines(
        warped_gray, warp_w, warp_h, preprocessed_mask=dashed_mask
    )

    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 0, 255), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (255, 0, 0), 1)
        cv2.imwrite(str(debug_path / "03_grid_lines.png"), vis)

    rows = len(h_lines) - 1
    cols = len(v_lines) - 1

    # Always use uniform spacing — the grid cells are evenly distributed
    h_lines = _uniform_lines(h_lines[0], h_lines[-1], rows + 1)
    v_lines = _uniform_lines(v_lines[0], v_lines[-1], cols + 1)


    return BoardGrid(
        warped=warped,
        warped_gray=warped_gray,
        h_lines=h_lines,
        v_lines=v_lines,
    )


def _uniform_lines(start: int, end: int, count: int) -> list[int]:
    """Generate uniformly spaced lines between start and end."""
    return [int(start + i * (end - start) / (count - 1)) for i in range(count)]
