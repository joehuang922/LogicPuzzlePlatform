"""Picturesque Maze (浮き出しメイロ) board detection: walls on an unprinted lattice.

Design, measured on the samples in ``docs/picturesque-maze`` (three scans and a
hand-held photo of the first, each at full size and at 2000px long side):

* **Locating the maze.** The outer border has two one-cell gaps (entrance and
  exit), so its contour never closes and the shared border finder locked onto
  the page, a title block or a strip of maze. The maze is the largest block of
  ink once one-cell gaps are closed (a closing 1.2% of the long side). Its
  rotated bounding box, grown by a margin, is drawn into the ``border_image``
  handed to ``rectify_board`` (the hook Picto Link uses): the warp keeps the
  whole maze even where a curled page bows the border past the corner chord.
  ``flatten_board`` can't trace a maze's lines (they break at every cell), so
  it returns the four-corner warp and the lattice below follows the curl.
* **Pitch.** No grid lines are printed, but every wall lies on a lattice line:
  wall strokes project to a comb whose first autocorrelation peak is the pitch.
* **Lattice.** Per window of ``_BLOCK`` cells along each border, the outer
  border lines are found at the edge of the maze's ink footprint (so a page rule
  or a ▼ marker outside can't pass for the border). Between them, the lines are
  placed by dynamic programming: each step within ``_STEP_SLACK`` of a cell,
  landing on the most wall ink, and the count is the one that fits best over
  all windows. Cells are not evenly spaced on a curled page: evenly spaced
  lines drifted half a cell mid-board (sample 1 read 56 columns, not 57).
* **Walls.** Each edge's strength is the ink contrast (against the local paper,
  so glare on a photo dims walls and paper together) along its middle. Walls
  and openings sit an order of magnitude apart; edges in between are settled by
  the maze's structure: the publishers print perfect mazes, so an uncertain edge
  opens only if it joins two parts not yet connected (Kruskal).
* **Openings.** The two weakest border edges; the entrance is the top-most,
  then left-most.

Results: every scan reads as a perfect maze (no loops, every cell reachable, a
unique route) at both sizes, 57x57, 50x50 and 120x80, and the routes draw a
panda, two dice and a samurai. The photo differs from its scan by one wall
(glare), which leaves one loop for the review to flag.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.signal import find_peaks

from puzzle_parsers.grid_utils import ink_intensity, rectify_board

# Closing kernel (fraction of the image's long side) that bridges the one-cell
# entrance/exit gaps when locating the maze. Cells measured 0.5-0.9% of the long side.
_LOCATE_CLOSE = 0.012
# Edges are also measured shifted up to this fraction of a cell sideways.
_SHIFT = 0.3
# Margin (fraction of the long side) between the maze and the frame handed to
# rectify_board. Cells measured 0.5-0.9% of the long side; bows up to ~1 cell.
_FRAME_MARGIN = 0.006
# A sample along an edge is ink if any pixel this far across the edge (cells) is dark.
_ACROSS = 0.15
# Fraction of an edge's length sampled, centred (the ends sit on junctions).
_ALONG = 0.6
# A step between neighbouring lattice lines may differ from the mean by this
# fraction (a curled page compresses cells near the spine).
_STEP_SLACK = 0.2
# Lattice block size (cells) for the local offset fit.
_BLOCK = 8

SIDES = ("top", "bottom", "left", "right")


@dataclass
class MazeGeometry:
    rows: int
    cols: int
    # (rows - 1) x cols and rows x (cols - 1), 1 = wall
    walls_h: list[list[int]]
    walls_v: list[list[int]]
    # Border openings as (side, index), entrance first.
    openings: list[tuple[str, int]]
    quad: NDArray
    # Wall strength per edge (0 paper .. 1 black), for debugging: h is
    # (rows + 1) x cols (border lines included), v is rows x (cols + 1).
    strength_h: NDArray = field(repr=False)
    strength_v: NDArray = field(repr=False)
    # Lattice points on the native board: (rows + 1) x (cols + 1) x 2, as (x, y).
    points: NDArray = field(repr=False)
    native: NDArray = field(repr=False)


def maze_border_image(image: NDArray) -> NDArray:
    """Grayscale image for ``rectify_board``: the maze's ink with a closed outline."""
    ink = ink_intensity(image)
    long_side = max(ink.shape[:2])
    dark = _dark_mask(ink, 31)
    k = max(3, int(long_side * _LOCATE_CLOSE))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
    closed = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, kernel)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(closed, 8)
    if n < 2:
        return ink
    best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    block = (labels == best).astype(np.uint8) * 255
    # Open away thin attachments: a page rule or a caption touching the border.
    block = cv2.morphologyEx(block, cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(block, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return ink
    outline = max(contours, key=cv2.contourArea)
    region = np.zeros_like(block)
    cv2.drawContours(region, [outline], -1, 255, -1)
    out = np.where(region > 0, ink, 255).astype(np.uint8)
    # The board's frame: the block's rotated bounding box grown by a margin, so
    # a border bowing past the four-corner chord (a curled page) stays inside
    # the warp. The lattice is anchored on the printed border later.
    (cx, cy), (bw, bh), angle = cv2.minAreaRect(outline)
    margin = 2 * long_side * _FRAME_MARGIN
    box = cv2.boxPoints(((cx, cy), (bw + margin, bh + margin), angle))
    h, w = ink.shape[:2]
    box[:, 0] = np.clip(box[:, 0], 1, w - 2)
    box[:, 1] = np.clip(box[:, 1], 1, h - 2)
    cv2.polylines(out, [np.round(box).astype(np.int32).reshape(-1, 1, 2)], True, 0, max(2, long_side // 800))
    return out


def _maze_block(dark: NDArray, cell: float) -> NDArray:
    """The maze's solid footprint on the board: ink closed across corridors,
    largest component, opened to drop rules and arrows attached to it."""
    k = max(3, int(round(cell * 1.5)))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
    closed = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, kernel)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(closed, 8)
    if n < 2:
        return closed
    best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    block = (labels == best).astype(np.uint8) * 255
    return cv2.morphologyEx(block, cv2.MORPH_OPEN, kernel)


def _dark_mask(gray: NDArray, block: int) -> NDArray:
    return cv2.adaptiveThreshold(
        cv2.GaussianBlur(gray, (3, 3), 0), 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block | 1, 10,
    )


def _strokes(dark: NDArray, horizontal: bool, length: int) -> NDArray:
    """Ink runs at least ``length`` px long along one axis (wall strokes)."""
    size = (length, 1) if horizontal else (1, length)
    return cv2.morphologyEx(dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, size))


def _comb_pitch(proj: NDArray) -> float | None:
    """First strong autocorrelation peak of a projection, sub-pixel."""
    p = proj.astype(np.float64) - proj.mean()
    if not np.any(p):
        return None
    ac = np.correlate(p, p, "full")[len(p) - 1:]
    ac /= ac[0]
    peaks, _ = find_peaks(ac[: max(8, len(ac) // 4)], height=0.3)
    peaks = [int(k) for k in peaks if k >= 4]
    if not peaks:
        return None
    i = peaks[0]
    a, b, c = ac[i - 1], ac[i], ac[i + 1]
    denom = a - 2 * b + c
    return float(i + (0.5 * (a - c) / denom if denom else 0.0))


def _window_centres(lo: float, hi: float, cell: float) -> tuple[NDArray, float]:
    """Window centres over the maze's extent ``lo..hi`` along one axis. They run
    to the maze's very edges (those windows are half in the margin), so the
    corners are interpolated, never extrapolated."""
    half = _BLOCK * cell / 2
    n_win = max(2, int(np.ceil((hi - lo) / half)) + 1)
    return np.linspace(lo, hi, n_win), half


def _profiles(strokes: NDArray, centres: NDArray, half: float, extent: float, horizontal: bool) -> list[NDArray]:
    out = []
    for c in centres:
        lo, hi = int(max(0, c - half)), int(min(extent, c + half))
        region = strokes[:, lo:hi] if horizontal else strokes[lo:hi, :]
        profile = region.sum(axis=1 if horizontal else 0).astype(np.float64) / 255.0
        out.append(np.convolve(profile, np.ones(3) / 3, "same"))
    return out


def _border_lines(
    profiles: list[NDArray], block_profiles: list[NDArray], centres: NDArray, half: float, extent: float, cell: float,
) -> tuple[NDArray, NDArray]:
    """First and last border line per window: the strong profile peak (ink along
    at least half the window: the border spans it but for one gap) nearest the
    edge of the maze's footprint. Rules and arrows outside the maze are never
    in the footprint, so they can't pass for the border."""
    first, last = [], []
    reach = max(1, int(round(cell)))
    n_win = len(centres)
    for w, (prof, bprof, c) in enumerate(zip(profiles, block_profiles, centres)):
        at_corner = w <= 1 or w >= n_win - 2
        width = min(extent, c + half) - max(0, c - half)
        inside = np.flatnonzero(bprof >= 0.5 * width)
        if len(inside) == 0:
            first.append(np.nan)
            last.append(np.nan)
            continue
        for edge, out in ((inside[0], first), (inside[-1], last)):
            lo, hi = max(0, edge - reach), min(len(prof), edge + reach + 1)
            seg = prof[lo:hi]
            k = int(np.argmax(seg))
            if seg[k] < 0.5 * width and not at_corner:
                out.append(np.nan)
                continue
            if seg[k] < 0.5 * width:
                # A border sloping across a corner window spreads its ink over
                # rows: there, accept a weaker line, but only at the footprint's edge.
                lo, hi = max(0, edge - reach // 2), min(len(prof), edge + reach // 2 + 1)
                seg = prof[lo:hi]
                k = int(np.argmax(seg))
                if seg[k] < 0.3 * width:
                    out.append(np.nan)
                    continue
            out.append(lo + k)
    return _smooth_border(np.array(first, float), centres, cell), _smooth_border(np.array(last, float), centres, cell)


def _smooth_border(arr: NDArray, centres: NDArray, cell: float) -> NDArray:
    """A border bends smoothly: a reading more than half a cell from the line
    through its neighbours (from one side at the ends, where a curl bends it
    most) is a stray (an arrow, a page edge) and is interpolated instead."""
    ok = ~np.isnan(arr)
    if ok.sum() < 2:
        raise ValueError("Could not find the maze's outer border")
    filled = _fill_along(arr, centres, ok, cell)
    n = len(filled)
    good = ok.copy()
    for k in range(n):
        if n < 3:
            break
        if 0 < k < n - 1:
            pred = np.interp(centres[k], [centres[k - 1], centres[k + 1]], [filled[k - 1], filled[k + 1]])
        elif k == 0:
            pred = filled[1] + (filled[1] - filled[2]) * (centres[0] - centres[1]) / (centres[1] - centres[2])
        else:
            pred = filled[-2] + (filled[-2] - filled[-3]) * (centres[-1] - centres[-2]) / (centres[-2] - centres[-3])
        if abs(filled[k] - pred) > 0.5 * cell:
            good[k] = False
    if good.sum() < 2:
        return filled
    return _fill_along(arr, centres, good, cell)


def _fill_along(arr: NDArray, centres: NDArray, good: NDArray, cell: float) -> NDArray:
    """``arr`` with the entries not ``good`` interpolated; missing ends continue
    the slope fitted to the last few good readings (a border bending into a
    corner), by at most a cell."""
    idx = np.flatnonzero(good)
    out = np.interp(centres, centres[idx], arr[idx])
    if len(idx) >= 3:
        for end, sel in ((idx[0], idx[:4]), (idx[-1], idx[-4:])):
            slope = np.polyfit(centres[sel], arr[sel], 1)[0]
            miss = np.arange(0, end) if end == idx[0] else np.arange(end + 1, len(arr))
            if len(miss):
                delta = np.clip((centres[miss] - centres[end]) * slope, -cell, cell)
                out[miss] = arr[end] + delta
    return out


def _dp_lines(prof: NDArray, first: float, last: float, n: int) -> tuple[NDArray, float]:
    """``n + 1`` line positions from ``first`` to ``last`` with every step within
    ``_STEP_SLACK`` of the mean, placed on the most ink (Viterbi over the profile).
    Returns the positions and the mean ink at the interior lines."""
    a, b = int(round(first)), int(round(last))
    span = b - a
    if span < n * 2:
        return np.linspace(first, last, n + 1), 0.0
    step = span / n
    lo, hi = max(1, int(np.floor(step * (1 - _STEP_SLACK)))), int(np.ceil(step * (1 + _STEP_SLACK)))
    seg = prof[a: b + 1]
    neg = -1e18
    score = np.full(span + 1, neg)
    score[0] = 0.0
    back = np.zeros((n, span + 1), dtype=np.int32)
    for i in range(1, n + 1):
        best = np.full(span + 1, neg)
        arg = np.zeros(span + 1, dtype=np.int32)
        for d in range(lo, hi + 1):
            cand = np.full(span + 1, neg)
            cand[d:] = score[: span + 1 - d]
            better = cand > best
            best[better] = cand[better]
            arg[better] = d
        if i < n:
            best = best + seg
        score, back[i - 1] = best, arg
    if score[span] <= neg / 2:
        return np.linspace(first, last, n + 1), 0.0
    pos = [span]
    for i in range(n, 0, -1):
        pos.append(pos[-1] - back[i - 1][pos[-1]])
    pos = np.array(pos[::-1], dtype=np.float64) + a
    return pos, float(score[span] / max(1, n - 1))


def _lattice(
    profiles: list[NDArray], first: NDArray, last: NDArray, pitch: float, centres: NDArray
) -> NDArray:
    """Lattice line positions per window, (n + 1, n_win).

    The count is the one (near span / pitch) whose best placement lands on the
    most ink summed over the windows. A line with almost no wall in a window
    (an open corridor there) is placed from the other windows instead.
    """
    guess = max(2, round(float(np.median(last - first)) / pitch))
    best_n, best_total, best_fit = guess, -1.0, None
    for n in range(max(2, guess - 2), guess + 3):
        fits = [_dp_lines(prof, f, l, n) for prof, f, l in zip(profiles, first, last)]
        total = sum(score for _, score in fits)
        if total > best_total:
            best_n, best_total, best_fit = n, total, fits
    fitted = np.array([pos for pos, _ in best_fit]).T  # (n + 1, n_win)
    lines = fitted.copy()
    n = best_n
    cell = float(np.median(last - first)) / n
    for i in range(1, n):
        ink = np.array([
            prof[max(0, int(y) - 1): int(y) + 2].max() for prof, y in zip(profiles, fitted[i])
        ])
        sure = ink >= cell * 0.8
        if sure.any() and not sure.all():
            lines[i, ~sure] = np.interp(centres[~sure], centres[sure], fitted[i, sure])
    # A line moved in from other windows must not fold into its neighbours:
    # where a step leaves 0.6..1.4 cells, both lines go back to their fit.
    for _ in range(3):
        steps = np.diff(lines, axis=0)
        bad = (steps < 0.6 * cell) | (steps > 1.4 * cell)
        if not bad.any():
            break
        rows_bad, wins = np.nonzero(bad)
        lines[rows_bad, wins] = fitted[rows_bad, wins]
        lines[rows_bad + 1, wins] = fitted[rows_bad + 1, wins]
    return lines


def _contrast(gray: NDArray, cell: float) -> NDArray:
    """Ink darkness relative to the local paper, 0 (paper) .. 1 (black): glare
    or a shadow on a photo changes both together, so a faint wall under glare
    still stands out from its own surroundings."""
    k = max(3, int(round(cell * 0.6))) | 1
    paper = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    paper = cv2.GaussianBlur(paper, (0, 0), cell * 0.5).astype(np.float32)
    return np.clip((paper - gray.astype(np.float32)) / np.maximum(paper, 1.0), 0.0, 1.0)


def _edge_strengths(contrast: NDArray, p0: NDArray, p1: NDArray, pitch: float, shift: float = 0.0) -> NDArray:
    """How strongly each edge (``p0[k]``-``p1[k]``) reads as a wall.

    Along the edge's middle (``_ALONG``; the ends sit on junctions), each sample
    takes the darkest contrast within ``_ACROSS`` cell across the edge; the
    edge's strength is the 30th percentile of its samples (a wall is dark nearly
    all along; an opening is paper). With ``shift`` the edge is also tried moved
    up to that fraction of a cell sideways, keeping the strongest: used on the
    border, where a corner's lattice may sit a little off a curled border.
    """
    d = p1 - p0
    length = np.maximum(np.hypot(d[:, 0], d[:, 1]), 1e-6)
    u = d / length[:, None]
    n = np.stack([-u[:, 1], u[:, 0]], axis=1)
    ts = np.linspace(0.5 - _ALONG / 2, 0.5 + _ALONG / 2, max(5, int(np.median(length) * _ALONG / 2)))
    reach = max(1, int(round(pitch * _ACROSS)))
    across = np.arange(-reach, reach + 1)
    max_shift = int(round(pitch * shift))
    h, w = contrast.shape
    best = np.zeros(len(p0))
    for step in range(-max_shift, max_shift + 1, max(1, max_shift // 3)):
        offs = (across + step)[None, None, :]
        centres = p0[:, None, :] + d[:, None, :] * ts[None, :, None]  # (E, T, 2)
        xs = centres[:, :, None, 0] + n[:, None, None, 0] * offs
        ys = centres[:, :, None, 1] + n[:, None, None, 1] * offs
        xs = np.clip(np.round(xs).astype(int), 0, w - 1)
        ys = np.clip(np.round(ys).astype(int), 0, h - 1)
        darkest = contrast[ys, xs].max(axis=2)  # (E, T)
        best = np.maximum(best, np.percentile(darkest, 30, axis=1))
    return best


def _otsu(values: NDArray) -> float:
    """Two-class split of 1-D values (Otsu)."""
    v = np.sort(values)
    best, best_t = -1.0, float(v[len(v) // 2])
    for k in range(1, len(v)):
        if v[k] == v[k - 1]:
            continue
        a, b = v[:k], v[k:]
        between = len(a) * len(b) * (a.mean() - b.mean()) ** 2
        if between > best:
            best, best_t = between, float((v[k - 1] + v[k]) / 2)
    return best_t


def _classify(strength_h: NDArray, strength_v: NDArray) -> tuple[float, float]:
    """(low, high): edges weaker than ``low`` are surely open, stronger than
    ``high`` surely walls; the band between is settled by the maze's structure.

    Strengths of walls and openings sit an order of magnitude apart, but the
    scale differs per image (a scan's walls ~0.8, a photo's ~0.4, openings
    ~0.03 on both), so a two-class split on log strength separates them first.
    ``low`` is just above the openings' spread; ``high`` is half the walls'
    median. Walls under glare on a photo measured down to 0.03.
    """
    every = np.concatenate([strength_h.ravel(), strength_v.ravel()])
    cut = np.exp(_otsu(np.log(every + 1e-3))) - 1e-3
    opens, walls = every[every <= cut], every[every > cut]
    low = float(np.percentile(opens, 99)) * 1.2 if len(opens) else cut
    high = float(np.median(walls)) * 0.5 if len(walls) else cut
    return min(low, high), max(low, high)


class _Components:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))

    def find(self, a: int) -> int:
        while self.parent[a] != a:
            self.parent[a] = self.parent[self.parent[a]]
            a = self.parent[a]
        return a

    def join(self, a: int, b: int) -> bool:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        self.parent[ra] = rb
        return True


def _resolve(strength_h: NDArray, strength_v: NDArray, low: float, high: float) -> tuple[NDArray, NDArray]:
    """Interior walls from edge strengths: (rows - 1) x cols and rows x (cols - 1).

    Sure openings (< ``low``) are open and sure walls (> ``high``) are walls.
    The publishers print perfect mazes (every cell reachable, no loops), so an
    uncertain edge is opened, weakest first, only when it joins two parts of
    the maze that aren't yet connected; one that would close a loop is a wall.
    Loops formed by sure openings stay: a maze may have them.
    """
    rows, cols = strength_v.shape[0], strength_h.shape[1]
    sh, sv = strength_h[1:-1], strength_v[:, 1:-1]
    wh = (sh >= low).astype(int)
    wv = (sv >= low).astype(int)
    comps = _Components(rows * cols)
    for r in range(rows - 1):
        for c in range(cols):
            if not wh[r, c]:
                comps.join(r * cols + c, (r + 1) * cols + c)
    for r in range(rows):
        for c in range(cols - 1):
            if not wv[r, c]:
                comps.join(r * cols + c, r * cols + c + 1)
    band = [(sh[r, c], "h", r, c) for r in range(rows - 1) for c in range(cols) if low <= sh[r, c] <= high]
    band += [(sv[r, c], "v", r, c) for r in range(rows) for c in range(cols - 1) if low <= sv[r, c] <= high]
    for _, kind, r, c in sorted(band):
        a = r * cols + c
        b = (r + 1) * cols + c if kind == "h" else a + 1
        if comps.join(a, b):
            (wh if kind == "h" else wv)[r, c] = 0
    return wh, wv


def _border_openings(strength_h: NDArray, strength_v: NDArray, high: float) -> list[tuple[str, int]]:
    """The entrance and exit: the two weakest border edges (below ``high``),
    entrance first (top-most, then left-most)."""
    rows, cols = strength_v.shape[0], strength_h.shape[1]
    edges = [(strength_h[0, j], 0, "top", j) for j in range(cols)]
    edges += [(strength_v[i, 0], 1, "left", i) for i in range(rows)]
    edges += [(strength_v[i, cols], 2, "right", i) for i in range(rows)]
    edges += [(strength_h[rows, j], 3, "bottom", j) for j in range(cols)]
    weakest = sorted(e for e in edges if e[0] < high)[:2]
    return [(side, k) for _, _, side, k in sorted(weakest, key=lambda e: (e[1], e[3]))]


def detect_maze(image: NDArray, debug_dir: str | Path | None = None) -> MazeGeometry:
    board = rectify_board(image, border_image=maze_border_image(image), debug_dir=debug_dir)
    native = board.native
    gray = ink_intensity(native)
    H, W = gray.shape[:2]
    dark = _dark_mask(gray, max(15, int(min(H, W) / 40)))

    stroke_len = max(5, int(min(H, W) / 150))
    pitch_y = _comb_pitch(_strokes(dark, True, stroke_len).sum(axis=1))
    pitch_x = _comb_pitch(_strokes(dark, False, stroke_len).sum(axis=0))
    if not pitch_y and not pitch_x:
        raise ValueError("Could not find the maze's cell size")
    pitch_y = pitch_y or pitch_x
    pitch_x = pitch_x or pitch_y
    # Wall strokes longer than half a cell: no letters, no stubs.
    h_long = _strokes(dark, True, max(3, int(pitch_x * 0.5)))
    v_long = _strokes(dark, False, max(3, int(pitch_y * 0.5)))

    # Horizontal lines, per window along x; vertical lines, per window along y,
    # over the maze's footprint (the warp keeps a margin around it).
    block = _maze_block(dark, (pitch_x + pitch_y) / 2)
    ys_in, xs_in = np.nonzero(block)
    if len(xs_in) == 0:
        raise ValueError("Could not find the maze")
    x_lo, x_hi = float(np.percentile(xs_in, 0.5)), float(np.percentile(xs_in, 99.5))
    y_lo, y_hi = float(np.percentile(ys_in, 0.5)), float(np.percentile(ys_in, 99.5))
    cx, half_x = _window_centres(x_lo, x_hi, pitch_x)
    cy, half_y = _window_centres(y_lo, y_hi, pitch_y)
    prof_h = _profiles(h_long, cx, half_x, W, True)
    prof_v = _profiles(v_long, cy, half_y, H, False)
    top, bottom = _border_lines(prof_h, _profiles(block, cx, half_x, W, True), cx, half_x, W, pitch_y)
    left, right = _border_lines(prof_v, _profiles(block, cy, half_y, H, False), cy, half_y, H, pitch_x)
    y_lines = _lattice(prof_h, top, bottom, pitch_y, cx)  # (rows + 1, n_win_x)
    x_lines = _lattice(prof_v, left, right, pitch_x, cy)  # (cols + 1, n_win_y)
    rows, cols = len(y_lines) - 1, len(x_lines) - 1
    py, px = float(np.median(bottom - top)) / rows, float(np.median(right - left)) / cols

    # Lattice point (i, j): line i's y at column j's x, and line j's x at row i's y.
    x_mean = x_lines.mean(axis=1)
    y_mean = y_lines.mean(axis=1)
    points = np.zeros((rows + 1, cols + 1, 2))
    for i in range(rows + 1):
        points[i, :, 1] = np.interp(x_mean, cx, y_lines[i])
    for j in range(cols + 1):
        points[:, j, 0] = np.interp(y_mean, cy, x_lines[j])
    pitch = (px + py) / 2

    contrast = _contrast(gray, pitch)
    str_h = _edge_strengths(contrast, points[:, :-1].reshape(-1, 2), points[:, 1:].reshape(-1, 2), pitch)
    str_h = str_h.reshape(rows + 1, cols)
    str_v = _edge_strengths(contrast, points[:-1, :].reshape(-1, 2), points[1:, :].reshape(-1, 2), pitch)
    str_v = str_v.reshape(rows, cols + 1)
    low, high = _classify(str_h, str_v)
    wh, wv = _resolve(str_h, str_v, low, high)
    walls_h, walls_v = wh.tolist(), wv.tolist()
    # Border edges again, allowing a curled corner's lattice to sit off the border.
    border_h, border_v = str_h.copy(), str_v.copy()
    for i in (0, rows):
        border_h[i] = _edge_strengths(contrast, points[i, :-1], points[i, 1:], pitch, _SHIFT)
    for j in (0, cols):
        border_v[:, j] = _edge_strengths(contrast, points[:-1, j], points[1:, j], pitch, _SHIFT)
    openings = _border_openings(border_h, border_v, high)

    geom = MazeGeometry(
        rows=rows, cols=cols, walls_h=walls_h, walls_v=walls_v, openings=openings,
        quad=board.quad, strength_h=str_h, strength_v=str_v, points=points, native=native,
    )
    if debug_dir:
        Path(debug_dir).mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(Path(debug_dir) / "maze_overlay.png"), draw_overlay(geom))
    return geom


def draw_overlay(geom: MazeGeometry) -> NDArray:
    """The native board with read walls in red and openings in green."""
    vis = geom.native.copy()
    if vis.ndim == 2:
        vis = cv2.cvtColor(vis, cv2.COLOR_GRAY2BGR)
    vis = cv2.addWeighted(vis, 0.45, np.full_like(vis, 255), 0.55, 0)
    pts = geom.points
    t = max(1, int(round(min(pts[1, 1] - pts[0, 0]) * 0.12)))

    def seg(a, b, color):
        cv2.line(vis, tuple(int(v) for v in a), tuple(int(v) for v in b), color, t)

    rows, cols = geom.rows, geom.cols
    red = (0, 0, 220)
    for j in range(cols):
        if ("top", j) not in geom.openings:
            seg(pts[0, j], pts[0, j + 1], red)
        if ("bottom", j) not in geom.openings:
            seg(pts[rows, j], pts[rows, j + 1], red)
    for i in range(rows):
        if ("left", i) not in geom.openings:
            seg(pts[i, 0], pts[i + 1, 0], red)
        if ("right", i) not in geom.openings:
            seg(pts[i, cols], pts[i + 1, cols], red)
    for i in range(rows - 1):
        for j in range(cols):
            if geom.walls_h[i][j]:
                seg(pts[i + 1, j], pts[i + 1, j + 1], red)
    for i in range(rows):
        for j in range(cols - 1):
            if geom.walls_v[i][j]:
                seg(pts[i, j + 1], pts[i + 1, j + 1], red)
    for side, k in geom.openings:
        if side == "top":
            seg(pts[0, k], pts[0, k + 1], (0, 180, 0))
        elif side == "bottom":
            seg(pts[geom.rows, k], pts[geom.rows, k + 1], (0, 180, 0))
        elif side == "left":
            seg(pts[k, 0], pts[k + 1, 0], (0, 180, 0))
        else:
            seg(pts[k, geom.cols], pts[k + 1, geom.cols], (0, 180, 0))
    return vis
