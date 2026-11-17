"""Grid, circle and rope detection for Zebra Rope.

Design (see docs/zebra-rope/zebra-rope.md, "Puzzle Parser"):

The board is a plain solid grid. Gray ropes (a halftone band with a dark outline) run
through cell centres, horizontally, vertically and at 45 degrees; white, gray and black
circles sit on grid lines (edge midpoints and corners) and are printed over the ropes.
Samples are magazine photos that also show part of a neighbouring puzzle;
``rectify_board`` picks the one complete bordered grid.

1. Border + warp with the shared ``rectify_board``; grid lines with ``find_grid_lines``.
   Ropes run half a cell off the grid lines, so the lattice fit passes over them.
2. Circles: probe every edge midpoint and corner with the shared ``ring_probe`` and
   classify the inner disk's brightness, as Kuralin does (same colour codes). Ropes pass
   under the circles, so the fill reads the circle's own colour. Below ~1500 px a rope
   crossing a solid grid line blurs into enough of a ring to pass; a circle's inside is
   even (paper, halftone or solid) while there a line crosses it, so a ring whose inner
   disk spreads (90th - 10th percentile over paper) above 0.42 is dropped. Measured on
   both samples at full size down to 800 px: circles <= 0.37 (hatched gray), crossings
   >= 0.45.
3. Rope steps: for every pair of 8-neighbour cells, sample the segment between their
   centres. Each sample takes the darkest point of a short profile across the segment
   (on the lighting-normalised image); a rope's outline makes it dark. Samples skip
   where a step meets a grid line (the middle of an orthogonal step, the corner of a
   diagonal one, where two diagonals may also cross) and anything under a circle.
   Measured on both samples: rope steps cover 1.0, others <= 0.33 (a step whose few
   samples clip a circle's rim).
4. Chain steps into ropes: at each cell pair the steps that go straight through, then
   pair the two left over (a bend). A cell two ropes cross keeps both.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import find_grid_lines, rectify_board
from puzzle_parsers.ring_probe import RING_SUPPORT, fill_ratio, paper_level, probe_ring

logger = logging.getLogger(__name__)

# Inner-disk brightness / paper brightness thresholds for colour (as Kuralin).
BLACK_MAX = 0.40
WHITE_MIN = 0.90
# A circle's inner disk (radius in cells) is even; a line crossing spreads it more.
INNER_RADIUS = 0.1
INNER_SPREAD_MAX = 0.42

# A profile sample is rope ink when darker than this fraction of the local paper.
INK_RATIO = 0.6
# A step is a rope when this fraction of its usable samples is ink.
STEP_COVERAGE = 0.6
# Fewer usable samples than this (the step hides under circles) reads as no rope.
MIN_SAMPLES = 2
# Samples closer than this (in cells) to a circle centre are skipped.
CIRCLE_CLEARANCE = 0.24
# Half-length (in cells) of the profile taken across the step at each sample.
PROFILE_HALF = 0.08
# Sample positions along a step (fraction of the centre-to-centre distance), clear of
# the grid line an orthogonal step crosses and of the corner a diagonal step crosses.
ORTHO_TS = np.r_[np.linspace(0.22, 0.42, 5), np.linspace(0.58, 0.78, 5)]
DIAG_TS = np.r_[np.linspace(0.20, 0.36, 5), np.linspace(0.64, 0.80, 5)]

STEP_DIRS = ((0, 1), (1, 0), (1, 1), (1, -1))

Cell = tuple[int, int]


@dataclass
class DetectedCircle:
    dr: int
    dc: int
    color: int  # 0 = white, 1 = black, 2 = gray
    cx: float
    cy: float


@dataclass
class ZebraRopeGeometry:
    grid: BoardGrid
    circles: list[DetectedCircle] = field(default_factory=list)
    ropes: list[list[Cell]] = field(default_factory=list)

    @property
    def rows(self) -> int:
        return self.grid.rows

    @property
    def cols(self) -> int:
        return self.grid.cols


def detect_zebra_rope(image: NDArray, debug_dir: str | None = None) -> ZebraRopeGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    board = rectify_board(image)
    warped, border_pts = board.warped, board.quad
    if debug_path:
        vis = image.copy()
        cv2.polylines(vis, [border_pts.astype(int)], True, (0, 255, 0), 3)
        cv2.imwrite(str(debug_path / "01_border.png"), vis)
        cv2.imwrite(str(debug_path / "02_warped.png"), warped)

    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = find_grid_lines(gray)
    grid = BoardGrid(warped=warped, h_lines=h_lines, v_lines=v_lines, quad=border_pts)

    circles = probe_circles(gray, grid)
    steps = find_steps(gray, grid, circles)
    ropes = chain_ropes(steps)

    if debug_path:
        vis = warped.copy()
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, vis.shape[0]), (0, 180, 0), 1)
        for y in h_lines:
            cv2.line(vis, (0, y), (vis.shape[1], y), (0, 180, 0), 1)
        for rope in ropes:
            pts = np.array([grid.point(2 * r + 1, 2 * c + 1) for r, c in rope], dtype=np.int32)
            cv2.polylines(vis, [pts], False, (0, 0, 255), 4)
            cv2.circle(vis, tuple(int(v) for v in pts[0]), 8, (0, 0, 255), -1)
        palette = [(255, 0, 0), (0, 0, 255), (0, 160, 255)]
        for c in circles:
            cv2.circle(vis, (int(c.cx), int(c.cy)), int(0.3 * grid.cell_w), palette[c.color], 3)
        cv2.imwrite(str(debug_path / "03_parsed.png"), vis)

    return ZebraRopeGeometry(grid=grid, circles=circles, ropes=ropes)


def probe_circles(gray: NDArray, grid: BoardGrid) -> list[DetectedCircle]:
    """Test every edge midpoint and interior corner for a printed circle."""
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
            if inner_spread(gray, ring.cx, ring.cy, pitch) > INNER_SPREAD_MAX:
                continue
            ratio = fill_ratio(gray, ring.cx, ring.cy, pitch)
            circles.append(DetectedCircle(dr, dc, _color(ratio), ring.cx, ring.cy))
    return circles


def inner_spread(gray: NDArray, cx: float, cy: float, pitch: float) -> float:
    """90th minus 10th percentile of the inner disk's brightness, over paper."""
    h, w = gray.shape
    rr = max(2, int(INNER_RADIUS * pitch))
    ci, cj = int(round(cy)), int(round(cx))
    patch = gray[max(0, ci - rr):min(h, ci + rr + 1), max(0, cj - rr):min(w, cj + rr + 1)]
    if not patch.size:
        return 0.0
    yy, xx = np.mgrid[: patch.shape[0], : patch.shape[1]]
    inside = (yy - (ci - max(0, ci - rr))) ** 2 + (xx - (cj - max(0, cj - rr))) ** 2 <= rr * rr
    vals = patch[inside].astype(np.float32) / max(1.0, paper_level(gray, cx, cy, pitch))
    return float(np.percentile(vals, 90) - np.percentile(vals, 10))


def _color(ratio: float) -> int:
    if ratio < BLACK_MAX:
        return 1
    if ratio > WHITE_MIN:
        return 0
    return 2


def normalized(gray: NDArray, pitch: float) -> NDArray:
    """Gray divided by the local paper white (a max filter ~3 cells wide)."""
    k = int(3 * pitch) | 1
    bg = cv2.dilate(gray, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    bg = cv2.GaussianBlur(bg, (k, k), 0).astype(np.float32)
    return gray.astype(np.float32) / np.maximum(bg, 1)


def find_steps(
    gray: NDArray, grid: BoardGrid, circles: list[DetectedCircle]
) -> set[tuple[Cell, Cell]]:
    """8-neighbour cell pairs joined by a rope, each pair (a, b) with a < b."""
    pitch = min(grid.cell_w, grid.cell_h)
    norm = normalized(gray, pitch)
    h, w = norm.shape
    centres = np.array([(c.cx, c.cy) for c in circles], dtype=float).reshape(-1, 2)
    offsets = np.linspace(-PROFILE_HALF, PROFILE_HALF, 9) * pitch

    steps: set[tuple[Cell, Cell]] = set()
    for r in range(grid.rows):
        for c in range(grid.cols):
            x1, y1 = grid.point(2 * r + 1, 2 * c + 1)
            for sr, sc in STEP_DIRS:
                r2, c2 = r + sr, c + sc
                if not (0 <= r2 < grid.rows and 0 <= c2 < grid.cols):
                    continue
                x2, y2 = grid.point(2 * r2 + 1, 2 * c2 + 1)
                length = float(np.hypot(x2 - x1, y2 - y1))
                px, py = -(y2 - y1) / length, (x2 - x1) / length
                ts = DIAG_TS if sr and sc else ORTHO_TS
                inked = []
                for t in ts:
                    x, y = x1 + t * (x2 - x1), y1 + t * (y2 - y1)
                    if len(centres) and np.min(np.hypot(centres[:, 0] - x, centres[:, 1] - y)) < CIRCLE_CLEARANCE * pitch:
                        continue
                    xs = np.clip(np.round(x + offsets * px).astype(int), 0, w - 1)
                    ys = np.clip(np.round(y + offsets * py).astype(int), 0, h - 1)
                    inked.append(norm[ys, xs].min() < INK_RATIO)
                if len(inked) >= MIN_SAMPLES and np.mean(inked) >= STEP_COVERAGE:
                    steps.add(((r, c), (r2, c2)) if (r, c) < (r2, c2) else ((r2, c2), (r, c)))
    return steps


def chain_ropes(steps: set[tuple[Cell, Cell]]) -> list[list[Cell]]:
    """Chain steps into ropes, read from the end that comes first in reading order.

    At each cell, two steps in opposite directions continue each other (a rope going
    straight through); if exactly two steps are left they continue each other too (a
    bend). Any other leftover step ends its rope there.
    """
    adj: dict[Cell, list[Cell]] = {}
    for a, b in steps:
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)

    # links[(cell, neighbour)] = the neighbour the rope continues to after cell.
    cont: dict[tuple[Cell, Cell], Cell] = {}
    for cell, nbrs in adj.items():
        left = list(nbrs)
        for a in nbrs:
            b = (2 * cell[0] - a[0], 2 * cell[1] - a[1])
            if a in left and b in left:
                cont[(cell, a)] = b
                cont[(cell, b)] = a
                left.remove(a)
                left.remove(b)
        if len(left) == 2:
            cont[(cell, left[0])] = left[1]
            cont[(cell, left[1])] = left[0]
        elif len(left) > 2:
            logger.warning("zebra_rope: %d ropes meet at %s without a clear pairing", len(left), cell)

    used: set[tuple[Cell, Cell]] = set()

    def walk(start: Cell, nxt: Cell) -> list[Cell]:
        path = [start]
        prev, cur = start, nxt
        while True:
            used.add((min(prev, cur), max(prev, cur)))
            if cur == start:  # a closed loop
                break
            path.append(cur)
            after = cont.get((cur, prev))
            if after is None or (min(cur, after), max(cur, after)) in used:
                break
            prev, cur = cur, after
        return path

    ropes: list[list[Cell]] = []
    # Open ropes first, from each unpaired end.
    for cell in sorted(adj):
        for nbr in sorted(adj[cell]):
            if (cell, nbr) in cont:
                continue  # the rope continues through here: not an end
            if (min(cell, nbr), max(cell, nbr)) in used:
                continue
            ropes.append(walk(cell, nbr))
    # Whatever is left forms closed loops.
    for a, b in sorted(steps):
        if (a, b) not in used:
            ropes.append(walk(a, b))

    for rope in ropes:
        if rope[-1] < rope[0]:
            rope.reverse()
    ropes.sort(key=lambda rope: rope[0])
    return ropes
