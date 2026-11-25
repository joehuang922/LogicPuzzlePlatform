"""Half-Full Paint grid, wall and circle detection.

A rectangular grid of thin solid lines divided into rooms by thick walls, with white,
gray and black circles on edge midpoints and interior corners:

1. ``rectify_board`` (which flattens) finds the complete board; each photo also shows
   parts of other boards, and sample 1 the complete example board beside the puzzle.
2. ``find_grid_lines`` locates the grid.
3. ``classify_border_thickness`` reads the walls (circles sitting on walls don't upset it).
4. ``lattice_circles.probe_lattice_circles`` finds and colours the circles, as for Kuralin.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import classify_border_thickness, find_grid_lines, rectify_board
from puzzle_parsers.lattice_circles import DetectedCircle, probe_lattice_circles


@dataclass
class HalfFullPaintGeometry:
    grid: BoardGrid
    h_walls: list[list[int]]
    v_walls: list[list[int]]
    circles: list[DetectedCircle] = field(default_factory=list)


def detect_half_full_paint(image: NDArray, debug_dir: str | None = None) -> HalfFullPaintGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    board = rectify_board(image)
    warped, quad = board.warped, board.quad
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = find_grid_lines(warped_gray)
    grid = BoardGrid(warped=warped, h_lines=h_lines, v_lines=v_lines, quad=quad)
    h_walls, v_walls = classify_border_thickness(warped_gray, grid)
    circles = probe_lattice_circles(warped_gray, grid)

    if debug_path:
        vis = image.copy()
        cv2.polylines(vis, [quad.astype(int)], True, (0, 255, 0), 3)
        cv2.imwrite(str(debug_path / "01_border.png"), vis)
        vis = warped.copy()
        for r, row in enumerate(h_walls):
            for c, w in enumerate(row):
                if w:
                    cv2.line(vis, (v_lines[c], h_lines[r + 1]), (v_lines[c + 1], h_lines[r + 1]), (0, 200, 0), 6)
        for r, row in enumerate(v_walls):
            for c, w in enumerate(row):
                if w:
                    cv2.line(vis, (v_lines[c + 1], h_lines[r]), (v_lines[c + 1], h_lines[r + 1]), (0, 200, 0), 6)
        palette = [(255, 0, 0), (0, 0, 255), (0, 160, 255)]
        for circle in circles:
            x, y = grid.point(circle.dr, circle.dc)
            cv2.circle(vis, (int(x), int(y)), int(0.25 * grid.cell_w), palette[circle.color], 4)
        cv2.imwrite(str(debug_path / "02_walls_circles.png"), vis)

    return HalfFullPaintGeometry(
        grid=board.to_native(grid), h_walls=h_walls, v_walls=v_walls, circles=circles
    )
