"""Tetro Chain K grid and circle detection.

A rectangular grid of thin solid lines in a solid border, no rooms, with white, gray and
black circles on edge midpoints and interior corners (Kuralin's circles):

1. ``rectify_board`` (which flattens) finds the board. On sample 4 the previous puzzle's
   bottom border lies right above this board on the same columns; the shared projection
   box skips the blank gap between them (``grid_utils._skip_blank_gaps``).
2. ``find_grid_lines`` locates the grid.
3. ``lattice_circles.probe_lattice_circles`` finds and colours the circles.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import find_grid_lines, rectify_board
from puzzle_parsers.lattice_circles import DetectedCircle, probe_lattice_circles


@dataclass
class TetroChainKGeometry:
    grid: BoardGrid
    circles: list[DetectedCircle] = field(default_factory=list)


def detect_tetro_chain_k(image: NDArray, debug_dir: str | None = None) -> TetroChainKGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    board = rectify_board(image)
    warped_gray = cv2.cvtColor(board.warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = find_grid_lines(warped_gray)
    grid = BoardGrid(warped=board.warped, h_lines=h_lines, v_lines=v_lines, quad=board.quad)
    circles = probe_lattice_circles(warped_gray, grid)

    if debug_path:
        vis = image.copy()
        cv2.polylines(vis, [board.quad.astype(int)], True, (0, 255, 0), 3)
        cv2.imwrite(str(debug_path / "01_border.png"), vis)
        vis = board.warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (vis.shape[1], y), (0, 180, 0), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, vis.shape[0]), (0, 180, 0), 1)
        palette = [(255, 0, 0), (0, 0, 255), (0, 160, 255)]
        for k in circles:
            x, y = grid.point(k.dr, k.dc)
            cv2.circle(vis, (int(x), int(y)), int(0.25 * grid.cell_w), palette[k.color], 4)
        cv2.imwrite(str(debug_path / "02_grid_circles.png"), vis)

    return TetroChainKGeometry(grid=board.to_native(grid), circles=circles)
