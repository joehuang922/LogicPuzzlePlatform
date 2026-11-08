"""Unequal sudoku board detection: a 9x9 lattice of separate squares.

The print draws no grid lines. Each cell is its own outlined square and the
inequality signs sit in the gaps between them, so instead of tracing lines we
find the squares themselves and fit the 9x9 lattice to them:

1. Every near-square closed contour is a candidate. An outline yields an inner
   and an outer contour; the cell is measured by the inner one, padded by the
   outline's stroke, because a sign whose tip touches the outline merges into
   the outer contour and would widen the cell into its gap.
2. Board cells share one size. The dominant size (the size most candidates
   agree on within a tolerance) wins; the answer strip, the 1-9 number bar and
   squares cut off at the page edge are a different size and drop out.
3. Squares one pitch apart horizontally or vertically are lattice neighbours.
   A walk over that graph gives each square integer lattice coordinates, and
   the parser keeps the fully populated 9x9 window of the largest component.
   Neighbouring boards on the same page are separate components (or, if they
   ever join, a window with missing squares).

Each square keeps its own measured bounds, so mild perspective and page curl in
photos need no warp: every cell and gap is read where it actually is.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray

SIZE = 9
# Candidates within this fraction of the dominant size are board cells.
_SIZE_TOL = 0.15
# Lattice neighbours sit one pitch apart, within this fraction of the pitch.
_NEIGHBOUR_TOL = 0.25


@dataclass(frozen=True)
class Square:
    x: int
    y: int
    w: int
    h: int

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    @property
    def right(self) -> int:
        return self.x + self.w

    @property
    def bottom(self) -> int:
        return self.y + self.h


@dataclass
class SquareLattice:
    # cells[r][c]: the square of row r, column c
    cells: list[list[Square]]
    cell_size: float
    pitch: float

    def quad(self) -> NDArray:
        """Board corners (tl, tr, br, bl) in image coordinates."""
        tl, tr = self.cells[0][0], self.cells[0][-1]
        bl, br = self.cells[-1][0], self.cells[-1][-1]
        return np.array(
            [[tl.x, tl.y], [tr.right, tr.y], [br.right, br.bottom], [bl.x, bl.bottom]],
            dtype=np.float32,
        )


def find_squares(gray: NDArray) -> list[Square]:
    """Every outlined near-square on the page, one per outline."""
    h_img, w_img = gray.shape[:2]
    span = max(h_img, w_img)
    binv = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 51, 15
    )
    contours, _ = cv2.findContours(binv, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    candidates: list[Square] = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        # A 9x9 board fills at most the page; a cell is at least ~1/80 of it.
        if min(w, h) < span / 80 or max(w, h) > span / 9:
            continue
        if not 0.8 < w / h < 1.25:
            continue
        if cv2.contourArea(contour) < 0.8 * w * h:
            continue
        candidates.append(Square(x, y, w, h))

    # An outline gives two contours: its inner edge and its outer edge. Measure
    # each cell by the inner edge: a sign whose tip touches the outline merges
    # into the outer contour and widens it, but can't reach the inside. Pair
    # each inner square with the next larger one around it (same centre,
    # similar size; a digit's hole is far smaller and stays separate).
    candidates.sort(key=lambda s: s.w * s.h)
    inner: list[Square] = []
    outer: list[Square | None] = []
    for s in candidates:
        for i, k in enumerate(inner):
            if abs(s.cx - k.cx) < k.w / 3 and abs(s.cy - k.cy) < k.h / 3 and s.w < 1.35 * k.w:
                if outer[i] is None:
                    outer[i] = s
                break
        else:
            inner.append(s)
            outer.append(None)

    # Pad inner edges by the outline's stroke, measured where both contours are
    # clean (a touching sign makes the outer one lopsided).
    strokes = [
        (o.w - k.w + o.h - k.h) / 4
        for k, o in zip(inner, outer)
        if o is not None and abs((o.w - k.w) - (o.h - k.h)) <= 4
    ]
    stroke = int(round(float(np.median(strokes)))) if strokes else 0
    return [Square(s.x - stroke, s.y - stroke, s.w + 2 * stroke, s.h + 2 * stroke) for s in inner]


def _dominant_size(squares: list[Square]) -> float:
    sizes = np.array([(s.w + s.h) / 2 for s in squares], dtype=float)
    counts = [int(np.sum(np.abs(sizes - s) < _SIZE_TOL * s)) for s in sizes]
    return float(sizes[int(np.argmax(counts))])


def detect_lattice(gray: NDArray) -> SquareLattice:
    """Find the 9x9 lattice of cell squares, or raise ValueError."""
    squares = find_squares(gray)
    if len(squares) < SIZE * SIZE:
        raise ValueError(f"unequal_sudoku: found {len(squares)} squares, need {SIZE * SIZE}")
    size = _dominant_size(squares)
    cells = [s for s in squares if abs((s.w + s.h) / 2 - size) < _SIZE_TOL * size]
    if len(cells) < SIZE * SIZE:
        raise ValueError(
            f"unequal_sudoku: only {len(cells)} squares of the board's cell size ({size:.0f}px)"
        )

    centres = np.array([(s.cx, s.cy) for s in cells])
    dist = np.sqrt(((centres[:, None] - centres[None]) ** 2).sum(-1))
    np.fill_diagonal(dist, np.inf)
    pitch = float(np.median(dist.min(axis=1)))
    tol = _NEIGHBOUR_TOL * pitch

    # Lattice coordinates by walking neighbour steps.
    steps = ((1, 0), (-1, 0), (0, 1), (0, -1))
    coords: dict[int, tuple[int, int]] = {}
    best: dict[tuple[int, int], int] = {}
    for start in range(len(cells)):
        if start in coords:
            continue
        component = {start: (0, 0)}
        coords[start] = (0, 0)
        queue = deque([start])
        while queue:
            i = queue.popleft()
            ci, cj = component[i]
            for di, dj in steps:
                tx = centres[i, 0] + dj * pitch
                ty = centres[i, 1] + di * pitch
                d = np.hypot(centres[:, 0] - tx, centres[:, 1] - ty)
                j = int(np.argmin(d))
                if d[j] < tol and j not in coords:
                    coords[j] = component[j] = (ci + di, cj + dj)
                    queue.append(j)
        by_pos: dict[tuple[int, int], int] = {}
        for idx, pos in component.items():
            by_pos.setdefault(pos, idx)
        window = _full_window(by_pos)
        if window is not None and (not best or len(by_pos) > len(best)):
            best = {
                (r, c): by_pos[(window[0] + r, window[1] + c)]
                for r in range(SIZE)
                for c in range(SIZE)
            }

    if not best:
        raise ValueError("unequal_sudoku: no complete 9x9 lattice of cell squares found")
    grid = [[cells[best[(r, c)]] for c in range(SIZE)] for r in range(SIZE)]
    return SquareLattice(cells=grid, cell_size=size, pitch=pitch)


def _full_window(by_pos: dict[tuple[int, int], int]) -> tuple[int, int] | None:
    """Top-left of the 9x9 window holding the most squares, if one is complete."""
    if len(by_pos) < SIZE * SIZE:
        return None
    rows = [p[0] for p in by_pos]
    cols = [p[1] for p in by_pos]
    best, best_count = None, -1
    for r0 in range(min(rows), max(rows) - SIZE + 2):
        for c0 in range(min(cols), max(cols) - SIZE + 2):
            count = sum(
                (r0 + r, c0 + c) in by_pos for r in range(SIZE) for c in range(SIZE)
            )
            if count > best_count:
                best, best_count = (r0, c0), count
    return best if best_count == SIZE * SIZE else None
