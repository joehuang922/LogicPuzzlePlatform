"""Lattice, gray-square and clue detection for Whimsical Knight.

Design (see docs/whimsical-knight/whimsical-knight.md, "Puzzle Parser"):

The print has no border and no grid lines: the board is a lattice of solid dots,
gray hatched squares in some cells, and white circles / squares on dots and
midpoints. The photos also hold part of a neighbouring puzzle, the page's
dotted rule and (on one page) the knight-move diagram, so ``rectify_board``
doesn't apply. Like Hashi, the board is found from its marks:

1. **Dots.** Dark blobs of the lighting-normalised page that are small, round
   and solid. Work happens at ``WORK_SIZE`` on the long side.
2. **Lattice.** Each dot links to its nearest dot to the right and below (within
   a narrow angle) when the two are a similar size. Links far off their group's
   median length drop out, which cuts the gap between two puzzles (~1.5 pitch).
   Integer coordinates spread from one dot along the links; the group with the
   most dots in both directions is the board. The page's dotted rule only links
   vertically, so it never forms a 2-D group.
3. **Warp.** A homography from lattice indices to the photo (all found dots,
   RANSAC) maps the board onto a straight lattice of ``PITCH`` pixels.
4. **Gray squares.** The inner part of a cell is dark on average, after a blur
   that turns the hatching into an even tone.
5. **Clues.** A white circle or square is an enclosed white region (a hole in
   the ink) about the clue's size, centred on a dot or a midpoint. Its fill of
   its bounding box tells a square (~1.0) from a circle (~0.8; an annulus round
   a dot is a little less). The gap between two gray squares can be closed off
   by clues at both ends, but it is a long thin hole and fails the aspect test.

Measured: the three samples parse exactly (size, every gray cell and clue) from
full size down to 800 px on the long side, with or without JPEG q70; each canon
has a unique solution.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

WORK_SIZE = 1600
# Ink = darker than this fraction of the local paper.
INK_RATIO = 0.6
# Dot blob shape: bounding box aspect and fill of the box.
DOT_ASPECT = (0.6, 1.6)
DOT_MIN_FILL = 0.55
DOT_AREA = (12, 2500)
# Linked dots share an area within this ratio.
DOT_AREA_RATIO = 2.0
# A neighbour to the right/below sits within this slope of the axis.
LINK_SLOPE = 0.3
# Links outside this ratio of their group's median length drop out.
LINK_LENGTH = (0.85, 1.18)
# Lattice rows/columns holding under this share of the fullest one are strays (the dot
# of a "?" in the difficulty face links in ~1.2 pitch left of the board).
MIN_LINE_SHARE = 0.5

# Warped lattice: pixels between dots, and margin round the outer dots.
PITCH = 100
MARGIN = 60
# The warped board is blurred before reading so a hatched gray square reads solid
# (unblurred it is only ~55% ink, and its gaps leak into neighbouring holes).
WARP_BLUR = 5
# Board ink on the blurred warp: darker than this fraction of the paper.
BOARD_INK_RATIO = 0.8
# Gray: a cell's inner box (0.25-0.75) is darker than this on average. Measured on the
# three samples: gray 0.42-0.64 (one lightly printed), empty >= 0.98.
GRAY_MAX_LEVEL = 0.8
# Clue hole: area as a fraction of PITCH^2, and centre within this of a point.
HOLE_AREA = (0.04, 0.3)
HOLE_OFFSET = 0.15
HOLE_ASPECT = (0.7, 1.4)
# Hole fill of its bounding box: above this a square, else a circle.
SQUARE_MIN_FILL = 0.9


@dataclass
class WhimsicalKnightGeometry:
    rows: int
    cols: int
    gray: list[list[int]]
    circles: list[tuple[int, int]] = field(default_factory=list)
    squares: list[tuple[int, int]] = field(default_factory=list)
    quad: NDArray | None = None  # source-image corners TL, TR, BR, BL of the outer dots


def normalized(gray: NDArray, k: int) -> NDArray:
    k = k | 1
    bg = cv2.dilate(gray, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    bg = cv2.GaussianBlur(bg, (k, k), 0).astype(np.float32)
    return gray.astype(np.float32) / np.maximum(bg, 1)


def find_dots(gray: NDArray) -> NDArray:
    """Centres (x, y) and areas of small, round, solid ink blobs: shape (n, 3)."""
    norm = normalized(gray, max(31, max(gray.shape) // 25))
    ink = (norm < INK_RATIO).astype(np.uint8)
    n, _, stats, cents = cv2.connectedComponentsWithStats(ink, connectivity=8)
    out = []
    for i in range(1, n):
        _, _, w, h, area = stats[i]
        if not (DOT_AREA[0] <= area <= DOT_AREA[1]):
            continue
        if not (DOT_ASPECT[0] <= w / h <= DOT_ASPECT[1]):
            continue
        if area / (w * h) < DOT_MIN_FILL:
            continue
        out.append((cents[i][0], cents[i][1], area))
    return np.array(out, dtype=float).reshape(-1, 3)


def link_lattice(dots: NDArray) -> dict[int, tuple[int, int]]:
    """Integer (row, col) for the dots of the largest 2-D lattice group."""
    n = len(dots)
    links: list[tuple[int, int, str, float]] = []  # (from, to, "r"/"d", length)
    for i in range(n):
        x, y, a = dots[i]
        dx = dots[:, 0] - x
        dy = dots[:, 1] - y
        ratio = dots[:, 2] / a
        similar = (ratio <= DOT_AREA_RATIO) & (ratio >= 1 / DOT_AREA_RATIO)
        for kind, along, across in (("r", dx, dy), ("d", dy, dx)):
            ok = similar & (along > 0) & (np.abs(across) <= LINK_SLOPE * along)
            if ok.any():
                j = int(np.argmin(np.where(ok, np.hypot(dx, dy), np.inf)))
                links.append((i, j, kind, float(np.hypot(dx[j], dy[j]))))

    def groups(ls):
        parent = list(range(n))

        def find(u):
            while parent[u] != u:
                parent[u] = parent[parent[u]]
                u = parent[u]
            return u

        for i, j, _, _ in ls:
            parent[find(i)] = find(j)
        return find

    find = groups(links)
    # Drop links far off their group's median length, then regroup.
    by_group: dict[int, list[float]] = {}
    for i, _, _, length in links:
        by_group.setdefault(find(i), []).append(length)
    medians = {g: float(np.median(v)) for g, v in by_group.items()}
    kept = [
        ln for ln in links
        if LINK_LENGTH[0] * medians[find(ln[0])] <= ln[3] <= LINK_LENGTH[1] * medians[find(ln[0])]
    ]

    adj: dict[int, list[tuple[int, int, int]]] = {}
    for i, j, kind, _ in kept:
        di, dj = (0, 1) if kind == "r" else (1, 0)
        adj.setdefault(i, []).append((j, di, dj))
        adj.setdefault(j, []).append((i, -di, -dj))

    best: dict[int, tuple[int, int]] = {}
    seen: set[int] = set()
    for start in adj:
        if start in seen:
            continue
        coords = {start: (0, 0)}
        stack = [start]
        seen.add(start)
        while stack:
            u = stack.pop()
            r, c = coords[u]
            for v, di, dj in adj[u]:
                if v not in coords:
                    coords[v] = (r + di, c + dj)
                    seen.add(v)
                    stack.append(v)
        rows = {rc[0] for rc in coords.values()}
        cols = {rc[1] for rc in coords.values()}
        if len(rows) < 2 or len(cols) < 2:
            continue
        if len(coords) > len(best):
            best = coords
    if not best:
        return {}
    while True:
        row_n: dict[int, int] = {}
        col_n: dict[int, int] = {}
        for r, c in best.values():
            row_n[r] = row_n.get(r, 0) + 1
            col_n[c] = col_n.get(c, 0) + 1
        sparse_r = {r for r, k in row_n.items() if k < MIN_LINE_SHARE * max(row_n.values())}
        sparse_c = {c for c, k in col_n.items() if k < MIN_LINE_SHARE * max(col_n.values())}
        if not sparse_r and not sparse_c:
            break
        best = {i: rc for i, rc in best.items() if rc[0] not in sparse_r and rc[1] not in sparse_c}
    r0 = min(rc[0] for rc in best.values())
    c0 = min(rc[1] for rc in best.values())
    return {i: (r - r0, c - c0) for i, (r, c) in best.items()}


def detect_whimsical_knight(image: NDArray, debug_dir: str | None = None) -> WhimsicalKnightGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    full_gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    scale = min(1.0, WORK_SIZE / max(full_gray.shape))
    gray = cv2.resize(full_gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else full_gray

    dots = find_dots(gray)
    coords = link_lattice(dots)
    if len(coords) < 4:
        raise ValueError("whimsical_knight: no dot lattice found")
    rows = max(rc[0] for rc in coords.values()) + 1
    cols = max(rc[1] for rc in coords.values()) + 1
    if len(coords) != rows * cols:
        logger.warning("whimsical_knight: %d of %d lattice dots found", len(coords), rows * cols)

    idx = list(coords)
    src = np.array([[coords[i][1], coords[i][0]] for i in idx], dtype=np.float32)
    dst = np.array([dots[i, :2] for i in idx], dtype=np.float32) / scale
    H, _ = cv2.findHomography(src, dst, cv2.RANSAC, 0.15 * float(np.median(np.diff(sorted(dst[:, 0])))) + 3.0)
    if H is None:
        H, _ = cv2.findHomography(src, dst, 0)

    # Lattice index (col, row) -> warped pixel, composed with the fit.
    to_warp = np.array([[PITCH, 0, MARGIN], [0, PITCH, MARGIN], [0, 0, 1]], dtype=np.float64)
    M = to_warp @ np.linalg.inv(H)
    out_w = (cols - 1) * PITCH + 2 * MARGIN
    out_h = (rows - 1) * PITCH + 2 * MARGIN
    warped = cv2.warpPerspective(full_gray, M, (out_w, out_h), flags=cv2.INTER_AREA, borderValue=255)

    corners = np.array([[0, 0], [cols - 1, 0], [cols - 1, rows - 1], [0, rows - 1]], dtype=np.float64)
    quad = cv2.perspectiveTransform(corners.reshape(-1, 1, 2), H).reshape(-1, 2)

    norm = normalized(cv2.GaussianBlur(warped, (WARP_BLUR, WARP_BLUR), 0), 3 * PITCH)
    ink = (norm < BOARD_INK_RATIO).astype(np.uint8)

    gray_cells = read_gray(norm, rows, cols)
    circles, squares = read_clues(ink, rows, cols)

    if debug_path:
        vis = cv2.cvtColor(warped, cv2.COLOR_GRAY2BGR)
        for r in range(rows - 1):
            for c in range(cols - 1):
                if gray_cells[r][c]:
                    x, y = MARGIN + c * PITCH, MARGIN + r * PITCH
                    cv2.rectangle(vis, (x + 30, y + 30), (x + 70, y + 70), (0, 160, 0), 3)
        for dr, dc in circles:
            cv2.circle(vis, (MARGIN + dc * PITCH // 2, MARGIN + dr * PITCH // 2), 26, (255, 0, 0), 3)
        for dr, dc in squares:
            x, y = MARGIN + dc * PITCH // 2, MARGIN + dr * PITCH // 2
            cv2.rectangle(vis, (x - 26, y - 26), (x + 26, y + 26), (0, 0, 255), 3)
        cv2.imwrite(str(debug_path / "02_parsed.png"), vis)
        src_vis = image.copy() if image.ndim == 3 else cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        cv2.polylines(src_vis, [quad.astype(np.int32)], True, (0, 255, 0), 6)
        for i in idx:
            cv2.circle(src_vis, tuple(int(v) for v in dots[i, :2] / scale), 12, (0, 0, 255), -1)
        cv2.imwrite(str(debug_path / "01_lattice.png"), src_vis)

    return WhimsicalKnightGeometry(rows, cols, gray_cells, circles, squares, quad.astype(np.float32))


def read_gray(norm: NDArray, rows: int, cols: int) -> list[list[int]]:
    out = []
    for r in range(rows - 1):
        row = []
        for c in range(cols - 1):
            y0 = MARGIN + r * PITCH
            x0 = MARGIN + c * PITCH
            box = norm[y0 + PITCH // 4:y0 + 3 * PITCH // 4, x0 + PITCH // 4:x0 + 3 * PITCH // 4]
            row.append(int(box.mean() < GRAY_MAX_LEVEL))
        out.append(row)
    return out


def read_clues(ink: NDArray, rows: int, cols: int) -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
    """Enclosed white regions at dots and midpoints: circles and squares as (dr, dc)."""
    paper = (1 - ink).astype(np.uint8)
    n, labels, stats, cents = cv2.connectedComponentsWithStats(paper, connectivity=4)
    h, w = ink.shape
    circles: list[tuple[int, int]] = []
    squares: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if x == 0 or y == 0 or x + bw >= w or y + bh >= h:
            continue  # open to the page
        # Fill the hole's own interior (a dot inside a ring) before measuring it.
        mask = (labels[y:y + bh, x:x + bw] == i).astype(np.uint8)
        filled = mask.copy()
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cv2.drawContours(filled, cnts, -1, 1, -1)
        farea = float(filled.sum())
        if not (HOLE_AREA[0] * PITCH ** 2 <= farea <= HOLE_AREA[1] * PITCH ** 2):
            continue
        if not (HOLE_ASPECT[0] <= bw / bh <= HOLE_ASPECT[1]):
            continue
        cx = (x + bw / 2 - MARGIN) / PITCH * 2
        cy = (y + bh / 2 - MARGIN) / PITCH * 2
        dc, dr = int(round(cx)), int(round(cy))
        if abs(cx - dc) > 2 * HOLE_OFFSET or abs(cy - dr) > 2 * HOLE_OFFSET:
            continue
        if not (0 <= dr <= 2 * (rows - 1) and 0 <= dc <= 2 * (cols - 1)):
            continue
        if dr % 2 == 1 and dc % 2 == 1:
            continue
        if (dr, dc) in seen:
            continue
        seen.add((dr, dc))
        fill = farea / (bw * bh)
        on_dot = dr % 2 == 0 and dc % 2 == 0
        if on_dot and fill >= SQUARE_MIN_FILL:
            squares.append((dr, dc))
        else:
            circles.append((dr, dc))
    return sorted(circles), sorted(squares)
