"""Geometry of one nonogram clue strip.

A strip is a scan or photo of part of a big nonogram's clue area: some row
clues (left of the board) or some column clues (above it), plus a few cells of
the board next to them. Everything is anchored on the board:

- the *line separators* (between two clue lines) are the board's own grid
  lines carried into the clue area: solid, thick every 5;
- the *number separators* (between two numbers of one clue line) are dashed,
  and only in the clue area; their pitch is the clue cell's, not the board's;
- the board edge (the board's thick border next to the clues) is where every
  clue line ends, so numbers are counted from it.

The strip is first turned to a canonical layout: clue lines horizontal, board
on the right, so a row strip stays as is and a column strip is rotated a
quarter turn counter-clockwise (its rows then list columns right to left).
Lines are traced band by band, so a curled page or a slanted photo is
followed instead of assumed straight.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

import cv2
import numpy as np
from numpy.typing import NDArray

Orientation = Literal["rows", "cols"]


@dataclass
class Polyline:
    """A traced line: position across it, sampled along it at ``at``."""

    at: NDArray  # sample positions along the line (sorted)
    pos: NDArray  # line position at each sample

    def __call__(self, t: float | NDArray) -> float | NDArray:
        return np.interp(t, self.at, self.pos)


@dataclass
class StripGeometry:
    image: NDArray  # canonical BGR image
    orientation: Orientation
    row_pitch: float  # clue line spacing (px)
    cell_pitch: float  # clue cell width (px)
    edge: Polyline  # board edge x(y)
    separators: list[Polyline]  # line separators y(x), top to bottom
    extents: list[float]  # per separator: leftmost x it was traced to
    thick: list[bool]  # per separator: thick line (every 5th, or a border)
    start_border: bool  # separators[0] is the board's outer border
    end_border: bool  # separators[-1] is the board's outer border
    number_seps: list[list[float]] = field(default_factory=list)  # per clue line: x, edge first


# --- basics -----------------------------------------------------------------


def to_canonical(image: NDArray, orientation: Orientation) -> NDArray:
    if orientation == "cols":
        return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return image


def ink_mask(image: NDArray) -> NDArray:
    """Ink as 255 (adaptive, so uneven light and thin grey grid lines survive)."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, 10
    )


def solid_lines(ink: NDArray, horizontal: bool, length: int) -> NDArray:
    """Solid lines of one direction; dashes, digits and short strokes drop out."""
    bridge = (5, 1) if horizontal else (1, 5)
    ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, bridge))
    k = (length, 1) if horizontal else (1, length)
    return cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, k))


def find_peaks(profile: NDArray, min_gap: float, threshold: float) -> list[int]:
    """Local maxima above ``threshold``, at least ``min_gap`` apart (strongest first)."""
    order = np.argsort(-profile)
    taken: list[int] = []
    g = max(1, int(min_gap))
    for i in order:
        if profile[i] < threshold:
            break
        if any(abs(i - t) < g for t in taken):
            continue
        taken.append(int(i))
    return sorted(taken)


def regular_lines(profile: NDArray, pitch: float, *, strong: float = 0.5, weak: float = 0.08,
                  max_misses: int = 2) -> tuple[list[float], list[bool]]:
    """Lines at a regular pitch: anchored on the strong peaks, filled in by
    stepping one pitch at a time and snapping to the local maximum.

    Returns the positions and whether each was seen (False: predicted only).
    A walk stops after ``max_misses`` unseen steps, so it ends where the
    lines do.
    """
    n = len(profile)
    top = float(profile.max()) if n else 0.0
    if top <= 0:
        return [], []
    anchors = find_peaks(profile, 0.6 * pitch, strong * top)
    found: dict[int, tuple[float, bool]] = {}

    def key(x: float) -> int:
        return int(round(x / (0.5 * pitch)))

    for a in anchors:
        found.setdefault(key(a), (float(a), True))
        for d in (1, -1):
            x, misses = float(a), 0
            while True:
                pred = x + d * pitch
                if pred < 0 or pred >= n:
                    break
                lo, hi = max(0, int(pred - 0.3 * pitch)), min(n, int(pred + 0.3 * pitch) + 1)
                seg = profile[lo:hi]
                if seg.size and seg.max() > weak * top:
                    x, seen, misses = float(lo + int(np.argmax(seg))), True, 0
                else:
                    x, seen, misses = pred, False, misses + 1
                if misses > max_misses:
                    break
                k = key(x)
                if k in found and found[k][1]:
                    break  # joined a walk from another anchor
                found[k] = (x, seen)
    items = sorted(found.values())
    # Merge near-duplicates (two walks landing on the same line).
    out: list[tuple[float, bool]] = []
    for x, seen in items:
        if out and x - out[-1][0] < 0.5 * pitch:
            if seen and not out[-1][1]:
                out[-1] = (x, seen)
            continue
        out.append((x, seen))
    # Trim unseen predictions at both ends.
    while out and not out[0][1]:
        out.pop(0)
    while out and not out[-1][1]:
        out.pop()
    return [x for x, _ in out], [seen for _, seen in out]


def autocorr_pitch(profile: NDArray, lo: float, hi: float) -> float:
    p = profile - profile.mean()
    ac = np.correlate(p, p, "full")[len(p) - 1:]
    lo_i, hi_i = max(2, int(lo)), min(len(ac) - 1, int(hi))
    if hi_i <= lo_i:
        return float(lo)
    k = lo_i + int(np.argmax(ac[lo_i:hi_i]))
    # sub-pixel: parabola through the neighbours
    if 0 < k < len(ac) - 1:
        a, b, c = ac[k - 1], ac[k], ac[k + 1]
        den = a - 2 * b + c
        if den != 0:
            return float(k + 0.5 * (a - c) / den)
    return float(k)


# --- the board edge ---------------------------------------------------------


def _board_pitch_and_edge(vsolid: NDArray) -> tuple[float, float]:
    """The board's column pitch and the x of its left edge (canonical layout).

    Solid vertical lines exist only on the board side (the clue area's
    verticals are dashed and drop out of ``vsolid``), so the edge is the
    leftmost line of the regular run of solid verticals.
    """
    h, w = vsolid.shape
    # Middle third only: over the full height a curled page smears each line
    # sideways into a double peak.
    prof = vsolid[h // 3: 2 * h // 3].sum(0) / 255.0
    strong = find_peaks(prof, 8, 0.35 * prof.max())
    if not strong:
        raise ValueError("board not found: no solid grid lines next to the clues")
    guess = autocorr_pitch(prof, 15, min(400, w // 3))
    # The autocorrelation may lock onto the thick-line period (5 cells).
    # The autocorrelation may lock onto a multiple of the cell (the thick-line
    # period, or any few cells), so try its divisors. The board is the longest
    # evenly spaced run of solid lines; a title banner's edges or big
    # lettering never make one.
    best: list[float] = []
    best_p = 0.0
    for div in range(1, 7):
        p = guess / div
        if p < 15:
            break
        xs, seen = regular_lines(prof, p, strong=0.35, weak=0.15)
        run: list[float] = []
        for x, sn in zip(xs, seen):
            if sn and run and 0.75 * p < x - run[-1] < 1.3 * p:
                run.append(x)
            else:
                run = [x] if sn else []
            if len(run) > len(best):
                best, best_p = list(run), p
    # A strip may show only a few board columns; three lines running off
    # the image are enough.
    reaches_out = bool(best) and best[-1] > w - 1.5 * best_p
    if len(best) >= 4 or (len(best) >= 3 and reaches_out):
        return float(np.median(np.diff(best))), float(best[0])
    raise ValueError("board not found: no regular run of grid lines")


def _trace_vertical(vsolid: NDArray, x0: float, pitch: float, bands: int = 12) -> Polyline:
    h = vsolid.shape[0]
    edges = np.linspace(0, h, bands + 1).astype(int)
    at, pos = [], []
    for a, b in zip(edges[:-1], edges[1:]):
        lo, hi = int(x0 - 0.35 * pitch), int(x0 + 0.35 * pitch) + 1
        lo, hi = max(lo, 0), min(hi, vsolid.shape[1])
        prof = vsolid[a:b, lo:hi].sum(0)
        if prof.max() > 0.3 * (b - a) * 255:
            at.append((a + b) / 2)
            pos.append(lo + float(np.argmax(prof)))
    if len(at) < 2:
        return Polyline(np.array([0.0, float(h)]), np.array([x0, x0]))
    return Polyline(np.array(at), np.array(pos))


# --- line separators --------------------------------------------------------


def _trace_separators(
    hsolid: NDArray, edge: Polyline, board_pitch: float
) -> tuple[list[Polyline], list[float], float]:
    """Trace every line separator from the board side leftwards.

    Returns the polylines (top to bottom), how far left each was traced, and
    the clue line pitch.
    """
    h, w = hsolid.shape
    ex = float(np.median(edge.pos))
    # Reference band: just inside the board, where the lines are clean.
    r0, r1 = int(ex + 0.3 * board_pitch), int(min(w, ex + 3.3 * board_pitch))
    ref = hsolid[:, r0:r1].sum(1) / 255.0
    row_guess = autocorr_pitch(ref, 15, min(400, h // 3))
    ys: list[float] = []
    for div in range(1, 7):
        p = row_guess / div
        if p < 15:
            break
        cand, seen = regular_lines(ref, p, weak=0.1)
        real = [y for y, sn in zip(cand, seen) if sn]
        if len(real) >= 3 and np.median(np.diff(real)) < 1.3 * p and len(cand) > len(ys):
            ys = cand
    if len(ys) < 3:
        raise ValueError("no clue line separators found next to the board")
    row_pitch = float(np.median(np.diff(ys)))
    lines: list[list[tuple[float, float]]] = [[((r0 + r1) / 2, float(y))] for y in ys]
    extents = [float(r0)] * len(ys)
    alive = [True] * len(ys)
    misses = [0] * len(ys)
    band = max(20, int(0.8 * board_pitch))
    x = r0
    while x > 0 and any(alive):
        a, b = max(0, x - band), x
        prof = hsolid[:, a:b].sum(1) / 255.0
        cx = (a + b) / 2
        for i, pts in enumerate(lines):
            if not alive[i]:
                continue
            (x1, y1) = pts[-1]
            slope = 0.0
            if len(pts) >= 4:
                (x2, y2) = pts[-4]
                slope = (y1 - y2) / (x1 - x2) if x1 != x2 else 0.0
            pred = y1 + slope * (cx - x1)
            lo, hi = max(0, int(pred - 0.25 * row_pitch)), min(h, int(pred + 0.25 * row_pitch) + 1)
            seg = prof[lo:hi]
            if seg.size and seg.max() > 0.3 * (b - a):
                pts.append((cx, float(lo + int(np.argmax(seg)))))
                extents[i] = float(a)
                misses[i] = 0
                continue
            misses[i] += 1
            pts.append((cx, pred))
            if misses[i] >= 3:
                alive[i] = False
        x = a
    polys = []
    for pts, ext in zip(lines, extents):
        kept = sorted(p for p in pts if p[0] >= ext - band) or pts[:1]
        polys.append(Polyline(np.array([p[0] for p in kept]), np.array([p[1] for p in kept])))
    return polys, extents, row_pitch


def _fill_faint(
    seps: list[Polyline], extents: list[float], reach: float, max_gap: int = 10
) -> tuple[list[Polyline], list[float]]:
    """Carry faint separators across the clue grid from their neighbours.

    Some prints keep the thin lines between clue lines so light that they
    vanish among the numbers, while the thick every-5th lines stay clear.
    The lines of a printed grid are evenly spaced, so a separator that died
    out short of the clue grid's far side follows the nearest lines above and
    below that reach it, in proportion, shifted to meet its own traced part.
    """
    reaching = [i for i, e in enumerate(extents) if e <= reach]
    seps, extents = list(seps), list(extents)
    for i, e in enumerate(extents):
        if e <= reach:
            continue
        j = max((r for r in reaching if r < i), default=None)
        k = min((r for r in reaching if r > i), default=None)
        if j is None or k is None or k - j > max_gap:
            continue
        t = (i - j) / (k - j)
        far = max(extents[j], extents[k])
        own = seps[i]
        between = lambda x: (1 - t) * seps[j](x) + t * seps[k](x)  # noqa: E731
        shift = float(own(e)) - float(between(e))
        xs = np.linspace(far, e, max(2, int((e - far) / 20)), endpoint=False)
        kept = own.at >= e
        seps[i] = Polyline(
            np.concatenate([xs, own.at[kept]]),
            np.concatenate([between(xs) + shift, own.pos[kept]]),
        )
        extents[i] = far
    return seps, extents


def _recentre_strays(seps: list[Polyline], xs: NDArray, pitch: float, tol: float = 0.3) -> list[Polyline]:
    """Put a separator that strayed off the grid's rhythm back between its neighbours.

    A smudge, tape or crease on a line can lead its trace off by half a cell
    somewhere across the clue grid: there the gap above it shrinks as the gap
    below grows by as much. Printed lines are evenly spaced, so such a line
    goes midway between its neighbours (when they are a regular two pitches
    apart). ``xs`` sample the clue grid.
    """
    seps = list(seps)
    for i in range(1, len(seps) - 1):
        a, m, b = (np.array([float(s(x)) for x in xs]) for s in (seps[i - 1], seps[i], seps[i + 1]))
        up, down = m - a, b - m
        stray = (np.abs(up - down) > tol * pitch) & (np.abs(up + down - 2 * pitch) < 0.25 * pitch)
        if stray.any():
            lo, hi = seps[i - 1], seps[i + 1]
            at = np.union1d(lo.at, hi.at)
            seps[i] = Polyline(at, (lo(at) + hi(at)) / 2)
    return seps


def _thickness(gray: NDArray, line: Polyline, xs: NDArray, pitch: float) -> float:
    """Median dark-run thickness of a line across its own direction."""
    h = gray.shape[0]
    paper = np.percentile(gray, 60)
    dark = np.percentile(gray, 1)
    thr = dark + 0.5 * (paper - dark)
    runs = []
    for x in xs:
        x = int(x)
        if not 0 <= x < gray.shape[1]:
            continue
        y = int(round(float(line(x))))
        lo, hi = max(0, y - int(0.3 * pitch)), min(h, y + int(0.3 * pitch) + 1)
        col = gray[lo:hi, x] < thr
        if not col.any():
            continue
        c = y - lo
        if not 0 <= c < len(col):
            continue
        # run around the darkest point near the line
        idx = np.where(col)[0]
        k = idx[np.argmin(np.abs(idx - c))]
        a = k
        while a > 0 and col[a - 1]:
            a -= 1
        b = k
        while b < len(col) - 1 and col[b + 1]:
            b += 1
        runs.append(b - a + 1)
    return float(np.median(runs)) if runs else 0.0


def _classify_thick(widths: list[float]) -> list[bool]:
    """Thick lines come every 5th: find the phase whose lines are clearly
    wider than the rest. Outer borders (wider still) don't skew it."""
    w = np.array(widths, dtype=float)
    n = len(w)
    if n < 6:
        return [False] * n
    best, best_gap = None, 0.0
    for phase in range(5):
        on = w[phase::5]
        off = np.delete(w, np.arange(phase, n, 5))
        gap = float(np.median(on) - np.median(off))
        if gap > best_gap:
            best, best_gap = phase, gap
    thin = float(np.median(w))
    if best is None or best_gap < max(1.0, 0.25 * thin):
        return [False] * n
    return [(i - best) % 5 == 0 for i in range(n)]


# --- number separators ------------------------------------------------------


def _number_separators(
    ink: NDArray, seps: list[Polyline], extents: list[float], edge: Polyline, row_pitch: float
) -> tuple[list[list[float]], float]:
    """Per clue line, the dashed separators from the edge leftwards (edge first)."""
    h, w = ink.shape
    # Dashes cross the whole cell height; digits keep clear of its top and
    # bottom. So look for dashes only in the margins next to each separator,
    # where a digit's vertical stroke can't pass for one.
    near = np.zeros((h, w), np.uint8)
    far = np.zeros((h, w), np.uint8)
    xs_all = np.arange(0, w, 4)
    for sep in seps:
        pts = np.stack([xs_all, sep(xs_all)], 1).astype(np.int32)
        cv2.polylines(far, [pts], False, 255, max(3, int(2 * 0.24 * row_pitch)))
        cv2.polylines(near, [pts], False, 255, max(1, int(2 * 0.06 * row_pitch)))
    zone = cv2.bitwise_and(far, cv2.bitwise_not(near))
    dashed = cv2.bitwise_and(ink, zone)
    # Clue cell pitch over the whole clue area left of the edge.
    ex = float(np.median(edge.pos))
    left = int(max(0, min(extents)))
    prof_all = dashed[:, left:int(ex)].sum(0).astype(float)
    cell_pitch = autocorr_pitch(prof_all, 0.6 * row_pitch, 1.8 * row_pitch)
    out: list[list[float]] = []
    n = len(seps) - 1
    band = 3  # clue lines per band on each side
    for i in range(n):
        lo_i, hi_i = max(0, i - band), min(n, i + band + 1)
        yc = (float(seps[i](ex)) + float(seps[i + 1](ex))) / 2
        x_edge = float(edge(yc))
        y_top = int(min(float(seps[lo_i](ex)), float(seps[lo_i](left))))
        y_bot = int(max(float(seps[hi_i](ex)), float(seps[hi_i](left))))
        prof = dashed[max(0, y_top):min(h, y_bot), :].sum(0).astype(float)
        stop = max(0.0, max(extents[i], extents[i + 1]))
        xs = [x_edge]
        x = x_edge
        while x - cell_pitch > stop - 0.3 * cell_pitch:
            pred = x - cell_pitch
            a, b = int(pred - 0.25 * cell_pitch), int(pred + 0.25 * cell_pitch) + 1
            a, b = max(a, 0), min(b, w)
            seg = prof[a:b]
            if seg.size and seg.max() > 0.25 * (y_bot - y_top) * 255:
                x = float(a + int(np.argmax(seg)))
            else:
                x = pred
            xs.append(x)
        out.append(_regularize(xs, cell_pitch))
    return out, cell_pitch


def without_edge_line(geom: StripGeometry) -> NDArray:
    """The canonical image with the board's edge line painted out.

    The edge line is thick, and the cells next to it hold numbers that often
    touch it: a crop of such a cell takes in part of the line, which reads
    as an extra 1 or turns a digit into another. Only the long solid run
    of the line goes (digits' strokes are far shorter), so a digit touching
    it keeps its shape.
    """
    img = geom.image.copy()
    h, w = img.shape[:2]
    line = solid_lines(ink_mask(img), horizontal=False, length=max(40, h // 25))
    ys = np.arange(h)
    near = np.zeros((h, w), np.uint8)
    reach = max(3, int(0.2 * geom.cell_pitch))
    xs = np.asarray(geom.edge(ys), dtype=float)
    for y in range(h):
        x = int(round(xs[y]))
        near[y, max(0, x - reach):min(w, x + reach + 1)] = 255
    mask = cv2.dilate(cv2.bitwise_and(line, near), np.ones((3, 3), np.uint8))
    img[mask > 0] = 255
    return img


def _regularize(xs: list[float], pitch: float) -> list[float]:
    """Separators of one clue line as a smooth sequence.

    Cells along a line are evenly spaced, give or take a slow drift from page
    curl, so fit a quadratic in the cell index and replace any snap that
    strays from it (a digit stroke caught instead of a dash) by the fit. The
    board edge (index 0) is measured, not snapped, and stays.
    """
    n = len(xs)
    if n < 5:
        return xs
    k = np.arange(n, dtype=float)
    x = np.array(xs, dtype=float)
    keep = np.ones(n, bool)
    for _ in range(3):
        coef = np.polyfit(k[keep], x[keep], 2)
        resid = np.abs(x - np.polyval(coef, k))
        new_keep = resid < 0.1 * pitch
        new_keep[0] = True
        if (new_keep == keep).all():
            break
        keep = new_keep
    fit = np.polyval(coef, k)
    out = np.where(keep, x, fit)
    out[0] = xs[0]
    return out.tolist()


def _is_border(
    ink: NDArray, seps: list[Polyline], extents: list[float], edge: Polyline,
    row_pitch: float, *, first: bool,
) -> bool:
    """Is the outermost separator the board's border, or just where the image
    cuts the strip?

    Beyond a border the clue side is blank paper; beyond a cut there's a
    partial row of the clue grid (its dashes and numbers). It needs most of a
    row of image beyond the line to tell.
    """
    h = ink.shape[0]
    line = seps[0] if first else seps[-1]
    ex = float(np.median(edge.pos))
    x0 = int(max(0.0, float(np.median(extents))))
    xs = np.arange(x0, int(ex - 0.2 * row_pitch), 2)
    if xs.size == 0:
        return False
    ys = line(xs)
    d = -1 if first else 1
    beyond = ys + d * 0.85 * row_pitch
    if beyond.min() < 0 or beyond.max() >= h:
        return False  # not enough image beyond the line to tell
    def density(offset_lo: float, offset_hi: float, base: NDArray) -> float:
        total = 0
        for x, y in zip(xs, base):
            a, b = sorted((int(y + d * offset_lo), int(y + d * offset_hi)))
            total += int(ink[max(0, a):min(h, b), int(x)].sum() // 255)
        return total / (xs.size * (offset_hi - offset_lo))
    outside = density(0.2 * row_pitch, 0.8 * row_pitch, ys)
    inner = seps[1] if first else seps[-2]
    inside = density(0.2 * row_pitch, 0.8 * row_pitch, inner(xs)) if len(seps) > 2 else 0.0
    # The clue grid's dashes alone give every row ink; blank paper has ~none.
    return outside < 0.25 * max(inside, 1e-6) and outside < 0.02


# --- entry point ------------------------------------------------------------


def detect_strip(image: NDArray, orientation: Orientation) -> StripGeometry:
    canon = to_canonical(image, orientation)
    gray = cv2.cvtColor(canon, cv2.COLOR_BGR2GRAY)
    ink = ink_mask(canon)
    h, w = ink.shape
    vsolid = solid_lines(ink, horizontal=False, length=max(40, h // 25))
    board_pitch, edge_x = _board_pitch_and_edge(vsolid)
    edge = _trace_vertical(vsolid, edge_x, board_pitch)
    hsolid = solid_lines(ink, horizontal=True, length=max(30, int(1.2 * board_pitch)))
    seps, extents, row_pitch = _trace_separators(hsolid, edge, board_pitch)
    # The clue grid is a rectangle: a line traced past the common left
    # boundary followed a crease or a banner, not the grid.
    common = float(np.median(extents))
    extents = [max(e, common - 0.5 * board_pitch) for e in extents]
    seps, extents = _fill_faint(seps, extents, common + 0.5 * board_pitch)
    seps = _recentre_strays(seps, np.linspace(common, float(np.median(edge.pos)), 12), row_pitch)
    board_xs = float(np.median(edge.pos)) + board_pitch * (np.arange(4) + 0.5)
    widths = [_thickness(gray, s, board_xs, row_pitch) for s in seps]
    thick = _classify_thick(widths)
    # A border has no board line beyond it although the image goes on.
    start_border = _is_border(ink, seps, extents, edge, row_pitch, first=True)
    end_border = _is_border(ink, seps, extents, edge, row_pitch, first=False)
    number_seps, cell_pitch = _number_separators(ink, seps, extents, edge, row_pitch)
    return StripGeometry(
        image=canon,
        orientation=orientation,
        row_pitch=row_pitch,
        cell_pitch=cell_pitch,
        edge=edge,
        separators=seps,
        extents=extents,
        thick=thick,
        start_border=start_border,
        end_border=end_border,
        number_seps=number_seps,
    )


def draw(geom: StripGeometry) -> NDArray:
    """Debug overlay: separators red (thick: magenta), edge blue, number separators green."""
    out = geom.image.copy()
    h, w = out.shape[:2]
    ex = float(np.median(geom.edge.pos))
    for s, ext, thick in zip(geom.separators, geom.extents, geom.thick):
        xs = np.arange(int(ext), min(w, int(ex + 4 * geom.row_pitch)), 4)
        pts = np.stack([xs, s(xs)], 1).astype(np.int32)
        cv2.polylines(out, [pts], False, (255, 0, 255) if thick else (0, 0, 255), 3)
    ys = np.arange(0, h, 4)
    cv2.polylines(out, [np.stack([geom.edge(ys), ys], 1).astype(np.int32)], False, (255, 0, 0), 4)
    for i, xs in enumerate(geom.number_seps):
        y1, y2 = geom.separators[i], geom.separators[i + 1]
        for x in xs:
            cv2.line(out, (int(x), int(y1(x))), (int(x), int(y2(x))), (0, 170, 0), 2)
    return out
