"""Circle clues on grid lines: white, black and gray (halftone) circles at edge midpoints
and interior corners, as Kuralin and Half-Full Paint print them.

Once the grid is found, the places a circle can be form a small known lattice: every point
with at least one even doubled coordinate (cell (r, c) has its centre at (2r+1, 2c+1)).
Each is probed for a printed ring (shared ``ring_probe``); a grid crossing has ink on only
a few perimeter samples, so it never passes. Probing replaced Hough circles, which missed
a gray circle whose halftone fill and touching lines defeated both the gradient vote and
the contour fallback. The colour comes from the inner disk's brightness over the paper's:
white ~1.0, gray halftone ~0.6-0.8, black < 0.3.
"""
from __future__ import annotations

from dataclasses import dataclass

from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.ring_probe import RING_SUPPORT, fill_ratio, probe_ring

# Inner-disk brightness / paper brightness thresholds for colour.
BLACK_MAX = 0.40
WHITE_MIN = 0.90

WHITE = 0
BLACK = 1
GRAY = 2


@dataclass
class DetectedCircle:
    dr: int
    dc: int
    color: int  # 0 = white, 1 = black, 2 = gray


def probe_lattice_circles(gray: NDArray, grid: BoardGrid) -> list[DetectedCircle]:
    """Test every edge midpoint and interior corner of the grid for a circle."""
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
            circles.append(DetectedCircle(dr=dr, dc=dc, color=circle_color(ratio)))
    return circles


def circle_color(ratio: float) -> int:
    """0 = white, 1 = black, 2 = gray, from the inner disk's brightness ratio."""
    if ratio < BLACK_MAX:
        return BLACK
    if ratio > WHITE_MIN:
        return WHITE
    return GRAY
