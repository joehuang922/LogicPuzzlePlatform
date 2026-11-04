"""Grid + dot detection for Tentai Show (Spiral Galaxies).

Design (see docs/tentaishow/tentaishow.md, "Puzzle Parser"):

The question image contains no walls/numbers — only dots. So the parser needs
(1) the cell counts and (2) precise sub-cell dot positions. Because a dot can
sit at a cell center, edge midpoint, or grid corner, grid geometry must be very
accurate: the corner/edge decision boundary is only +/- 1/4 pitch.

Two phases:

Phase 1 — rectify (find the board, warp to an axis-aligned rectangle):
1. Find the outer-border quadrilateral and perspective-warp it to a rectangle.
   The shared ``find_quadrilateral_border`` captures slight skew on a clean scan
   and, on a dashed/broken border where no closed contour forms, rejects a
   title-strip-contaminated quad via edge-support scoring and falls back to a
   dark-pixel projection box. Either way the output is a rectified board.

Phase 2 — parse the board:
2. Find the grid lines with the shared ``find_grid_lines``.
3. Test every centre, edge midpoint and corner for a printed ring (shared
   ``ring_probe``) and classify open/filled by the inner disk.
4. The parser snaps each dot to the nearest doubled coordinate through the
   found lines (``BoardGrid.doubled``).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import find_grid_lines, rectify_board
from puzzle_parsers.ring_probe import RING_SUPPORT, fill_ratio, probe_ring

# Inner-disk brightness / paper brightness below which a dot is filled. Filled
# (halftone) dots measure 0.29-0.36 and open dots 0.99-1.0 on the samples.
FILLED_MAX = 0.65


@dataclass
class DetectedDot:
    cx: float
    cy: float
    color: int  # 0 = open/white, 1 = filled/black


@dataclass
class TentaishowGeometry:
    grid: BoardGrid
    dots: list[DetectedDot] = field(default_factory=list)

    @property
    def rows(self) -> int:
        return self.grid.rows

    @property
    def cols(self) -> int:
        return self.grid.cols


def detect_tentaishow_grid(
    image: NDArray, debug_dir: str | None = None
) -> TentaishowGeometry:
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
    dots = _detect_dots(warped_gray, grid)

    if debug_path:
        vis = warped.copy()
        for d in dots:
            col = (0, 0, 255) if d.color == 1 else (255, 0, 0)
            cv2.circle(vis, (int(d.cx), int(d.cy)), 6, col, 2)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (0, 180, 0), 1)
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 180, 0), 1)
        cv2.imwrite(str(debug_path / "04_grid_dots.png"), vis)

    return TentaishowGeometry(grid=grid, dots=dots)


def _detect_dots(warped_gray: NDArray, grid: BoardGrid) -> list[DetectedDot]:
    """Probe every lattice point (centre, edge midpoint, corner) for a dot."""
    pitch = min(grid.cell_w, grid.cell_h)
    dots: list[DetectedDot] = []
    for dr in range(1, 2 * grid.rows):
        for dc in range(1, 2 * grid.cols):
            ring = probe_ring(warped_gray, *grid.point(dr, dc), pitch)
            if ring.support < RING_SUPPORT:
                continue
            filled = fill_ratio(warped_gray, ring.cx, ring.cy, pitch) < FILLED_MAX
            dots.append(DetectedDot(cx=ring.cx, cy=ring.cy, color=int(filled)))
    return dots
