"""Combo-sudoku layout: which 9x9 sub-boards a page holds, and where.

Every sub-board sits on one shared cell lattice, aligned to 3x3 rooms, so the
layout is found without assuming any shape:

1. Find grid-line crossings (junctions) on a straightened, Android-sized copy.
2. Give each junction integer (row, col) indices by walking from neighbour to
   neighbour with locally measured steps, so tilt, perspective and a page fold
   only matter between neighbours. A faint line (the fold of a two-page
   spread) is bridged, and its hidden junctions filled in where the crossing
   line runs between both neighbours.
3. A room exists when its 4x4 junctions are (nearly) all there: printed gaps
   between boards, and holes enclosed by boards, have no inner lines.
4. Sub-boards are the fewest 3x3-room blocks that cover exactly the rooms
   present. Shapes that more than one set of boards explains are returned as
   alternatives for the parser to settle with the clues.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.spatial import cKDTree

from puzzle_parsers.grid_utils import _projection_pitch, estimate_cell_pitch

# Geometry runs at Android upload size; readers get native pixels.
WORK_MAX_SIDE = 2000
# A room counts as present with at most two junctions missing, none of them
# more than one of its four inner ones.
_ROOM_MIN_JUNCTIONS = 14
_ROOM_MIN_INNER = 3
# Junction search radius around the predicted position, as a fraction of a cell.
_STEP_TOL = 0.3
# The most boards a layout search considers (the biggest printed so far: 14).
_MAX_BOARDS = 40

Room = tuple[int, int]  # (room_row, room_col)


class LayoutError(ValueError):
    """The page shows no combo-sudoku layout the parser can trust."""


@dataclass
class ComboLayout:
    """Where the sub-boards and rooms are.

    ``boards`` are candidate sub-board sets, each a list of ``(x, y)`` room
    origins; more than one means the shape alone is ambiguous. ``rooms`` maps
    every present room (row, col), relative to the top-left room, to its 4x4
    junctions in native image coordinates (NaN where none was found).
    ``cell_px`` is the native cell pitch.
    """

    boards: list[list[tuple[int, int]]]
    rooms: dict[Room, NDArray]
    cell_px: float
    room_rows: int
    room_cols: int
    debug: dict


def find_layout(image: NDArray) -> ComboLayout:
    gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    scale = min(1.0, WORK_MAX_SIDE / max(gray.shape[:2]))
    work = gray if scale == 1.0 else cv2.resize(
        gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    angle = _skew_angle(work)
    rot = cv2.getRotationMatrix2D((work.shape[1] / 2, work.shape[0] / 2), angle, 1.0)
    if abs(angle) >= 0.1:
        work = cv2.warpAffine(work, rot, (work.shape[1], work.shape[0]),
                              flags=cv2.INTER_LINEAR, borderValue=255)
    binary = _binary(work)

    best = None
    for pitch in _pitch_candidates(work, binary):
        found = _lattice_at(binary, pitch)
        if found and (best is None or len(found[2]) > len(best[2])):
            best = found
    if best is None or not best[2]:
        raise LayoutError("No combo-sudoku grid found on the page.")
    pitch, grid, rooms, phase = best

    covers = _min_covers(rooms)
    if not covers:
        raise LayoutError(
            "The grid does not split into whole 9x9 sudoku boards; "
            "try a straighter photo of the whole puzzle."
        )

    # Native coordinates: undo the rotation, then the resize.
    inv = cv2.invertAffineTransform(rot)
    r_min = min(r for r, _ in rooms)
    c_min = min(c for _, c in rooms)
    native: dict[Room, NDArray] = {}
    for (R, C) in rooms:
        pts = np.full((4, 4, 2), np.nan, np.float32)
        for i in range(4):
            for j in range(4):
                p = grid.get((phase[0] + 3 * R + i, phase[1] + 3 * C + j))
                if p is not None:
                    x, y = inv @ np.array([p[0], p[1], 1.0])
                    pts[i, j] = (x / scale, y / scale)
        native[(R - r_min, C - c_min)] = pts

    boards = [sorted(((C - c_min, R - r_min) for R, C in cover), key=lambda b: (b[1], b[0]))
              for cover in covers]
    return ComboLayout(
        boards=boards,
        rooms=native,
        cell_px=pitch / scale,
        room_rows=max(r for r, _ in native) + 1,
        room_cols=max(c for _, c in native) + 1,
        debug={"work": work, "grid": grid, "phase": phase, "pitch": pitch},
    )


# --- lines and junctions ----------------------------------------------------

def _binary(gray: NDArray) -> NDArray:
    return cv2.adaptiveThreshold(
        cv2.GaussianBlur(gray, (3, 3), 0), 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 5,
    )


def _skew_angle(gray: NDArray) -> float:
    """Rotation (degrees) that makes the grid lines axis-aligned."""
    s = min(1.0, 1000 / max(gray.shape[:2]))
    small = gray if s == 1.0 else cv2.resize(gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    ink = _binary(small)
    h, w = ink.shape
    centre = (w / 2, h / 2)

    def sharpness(a: float) -> float:
        m = cv2.getRotationMatrix2D(centre, a, 1.0)
        r = cv2.warpAffine(ink, m, (w, h), borderValue=0).astype(np.float32)
        return float((r.sum(axis=1) ** 2).sum() + (r.sum(axis=0) ** 2).sum())

    coarse = max(np.arange(-8, 8.01, 0.5), key=sharpness)
    return float(max(np.arange(coarse - 0.5, coarse + 0.51, 0.1), key=sharpness))


def _pitch_candidates(gray: NDArray, binary: NDArray) -> list[float]:
    # The shared estimate needs both axes to agree, which a keystoned photo
    # breaks; each axis's own pitch is tried too and the lattice decides.
    ink = (binary > 0).astype(np.float32)
    out: list[float] = []
    for p in (estimate_cell_pitch(gray), _projection_pitch(ink.sum(axis=1)),
              _projection_pitch(ink.sum(axis=0))):
        if p and all(abs(p - o) > 0.1 * o for o in out):
            out.append(float(p))
    return out


def _line_masks(binary: NDArray, pitch: float) -> tuple[NDArray, NDArray]:
    # Longer than any digit stroke, shorter than one cell edge.
    k = max(5, int(round(pitch * 0.8)))
    thick = cv2.dilate(binary, np.ones((3, 3), np.uint8))
    h = cv2.morphologyEx(thick, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (k, 1)))
    v = cv2.morphologyEx(thick, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, k)))
    return h, v


def _junctions(h: NDArray, v: NDArray, pitch: float) -> NDArray:
    # Thin lines stop at a thick border's inner edge: grow both masks so the
    # T-junctions along every outline still overlap.
    g = max(3, int(round(pitch * 0.12))) | 1
    ker = np.ones((g, g), np.uint8)
    cross = cv2.bitwise_and(cv2.dilate(h, ker), cv2.dilate(v, ker))
    n, _, stats, cents = cv2.connectedComponentsWithStats(cross, 8)
    lim = pitch * 0.5
    keep = [cents[i] for i in range(1, n) if stats[i, 2] < lim and stats[i, 3] < lim]
    return np.array(keep, np.float32).reshape(-1, 2)


def _lattice_at(binary: NDArray, pitch: float):
    h, v = _line_masks(binary, pitch)
    pts = _junctions(h, v, pitch)
    if len(pts) < 16:
        return None
    grid = _index_lattice(pts, pitch)
    _fill_hidden(grid, h, v)
    phase, rooms = _rooms_present(grid)
    return pitch, grid, rooms, phase


def _index_lattice(pts: NDArray, pitch: float) -> dict[tuple[int, int], NDArray]:
    """Integer (row, col) for the largest connected set of junctions."""
    tree = cKDTree(pts)
    tol = pitch * _STEP_TOL
    best: dict[int, tuple[int, int]] = {}
    seen = np.zeros(len(pts), bool)
    for seed in range(len(pts)):
        if seen[seed]:
            continue
        idx = {seed: (0, 0)}
        step = {seed: (np.array([pitch, 0.0]), np.array([0.0, pitch]))}
        queue = deque([seed])
        seen[seed] = True
        while queue:
            a = queue.popleft()
            r, c = idx[a]
            ux, uy = step[a]
            for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                for n in (1, 2):  # 2 bridges one missing column or row (a fold)
                    d, b = tree.query(pts[a] + n * (dc * ux + dr * uy))
                    if d <= tol:
                        break
                if d > tol or seen[b]:
                    continue
                seen[b] = True
                idx[b] = (r + n * dr, c + n * dc)
                delta = (pts[b] - pts[a]) / n
                step[b] = (delta * dc, uy) if dc else (ux, delta * dr)
                queue.append(b)
        if len(idx) > len(best):
            best = idx
    r0 = min(r for r, _ in best.values())
    c0 = min(c for _, c in best.values())
    return {(r - r0, c - c0): pts[k] for k, (r, c) in best.items()}


def _ink_along(mask: NDArray, p: NDArray, q: NDArray, frac: float = 0.8) -> bool:
    n = max(2, int(np.hypot(*(q - p))))
    xs = np.linspace(p[0], q[0], n).round().astype(int).clip(0, mask.shape[1] - 1)
    ys = np.linspace(p[1], q[1], n).round().astype(int).clip(0, mask.shape[0] - 1)
    return bool((mask[ys, xs] > 0).mean() >= frac)


def _fill_hidden(grid: dict, h: NDArray, v: NDArray) -> None:
    """Add junctions a faint line hides: both opposite neighbours exist and
    the crossing line runs between them (gaps between boards have no line)."""
    rows = max(r for r, _ in grid) + 1
    cols = max(c for _, c in grid) + 1
    add = {}
    for r in range(rows):
        for c in range(cols):
            if (r, c) in grid:
                continue
            for a, b, mask in (((r, c - 1), (r, c + 1), h), ((r - 1, c), (r + 1, c), v)):
                if a in grid and b in grid and _ink_along(mask, grid[a], grid[b]):
                    add[(r, c)] = (grid[a] + grid[b]) / 2
                    break
    grid.update(add)


# --- rooms and boards -------------------------------------------------------

def _room_ok(grid: dict, r0: int, c0: int) -> bool:
    inner = sum((r0 + i, c0 + j) in grid for i in (1, 2) for j in (1, 2))
    total = sum((r0 + i, c0 + j) in grid for i in range(4) for j in range(4))
    return inner >= _ROOM_MIN_INNER and total >= _ROOM_MIN_JUNCTIONS


def _rooms_present(grid: dict) -> tuple[tuple[int, int], set[Room]]:
    """Rooms on the room phase that yields the most of them."""
    rows = max(r for r, _ in grid) + 1
    cols = max(c for _, c in grid) + 1
    best: tuple[tuple[int, int], set[Room]] = ((0, 0), set())
    for pr in range(3):
        for pc in range(3):
            rooms = {
                (R, C)
                for R in range(rows // 3 + 1)
                for C in range(cols // 3 + 1)
                if _room_ok(grid, pr + 3 * R, pc + 3 * C)
            }
            if len(rooms) > len(best[1]):
                best = ((pr, pc), rooms)
    return best


def _block(b: Room) -> set[Room]:
    return {(b[0] + i, b[1] + j) for i in range(3) for j in range(3)}


def _min_covers(rooms: set[Room]) -> list[list[Room]]:
    """Every smallest set of 3x3-room blocks whose union is exactly ``rooms``."""
    cands = [b for b in rooms if _block(b) <= rooms]
    holders = {rm: [b for b in cands if rm in _block(b)] for rm in rooms}
    if any(not v for v in holders.values()):
        return []
    found: set[tuple[Room, ...]] = set()

    def search(chosen: list[Room], covered: set[Room], limit: int) -> None:
        rest = rooms - covered
        if not rest:
            found.add(tuple(sorted(chosen)))
            return
        if len(chosen) >= limit:
            return
        # Branch on the room the fewest blocks can cover.
        rm = min(rest, key=lambda x: len(holders[x]))
        for b in holders[rm]:
            search(chosen + [b], covered | _block(b), limit)

    for limit in range(1, min(len(cands), _MAX_BOARDS) + 1):
        search([], set(), limit)
        if found:
            return [list(c) for c in sorted(found)]
    return []
