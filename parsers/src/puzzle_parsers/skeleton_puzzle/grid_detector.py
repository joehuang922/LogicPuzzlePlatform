"""Skeleton Puzzle grid: the lattice and which of its squares are cells.

The board is a crossword-shaped patch of cells with no rectangular border, on
pages that curl: board 1's lines bow ~0.2 cell, and its middle hole leaves
lines too sparse for ``flatten_board`` to trace, so the four-corner warp left
5-7 squares wrong. So the lattice is built locally from the board itself,
with no global warp (``rectify_board`` / ``flatten_board`` aren't used):

1. **Regions.** At a fixed 2000 px long side the page is binarized and only
   the largest ink component (the grid; every line is joined) is kept. The
   white regions it encloses are runs of cells (faint thin lines often vanish,
   merging neighbours), single cells, or enclosed non-cell areas.
2. **Corners.** Each region is a rectilinear polygon whose vertices sit on
   lattice corners. The pitch (per axis) is fitted to the polygon edges.
3. **Lattice.** Integer coordinates spread from one corner by rounding each
   *local* offset to the pitch, shortest hops first, so a bowed page only
   bends things gradually. A smooth cubic map from pixels to lattice is then
   fitted to every corner and each is re-rounded through it: one badly rounded
   long edge can shift a whole cluster by a row, and the map puts it back.
   Corners no region touches are interpolated from their nearest known ones.
4. **Walls.** Every square takes the region at its centre. Squares in one
   region share a class: nothing visible separates them (no line, or a thin
   line too faint to binarize, and both mean the same class). Between regions
   the line is measured where it really is (``grid_utils.line_width_across``)
   and split thin / thick (Otsu).
5. **Cells.** Region labels minimise the walls' disagreement, each weighted by
   how far its width is from the cut: a thin line wants both sides cells, a
   thick line wants them different, and a line to the outside wants a cell.
6. **Repair.** Every cell is in a slot, so a lone cell gets the square that
   joins it to the cell straight beyond filled in.
"""
from __future__ import annotations

import heapq
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.spatial import cKDTree

from puzzle_parsers.grid_utils import _find_thickness_threshold, line_width_across

WORK_SIZE = 2000
# Binarization of the grid lines at WORK_SIZE.
INK_BLOCK = 31
INK_C = 5
MIN_REGION_AREA = 150
# Polygon simplification, in pitches.
POLY_EPSILON = 0.18
# Corners of neighbouring regions this close (pitches) are one lattice corner across a line.
SAME_CORNER = 0.45
# Interpolating a lattice corner no region touches.
LOCAL_FIT_POINTS = 6
# Line profile reach each side of a wall, in pitches.
WALL_REACH = 0.2
# A line to the outside weighs this much more than a line between two regions.
OUTSIDE_WEIGHT = 3.0
OUTSIDE = -1


@dataclass
class SkeletonGeometry:
    cells: list[list[int]]
    # (rows+1) x (cols+1) x 2 lattice corners, source-image pixels
    corners: NDArray = field(repr=False)
    quad: NDArray = field(repr=False)  # TL, TR, BR, BL around the board, source pixels

    @property
    def rows(self) -> int:
        return len(self.cells)

    @property
    def cols(self) -> int:
        return len(self.cells[0]) if self.cells else 0


def detect_skeleton_grid(image: NDArray, debug_dir: str | None = None) -> SkeletonGeometry:
    gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    scale = WORK_SIZE / max(gray.shape)
    work = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    ink = _grid_ink(work)
    polys = _region_polygons(ink)
    if not polys:
        raise ValueError("No skeleton grid found")
    px, py = _fit_pitch(polys)
    points, coords = _lattice_coords(polys, px, py)
    corners = _lattice_corners(points, coords)
    rows, cols = corners.shape[0] - 1, corners.shape[1] - 1
    squares = _square_regions(ink, corners, rows, cols)
    walls = _walls(work, corners, squares, (px + py) / 2)
    cells = _solve(squares, walls)
    _bridge_isolated(cells, squares)
    corners_src = corners / scale
    quad = np.float32([corners_src[0, 0], corners_src[0, -1], corners_src[-1, -1], corners_src[-1, 0]])
    if debug_dir:
        _write_debug(image, corners_src, cells, Path(debug_dir))
    return SkeletonGeometry(cells=cells, corners=corners_src, quad=quad)


def _grid_ink(work: NDArray) -> NDArray:
    """The grid's lines: the largest component of the binarized page."""
    ink = cv2.adaptiveThreshold(work, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, INK_BLOCK, INK_C)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
    if n <= 1:
        return ink
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return (labels == largest).astype(np.uint8) * 255


def _region_polygons(ink: NDArray) -> list[NDArray]:
    """Outlines of the white regions the grid encloses (not the outside)."""
    white = cv2.bitwise_not(ink)
    h, w = white.shape
    contours, hierarchy = cv2.findContours(white, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    found = []
    for i, contour in enumerate(contours):
        if hierarchy[0][i][3] != -1:
            continue
        x, y, bw, bh = cv2.boundingRect(contour)
        if x == 0 or y == 0 or x + bw >= w or y + bh >= h or cv2.contourArea(contour) < MIN_REGION_AREA:
            continue
        found.append(contour)
    if not found:
        return []
    # A first pitch from the square regions (single cells) scales the simplification.
    sides = [
        (bw + bh) / 2
        for c in found
        for _, _, bw, bh in [cv2.boundingRect(c)]
        if 0.8 < bw / bh < 1.25 and cv2.contourArea(c) / (bw * bh) > 0.85
    ]
    pitch = float(np.median(sides)) if sides else 40.0
    return [cv2.approxPolyDP(c, POLY_EPSILON * pitch, True).reshape(-1, 2).astype(float) for c in found]


def _polygon_edges(polys: list[NDArray]):
    for p in polys:
        for i in range(len(p)):
            yield p[i], p[(i + 1) % len(p)]


def _fit_pitch(polys: list[NDArray]) -> tuple[float, float]:
    """Horizontal and vertical pitch that explain the polygon edges as whole cells."""
    sides = [abs(b - a).max() for a, b in _polygon_edges(polys)]
    px = py = float(np.percentile(sides, 25))
    for _ in range(6):
        sx = kx = sy = ky = 0.0
        for a, b in _polygon_edges(polys):
            dx, dy = abs(b[0] - a[0]), abs(b[1] - a[1])
            if dx > dy and round(dx / px) >= 1:
                sx += dx
                kx += round(dx / px)
            elif dy >= dx and round(dy / py) >= 1:
                sy += dy
                ky += round(dy / py)
        px, py = sx / max(kx, 1), sy / max(ky, 1)
    return px, py


def _lattice_coords(polys: list[NDArray], px: float, py: float) -> tuple[NDArray, NDArray]:
    """(row, col) of every polygon vertex: local rounding, then a smooth refit."""
    points = np.concatenate(polys)
    n = len(points)
    neighbours: list[list[int]] = [[] for _ in range(n)]
    base = 0
    for p in polys:
        for i in range(len(p)):
            a, b = base + i, base + (i + 1) % len(p)
            neighbours[a].append(b)
            neighbours[b].append(a)
        base += len(p)
    for a, b in cKDTree(points).query_pairs(SAME_CORNER * min(px, py)):
        neighbours[a].append(b)
        neighbours[b].append(a)

    coords = np.zeros((n, 2))
    placed = np.zeros(n, dtype=bool)
    for seed in range(n):
        if placed[seed]:
            continue
        placed[seed] = True
        heap = [(0.0, seed)]
        done = set()
        while heap:
            _, i = heapq.heappop(heap)
            if i in done:
                continue
            done.add(i)
            for j in neighbours[i]:
                if placed[j]:
                    continue
                d = points[j] - points[i]
                coords[j] = coords[i] + (round(d[1] / py), round(d[0] / px))
                placed[j] = True
                heapq.heappush(heap, (float(np.hypot(*d)), j))

    # Re-round every vertex through a smooth (cubic) pixel -> lattice map.
    centre, spread = points.mean(axis=0), float(np.ptp(points)) or 1.0
    x, y = ((points - centre) / spread).T
    design = np.stack([np.ones_like(x), x, y, x * x, x * y, y * y, x**3, x * x * y, x * y * y, y**3], axis=1)
    # numpy 2 on macOS's Accelerate flags spurious divide/overflow warnings on any matmul.
    with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
        for _ in range(5):
            weights = np.ones(n)
            for _ in range(3):
                coef, *_ = np.linalg.lstsq(design * weights[:, None], coords * weights[:, None], rcond=None)
                weights = 1.0 / np.maximum(np.abs(design @ coef - coords).max(axis=1), 0.1)
            refit = np.round(design @ coef)
            if np.array_equal(refit, coords):
                break
            coords = refit
    coords -= coords.min(axis=0)
    return points, coords.astype(int)


def _lattice_corners(points: NDArray, coords: NDArray) -> NDArray:
    """Pixel position of every lattice corner: the mean of the vertices on it, else interpolated."""
    known: dict[tuple[int, int], list[NDArray]] = {}
    for p, (r, c) in zip(points, coords):
        known.setdefault((int(r), int(c)), []).append(p)
    rows, cols = int(coords[:, 0].max()), int(coords[:, 1].max())
    keys = np.array(list(known.keys()), dtype=float)
    vals = np.array([np.mean(v, axis=0) for v in known.values()])
    tree = cKDTree(keys)
    k = min(LOCAL_FIT_POINTS, len(keys))
    corners = np.zeros((rows + 1, cols + 1, 2))
    for r in range(rows + 1):
        for c in range(cols + 1):
            if (r, c) in known:
                corners[r, c] = np.mean(known[(r, c)], axis=0)
                continue
            _, idx = tree.query((r, c), k=k)
            idx = np.atleast_1d(idx)
            a = np.c_[keys[idx][:, 1], keys[idx][:, 0], np.ones(len(idx))]
            coef, *_ = np.linalg.lstsq(a, vals[idx], rcond=None)
            corners[r, c] = np.array([c, r, 1.0]) @ coef
    return corners


def _square_regions(ink: NDArray, corners: NDArray, rows: int, cols: int) -> NDArray:
    """The white region at each square's centre; OUTSIDE for the page around the board."""
    labels = cv2.connectedComponents(cv2.bitwise_not(ink), connectivity=4)[1]
    outside = set(np.unique(np.r_[labels[0], labels[-1], labels[:, 0], labels[:, -1]]).tolist())
    squares = np.full((rows, cols), OUTSIDE)
    for r in range(rows):
        for c in range(cols):
            x, y = np.round(corners[r : r + 2, c : c + 2].reshape(-1, 2).mean(axis=0)).astype(int)
            window = labels[max(0, y - 3) : y + 4, max(0, x - 3) : x + 4].ravel()
            window = window[window > 0]
            if window.size:
                v = int(np.bincount(window).argmax())
                squares[r, c] = OUTSIDE if v in outside else v
    return squares


def _walls(work: NDArray, corners: NDArray, squares: NDArray, pitch: float) -> list[tuple[int, int, float]]:
    """(region, region, line width) for every wall between two different regions (or the outside)."""
    rows, cols = squares.shape

    def region(r: int, c: int) -> int:
        return int(squares[r, c]) if 0 <= r < rows and 0 <= c < cols else OUTSIDE

    walls = []
    for r in range(rows + 1):
        for c in range(cols):
            a, b = region(r - 1, c), region(r, c)  # wall above (r, c)
            if a != b:
                walls.append((a, b, line_width_across(work, corners[r, c], corners[r, c + 1], WALL_REACH * pitch)))
    for r in range(rows):
        for c in range(cols + 1):
            a, b = region(r, c - 1), region(r, c)  # wall left of (r, c)
            if a != b:
                walls.append((a, b, line_width_across(work, corners[r, c], corners[r + 1, c], WALL_REACH * pitch)))
    return walls


def _solve(squares: NDArray, walls: list[tuple[int, int, float]]) -> list[list[int]]:
    """Cell (1) or not (0) per region, minimising the walls' weighted disagreement."""
    lines = [w for _, _, w in walls if w > 0]
    threshold = _find_thickness_threshold(lines)
    constraints: dict[int, list[tuple[int, str, float]]] = {}
    for a, b, w in walls:
        if w <= 0:
            continue
        kind = "thick" if w > threshold else "thin"
        weight = min(1.0, abs(w - threshold) / threshold) + 0.1
        for x, y in ((a, b), (b, a)):
            if x != OUTSIDE:
                constraints.setdefault(x, []).append((y, "outside" if y == OUTSIDE else kind, weight))

    regions = sorted(set(squares.ravel().tolist()) - {OUTSIDE})
    # Start: a region with a line to the outside or a thin line is cells; the rest not.
    label = {g: int(any(k in ("outside", "thin") for _, k, _ in constraints.get(g, []))) for g in regions}

    def cost(x: int, lx: int) -> float:
        total = 0.0
        for y, kind, weight in constraints.get(x, []):
            ly = 0 if y == OUTSIDE else label[y]
            if kind == "outside":
                total += OUTSIDE_WEIGHT * weight * (lx != 1)
            elif kind == "thin":
                total += weight * ((lx != 1) + (ly != 1))
            else:
                total += weight * (lx == ly)
        return total

    for _ in range(50):
        changed = False
        for x in regions:
            c0, c1 = cost(x, 0), cost(x, 1)
            if c0 != c1 and label[x] != int(c1 < c0):
                label[x] = int(c1 < c0)
                changed = True
        if not changed:
            break
    rows, cols = squares.shape
    return [[label.get(int(squares[r, c]), 0) for c in range(cols)] for r in range(rows)]


def _bridge_isolated(cells: list[list[int]], squares: NDArray) -> None:
    """A cell in no slot can't be: fill the square that joins it to the cell straight beyond.

    Only through squares of a region (never the outside), and only when the far
    cell is in line. Not needed on the samples; a guard for a lost wall.
    """
    rows, cols = len(cells), len(cells[0])

    def cell(r: int, c: int) -> bool:
        return 0 <= r < rows and 0 <= c < cols and cells[r][c] == 1

    steps = ((1, 0), (-1, 0), (0, 1), (0, -1))
    for r in range(rows):
        for c in range(cols):
            if not cells[r][c] or any(cell(r + dr, c + dc) for dr, dc in steps):
                continue
            for dr, dc in steps:
                gr, gc = r + dr, c + dc
                if 0 <= gr < rows and 0 <= gc < cols and squares[gr, gc] != OUTSIDE and cell(gr + dr, gc + dc):
                    cells[gr][gc] = 1
                    break


def _write_debug(image: NDArray, corners: NDArray, cells: list[list[int]], out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    vis = image.copy() if image.ndim == 3 else cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    thick = max(1, int(np.linalg.norm(corners[0, 1] - corners[0, 0]) / 25))
    for r in range(len(cells)):
        for c in range(len(cells[0])):
            quad = np.int32([corners[r, c], corners[r, c + 1], corners[r + 1, c + 1], corners[r + 1, c]])
            colour = (40, 160, 255) if cells[r][c] else (200, 200, 200)
            cv2.polylines(vis, [quad], True, colour, thick)
            if cells[r][c]:
                centre = quad.mean(axis=0).astype(int)
                cv2.circle(vis, tuple(int(v) for v in centre), thick * 2, (40, 160, 255), -1)
    cv2.imwrite(str(out / "skeleton_cells.png"), vis)
