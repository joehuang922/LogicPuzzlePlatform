"""Hashi island detection: circles first, then the lattice they sit on.

The print has no grid lines or border, only circled numbers on an implicit
lattice, so ``rectify_board`` / ``find_grid_lines`` don't apply. Kuralin and
Tentai Show find the grid from its lines and then probe lattice points for
circles; Hashi flips that order:

1. **Rings.** Outer contours of the binarized page that are round, fill their
   enclosing circle and hold a large hole (the inside of the ring).
2. **Board.** Rings of the same radius chain into one board when neighbours
   are within ~2.3 pitches. A board's islands are never further apart than two
   pitches plus one empty line; puzzles on the same page sit about three pitches
   apart, and the rule example's circles are smaller. The largest group wins.
3. **Lattice.** The page's lean comes from near-horizontal pairs, then the
   horizontal and vertical pitch from a comb fit over the offsets between
   nearby rings. Integer coordinates spread outwards from one ring by rounding
   each *local* offset to the pitch, so a curved page or leaning photo (centres
   drifting a quarter pitch across the board) still rounds correctly.
   Empty rows and columns inside the board come out as a two-pitch step.
4. **Recovery.** Every empty lattice point inside the board is probed for a
   ring at its position interpolated from the nearby islands.
   Contours miss a ring whose thin stroke breaks into an open arc (the curled
   left edge of the medium sample) or whose digit touches it. The probe asks for
   ink in nearly every sector of the circle, not a share of the whole
   perimeter: an empty point between two islands a pitch apart crosses both of
   their rings (half the perimeter inked), but only in the sectors facing them.
   An island also has its digit at the centre, where an empty point is bare
   paper. Points beyond the board aren't probed: there the thumb, the title and
   the puzzle number badge pass both tests, and every outer row and column
   already has a contour-detected island.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.cell_ocr import crop_cell
from puzzle_parsers.ring_probe import INK_CONTRAST, paper_level

# Long side the ring search shrinks larger images to (the photos run 3000-4300 px).
WORK_SIZE = 1600
# Ring shape tests on the binarized contours.
MIN_CIRCULARITY = 0.75
MIN_DISC_FILL = 0.8
MIN_HOLE = 0.4
MIN_AREA = 150
# Rings of one board share a radius within this ratio.
RADIUS_RATIO = 1.25
# Single-link distance that chains a board's rings, in ring radii (~2.3 pitches).
LINK_RADII = 4.6
# Pitch search range, in ring radii: circles nearly touch at 1.9 r.
PITCH_RANGE = (1.5, 3.0)
# Recovery probe: radii and centre offsets as fractions of the ring radius.
PROBE_RADII = np.arange(0.80, 1.06, 0.03)
PROBE_OFFSETS = np.linspace(-0.15, 0.15, 7)
PROBE_SECTORS = 8
# A sector is inked when this share of its samples is ink. A broken stroke
# leaves a gap of up to two sectors; an empty point between two islands crosses
# their rings in at most 5 (measured on the samples, full size down to 1080 px).
SECTOR_INK = 0.5
MIN_INKED_SECTORS = PROBE_SECTORS - 2
# Ink share of the box (half-side 0.45 r) at the centre: islands >= 0.2 (the
# digit), empty points 0.0.
MIN_DIGIT_INK = 0.1
DIGIT_BOX = 0.45
# Islands used to interpolate an empty lattice point's position.
LOCAL_FIT_POINTS = 6


@dataclass
class Island:
    row: int
    col: int
    x: float  # centre, full-image pixels
    y: float
    radius: float


@dataclass
class HashiGeometry:
    rows: int
    cols: int
    islands: list[Island]
    radius: float
    quad: NDArray = field(repr=False)  # 4x2 corners (TL, TR, BR, BL) around the board


def detect_hashi_islands(img_bgr: NDArray, debug_dir: str | None = None) -> HashiGeometry:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY) if img_bgr.ndim == 3 else img_bgr
    rings = _find_rings(gray)
    if len(rings) == 0:
        raise ValueError("No circled islands found")
    board = rings[_largest_group(rings)]
    islands = _recover_missed(gray, _fit_lattice(board))
    rows = max(i.row for i in islands) + 1
    cols = max(i.col for i in islands) + 1
    radius = float(np.median([i.radius for i in islands]))
    geom = HashiGeometry(rows=rows, cols=cols, islands=islands, radius=radius, quad=_quad(islands, radius))
    if debug_dir:
        _write_debug(img_bgr, geom, Path(debug_dir))
    return geom


def _find_rings(gray: NDArray) -> NDArray:
    """(x, y, r) of every ring-shaped contour, in full-image pixels."""
    scale = min(1.0, WORK_SIZE / max(gray.shape))
    small = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    bw = cv2.adaptiveThreshold(small, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 51, 15)
    # A thin, faint stroke (a curled page's edge) can break into an open arc.
    bw = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contours, hierarchy = cv2.findContours(bw, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    found = []
    for i, contour in enumerate(contours):
        if hierarchy[0][i][3] != -1:
            continue
        area = cv2.contourArea(contour)
        perimeter = cv2.arcLength(contour, True)
        if area < MIN_AREA or perimeter == 0:
            continue
        (x, y), r = cv2.minEnclosingCircle(contour)
        hole = 0.0
        child = hierarchy[0][i][2]
        while child != -1:
            hole = max(hole, cv2.contourArea(contours[child]))
            child = hierarchy[0][child][0]
        if (
            4 * np.pi * area / perimeter**2 > MIN_CIRCULARITY
            and area / (np.pi * r * r) > MIN_DISC_FILL
            and hole > MIN_HOLE * area
        ):
            found.append((x / scale, y / scale, r / scale))
    return np.array(found, dtype=float).reshape(-1, 3)


def _largest_group(rings: NDArray) -> list[int]:
    """Indexes of the largest chain of same-sized, nearby rings."""
    n = len(rings)
    parent = list(range(n))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(n):
        for j in range(i + 1, n):
            ri, rj = rings[i, 2], rings[j, 2]
            if max(ri, rj) / min(ri, rj) > RADIUS_RATIO:
                continue
            if np.hypot(*(rings[i, :2] - rings[j, :2])) < LINK_RADII * (ri + rj) / 2:
                parent[root(i)] = root(j)
    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(root(i), []).append(i)
    return max(groups.values(), key=len)


def _comb_pitch(offsets: NDArray, lo: float, hi: float) -> float:
    """The period in [lo, hi] that best explains ``offsets`` as integer multiples."""
    if len(offsets) == 0:
        return (lo + hi) / 2
    candidates = np.linspace(lo, hi, 400)
    scores = np.cos(2 * np.pi * offsets[None, :] / candidates[:, None]).mean(axis=1)
    return float(candidates[int(np.argmax(scores))])


def _fit_lattice(board: NDArray) -> list[Island]:
    """Integer (row, col) per ring, rows and columns counted from 0."""
    radius = float(np.median(board[:, 2]))
    link = LINK_RADII * radius
    n = len(board)
    dist = np.hypot(*(board[:, None, :2] - board[None, :, :2]).transpose(2, 0, 1))
    pairs = [(i, j) for i in range(n) for j in range(n) if i != j and dist[i, j] < link]

    lean = [
        np.arctan2(dy, dx)
        for i, j in pairs
        for dx, dy in [board[j, :2] - board[i, :2]]
        if dx > 2 * radius and abs(dy) < 0.25 * dx
    ]
    theta = float(np.median(lean)) if lean else 0.0
    cos, sin = np.cos(theta), np.sin(theta)
    # Rotate centres by -theta so rows run horizontally.
    xy = np.stack([board[:, 0] * cos + board[:, 1] * sin, -board[:, 0] * sin + board[:, 1] * cos], axis=1)

    lo, hi = PITCH_RANGE[0] * radius, PITCH_RANGE[1] * radius
    dx = np.array([abs(xy[j, 0] - xy[i, 0]) for i, j in pairs])
    dy = np.array([abs(xy[j, 1] - xy[i, 1]) for i, j in pairs])
    px, py = _comb_pitch(dx, lo, hi), _comb_pitch(dy, lo, hi)

    neighbours: dict[int, list[int]] = {i: [] for i in range(n)}
    for i, j in pairs:
        neighbours[i].append(j)
    coords: list[tuple[int, int] | None] = [None] * n
    for seed in range(n):
        if coords[seed] is not None:
            continue
        # A ring with no neighbours in range would be its own board; place it by
        # the global pitch from ring 0 rather than drop it.
        if seed == 0:
            coords[0] = (0, 0)
        else:
            coords[seed] = (
                int(round((xy[seed, 1] - xy[0, 1]) / py)),
                int(round((xy[seed, 0] - xy[0, 0]) / px)),
            )
        queue = [seed]
        while queue:
            i = queue.pop(0)
            for j in sorted(neighbours[i], key=lambda j: dist[i, j]):
                if coords[j] is None:
                    ri, ci = coords[i]
                    coords[j] = (
                        ri + int(round((xy[j, 1] - xy[i, 1]) / py)),
                        ci + int(round((xy[j, 0] - xy[i, 0]) / px)),
                    )
                    queue.append(j)

    r0 = min(c[0] for c in coords)
    c0 = min(c[1] for c in coords)
    by_point: dict[tuple[int, int], Island] = {}
    for k, (r, c) in enumerate(coords):
        island = Island(r - r0, c - c0, float(board[k, 0]), float(board[k, 1]), float(board[k, 2]))
        # Two rings on one point: keep the one nearer its expected size.
        prev = by_point.get((island.row, island.col))
        if prev is None or abs(island.radius - radius) < abs(prev.radius - radius):
            by_point[(island.row, island.col)] = island
    return list(by_point.values())


def _point_position(islands: list[Island], row: int, col: int) -> tuple[float, float]:
    """Image position of a lattice point from an affine fit of its nearest islands."""
    near = sorted(islands, key=lambda i: (i.row - row) ** 2 + (i.col - col) ** 2)[:LOCAL_FIT_POINTS]
    a = np.array([[i.col, i.row, 1.0] for i in near])
    b = np.array([[i.x, i.y] for i in near])
    coef, *_ = np.linalg.lstsq(a, b, rcond=None)
    x, y = np.array([col, row, 1.0]) @ coef
    return float(x), float(y)


def _recover_missed(gray: NDArray, islands: list[Island]) -> list[Island]:
    """Probe every empty lattice point inside the board for a ring."""
    radius = float(np.median([i.radius for i in islands]))
    rows = max(i.row for i in islands) + 1
    cols = max(i.col for i in islands) + 1
    taken = {(i.row, i.col) for i in islands}
    found = list(islands)
    for r in range(rows):
        for c in range(cols):
            if (r, c) in taken:
                continue
            x, y = _point_position(islands, r, c)
            ring = _probe_ring(gray, x, y, radius)
            if ring is not None and _digit_ink(gray, *ring, radius) >= MIN_DIGIT_INK:
                found.append(Island(r, c, ring[0], ring[1], radius))
    return found


def _digit_ink(gray: NDArray, x: float, y: float, radius: float) -> float:
    """Ink share of the box at a ring's centre, where its digit sits."""
    half = DIGIT_BOX * radius
    box = crop_cell(gray, y - half, y + half, x - half, x + half, margin=0)
    return float((box < paper_level(gray, x, y, 2 * radius) - INK_CONTRAST).mean())


def _probe_ring(gray: NDArray, x0: float, y0: float, radius: float) -> tuple[float, float] | None:
    """Centre of a ring of about ``radius`` near (x0, y0) inked all round, or None."""
    h, w = gray.shape
    dark_thr = paper_level(gray, x0, y0, 2 * radius) - INK_CONTRAST
    oy, ox = np.meshgrid(PROBE_OFFSETS, PROBE_OFFSETS, indexing="ij")
    cx = x0 + ox.ravel() * radius
    cy = y0 + oy.ravel() * radius
    best: tuple[int, float, float, float] | None = None  # (sectors, ink, x, y)
    for f in PROBE_RADII:
        rr = f * radius
        n = PROBE_SECTORS * max(6, int(2 * np.pi * rr / 3 / PROBE_SECTORS))
        angles = 2 * np.pi * np.arange(n) / n
        xs = np.round(cx[:, None] + rr * np.cos(angles)).astype(int)
        ys = np.round(cy[:, None] + rr * np.sin(angles)).astype(int)
        inside = (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
        dark = np.zeros(xs.shape, dtype=bool)
        dark[inside] = gray[ys[inside], xs[inside]] < dark_thr
        per_sector = dark.reshape(len(cx), PROBE_SECTORS, -1).mean(axis=2)
        sectors = (per_sector >= SECTOR_INK).sum(axis=1)
        ink = dark.mean(axis=1)
        k = int(np.lexsort((ink, sectors))[-1])
        cand = (int(sectors[k]), float(ink[k]), float(cx[k]), float(cy[k]))
        if best is None or cand[:2] > best[:2]:
            best = cand
    if best is None or best[0] < MIN_INKED_SECTORS:
        return None
    return best[2], best[3]


def _quad(islands: list[Island], radius: float) -> NDArray:
    xs = [i.x for i in islands]
    ys = [i.y for i in islands]
    x1, x2 = min(xs) - 1.5 * radius, max(xs) + 1.5 * radius
    y1, y2 = min(ys) - 1.5 * radius, max(ys) + 1.5 * radius
    return np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], dtype=np.float32)


def _write_debug(img_bgr: NDArray, geom: HashiGeometry, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    vis = img_bgr.copy() if img_bgr.ndim == 3 else cv2.cvtColor(img_bgr, cv2.COLOR_GRAY2BGR)
    thick = max(2, int(geom.radius / 15))
    for i in geom.islands:
        cv2.circle(vis, (int(i.x), int(i.y)), int(i.radius), (0, 0, 255), thick)
        cv2.putText(
            vis, f"{i.row},{i.col}", (int(i.x - i.radius), int(i.y - i.radius)),
            cv2.FONT_HERSHEY_SIMPLEX, geom.radius / 50, (255, 0, 0), thick,
        )
    cv2.polylines(vis, [geom.quad.astype(np.int32)], True, (0, 160, 0), thick)
    cv2.imwrite(str(out / "hashi_islands.png"), vis)
