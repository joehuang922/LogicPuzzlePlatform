"""Grid + circle detection for Kuralin.

Design (see docs/kuralin/kuralin.md, "Puzzle Parser"):

The board is a dashed grid with white, black, and gray (halftone) circles. Every
circle sits on a grid line — an edge midpoint or an interior corner — so the
set of places a circle can be is a small, known lattice once the grid is found.

1. Find the outer-border quadrilateral and warp it to a rectangle (shared
   ``find_quadrilateral_border``; on a page with a small worked example above
   the puzzle it picks the main board, the largest quadrilateral).
2. Find the grid lines with the shared ``find_grid_lines``.
3. Probe every lattice point with at least one even doubled coordinate for a
   printed ring (shared ``ring_probe``). Probing replaces Hough: HoughCircles (as used by Tentai Show)
   missed a gray circle whose halftone fill and touching dashes defeated both
   the gradient vote and the contour fallback, while a ring test at a known
   center finds it. A dashed crossing has ink on only ~4 perimeter samples, so
   it never passes the ring test.
4. Classify each circle by its inner-disk brightness relative to the paper:
   white ~1.0, gray halftone ~0.6-0.8, black <0.3.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import find_grid_lines, rectify_board
from puzzle_parsers.ring_probe import RING_SUPPORT, fill_ratio, probe_ring

# Inner-disk brightness / paper brightness thresholds for color.
BLACK_MAX = 0.40
WHITE_MIN = 0.90


@dataclass
class DetectedCircle:
    dr: int
    dc: int
    color: int  # 0 = white, 1 = black, 2 = gray


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
    circles = _probe_circles(warped_gray, grid)

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


def _probe_circles(gray: NDArray, grid: BoardGrid) -> list[DetectedCircle]:
    """Test every valid lattice point (edge midpoint or interior corner) for a circle."""
    pitch = min(grid.cell_w, grid.cell_h)
    circles: list[DetectedCircle] = []
    for dr in range(1, 2 * grid.rows):
        for dc in range(1, 2 * grid.cols):
            if dr % 2 == 1 and dc % 2 == 1:
                continue
            x0, y0 = grid.point(dr, dc)
            ring = probe_ring(gray, x0, y0, pitch)
            if ring.support < RING_SUPPORT:
                continue
            ratio = fill_ratio(gray, ring.cx, ring.cy, pitch)
            circles.append(DetectedCircle(dr=dr, dc=dc, color=_color(ratio)))
    return circles


def _color(ratio: float) -> int:
    """0 = white, 1 = black, 2 = gray, from the inner disk's brightness ratio."""
    if ratio < BLACK_MAX:
        return 1
    if ratio > WHITE_MIN:
        return 0
    return 2
