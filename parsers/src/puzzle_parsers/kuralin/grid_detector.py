"""Grid + circle detection for Kuralin.

Design (see docs/kuralin/kuralin.md, "Puzzle Parser"):

The board is a dashed grid with white, black, and gray (halftone) circles. Every
circle sits on a grid line — an edge midpoint or an interior corner — so the
set of places a circle can be is a small, known lattice once the grid is found.

1. Find the outer-border quadrilateral and warp it to a rectangle (shared
   ``find_quadrilateral_border``; on a page with a small worked example above
   the puzzle it picks the main board, the largest quadrilateral).
2. Find the grid lines with the shared ``find_grid_lines``.
3. Probe every edge midpoint and interior corner for a circle and classify its
   colour: the shared ``lattice_circles.probe_lattice_circles`` (also used by
   Half-Full Paint).
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
class KuralinGeometry:
    grid: BoardGrid
    circles: list[DetectedCircle] = field(default_factory=list)

    @property
    def rows(self) -> int:
        return self.grid.rows

    @property
    def cols(self) -> int:
        return self.grid.cols


def detect_kuralin_grid(
    image: NDArray, debug_dir: str | None = None
) -> KuralinGeometry:
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
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    if debug_path:
        cv2.imwrite(str(debug_path / "02_warped.png"), warped)

    h_lines, v_lines = find_grid_lines(warped_gray)
    grid = BoardGrid(warped=warped, h_lines=h_lines, v_lines=v_lines, quad=border_pts)
    circles = probe_lattice_circles(warped_gray, grid)

    if debug_path:
        vis = warped.copy()
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (0, 180, 0), 1)
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 180, 0), 1)
        palette = [(255, 0, 0), (0, 0, 255), (0, 160, 255)]
        for c in circles:
            x, y = grid.point(c.dr, c.dc)
            cv2.circle(vis, (int(x), int(y)), int(0.3 * grid.cell_w), palette[c.color], 3)
        cv2.imwrite(str(debug_path / "03_grid_circles.png"), vis)

    return KuralinGeometry(grid=grid, circles=circles)
