"""Lattice nodes of a slitherlink board drawn with dashed lines (Gakken style).

Gakken pages draw the grid as thin dashed lines, outer border included: no dots
at the vertices and no solid border for ``rectify_board`` to find. Each crossing
carries a ``+`` dash (``T``/``L`` on the border), so the crossings play the part
of the dots and feed the same lattice fit (``grid_detector._fit_lattice_grid``),
which already follows a curved page.

Pipeline (``grid_detector._dashed_lattice`` drives it):
1. Level a tilted photo (``deskew_angle``) and scale the page so a cell is at
   most ``WORK_PITCH`` px; the nodes are mapped back afterwards.
2. Cell pitch from the page's ink autocorrelation (``estimate_cell_pitch``).
3. Ink mask; erase the bold clue digits (long stroke cores thicker than the
   grid line), so stacked digits can't bridge into a long vertical "line".
4. Per axis, close by a fraction of a cell to join the dashes into solid lines,
   then open by most of a cell to keep only lines. The crossings of the two
   masks are the lattice nodes.
5. After the lattice fit, ``refine_rows_cols`` extends the grid over border
   lines whose nodes were too faint to find and keeps the longest run of lines
   joined by dashed edges -- a neighbouring puzzle a fraction of a cell away
   (Q87 under Q86) lines up with the lattice but has no dashes joining it, and
   past a border there are no dashes at all.

Samples (``docs/slitherlink/board-slitherlink-gakken-*.jpg``): Q81 10x10 beside
a neighbouring puzzle and a dashed separator, Q86 15x20 above Q87, Q90 40x35 on
a curved page with a faint top edge. All read their size and every clue at full
size and at 2000px, upright and tilted 2 degrees.
"""
from __future__ import annotations

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import estimate_cell_pitch

# Cell size (px) a page is scaled down to before finding lines; pages with
# smaller cells are used as they are. At full resolution a photo's paper grain
# thresholds into specks that bridge into stray crossings and misnumber the
# lattice (Q86 at 147px cells misread 22 clues; at 80px none). 48-64 broke the
# 78px-cell Q90.
WORK_PITCH = 80
# Rotation search: range (degrees) and the long side it runs at. A phone photo
# of a page is rarely more than a few degrees off.
_DESKEW_MAX = 6.0
_DESKEW_SIDE = 1000
# Below this rotation (degrees) the page is used as it is: rotating resamples
# faint dashes (Q90 sits at -0.4 deg and read 36 rows instead of 40 at 1600px
# once rotated), and the line kernels tolerate a degree.
DESKEW_MIN = 1.0
# Adaptive-threshold offset (grey levels below the local mean, over a half-cell
# window). 5 and 8 read every sample alike.
_INK_OFFSET = 8
# Dash gaps are under a quarter cell in every sample; closing by this fraction
# of the pitch makes each grid line solid without reaching the next line.
_CLOSE_FRAC = 0.25
# A line must run continuously for this fraction of a cell. Digits (under half
# a cell) and short text strokes fall away.
_OPEN_FRAC = 0.7
# Stroke cores whose half-width exceeds this multiple of the grid line's full
# thickness are clue digits: the bold Nikoli digits are about twice as thick as
# the lines. 0.8-1.0 found the same boards; lower starts eating faint lines.
_DIGIT_CORE = 0.9
# A core at least this long (in cells) is a digit stroke, not a crossing.
_DIGIT_CORE_MIN_CELLS = 0.15
# An edge is inked when this fraction of its length (ends excluded) lies on a
# bridged line; a line or a join between lines needs it on average. Q90's
# faint top border scores 0.49 at full size; a non-line (the gap between Q86
# and Q87, the margin past a border) scores under 0.1.
_EDGE_COVER_MIN = 0.35
# An extension's distance from the line inside it may differ from that line's
# own step by at most this fraction.
_EXTEND_STEP_TOL = 0.2
# How far (in cells) an extrapolated border line may move to land on its ink.
_SNAP_REACH = 0.3
# Coverage reads the line masks widened to this fraction of a cell, so a node
# a little off its traced position (a faint corner of a curved page) still
# finds its edges.
_COVER_TOL = 0.08
# Fraction of each edge, at either end, left out of the coverage sample: the
# crossing there belongs to the other axis too.
_EDGE_END = 0.15


class DashedLattice:
    """Line masks and node points of a dashed-line board."""

    def __init__(self, gray: NDArray) -> None:
        self.pitch = estimate_cell_pitch(gray)
        self.points = np.empty((0, 2))
        self.h_lines = self.v_lines = np.zeros(gray.shape, np.uint8)
        if self.pitch is None or self.pitch < 8:
            return
        pitch = self.pitch
        block = max(3, int(pitch / 2) | 1)
        ink = cv2.adaptiveThreshold(
            cv2.GaussianBlur(gray, (3, 3), 0), 255,
            cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, block, _INK_OFFSET,
        )
        self.thickness = t = _dash_stroke_px(ink)
        ink = _erase_digits(ink, t, pitch)

        close = max(3, int(_CLOSE_FRAC * pitch))
        opening = max(5, int(_OPEN_FRAC * pitch))
        h_bridged = _morph(ink, cv2.MORPH_CLOSE, (close, 1))
        v_bridged = _morph(ink, cv2.MORPH_CLOSE, (1, close))
        h_lines = _morph(h_bridged, cv2.MORPH_OPEN, (opening, 1))
        v_lines = _morph(v_bridged, cv2.MORPH_OPEN, (1, opening))

        d = max(3, round(t) | 1)
        kernel = np.ones((d, d), np.uint8)
        crossings = cv2.dilate(h_lines, kernel) & cv2.dilate(v_lines, kernel)
        # Join the specks of a frayed crossing a pixel or two apart.
        crossings = cv2.dilate(crossings, np.ones((3, 3), np.uint8))
        _, _, _, centres = cv2.connectedComponentsWithStats(crossings, connectivity=8)
        self.points = centres[1:].astype(np.float64)
        # Edge coverage reads the bridged masks: a border line the opening
        # broke (faint dashes) still counts, digits are already gone.
        c = max(d, int(_COVER_TOL * pitch) | 1)
        cover_kernel = np.ones((c, c), np.uint8)
        self.h_lines = cv2.dilate(h_lines | h_bridged, cover_kernel)
        self.v_lines = cv2.dilate(v_lines | v_bridged, cover_kernel)

    def edge_cover(self, a: NDArray, b: NDArray, horizontal: bool) -> float:
        """Fraction of the edge a->b (ends excluded) lying on a grid line."""
        mask = self.h_lines if horizontal else self.v_lines
        h, w = mask.shape
        n = max(8, int(np.hypot(*(b - a)) / 2))
        f = np.linspace(_EDGE_END, 1 - _EDGE_END, n)[:, None]
        p = np.rint(a + f * (b - a)).astype(int)
        inside = (p[:, 0] >= 0) & (p[:, 0] < w) & (p[:, 1] >= 0) & (p[:, 1] < h)
        if not inside.all():
            return 0.0
        return float(np.mean(mask[p[:, 1], p[:, 0]] > 0))

    def refine_rows_cols(self, grid: NDArray) -> NDArray:
        """Extend the node grid over missed border lines, then trim to the board.

        ``grid`` is (rows+1, cols+1, 2). Each side grows by extrapolated lines
        while the new line sits a cell out and it and the edges joining it are
        inked (``_accept``); then the longest run of lines joined by inked edges
        is kept, first along rows, then along columns. Only the joins decide
        the trim: a faint line (Q90's top rows at 2000px) can score low along
        itself while the dashes crossing it are plain.
        """
        for _ in range(2):
            grid = self._extend(grid)
            grid = self._extend(grid.transpose(1, 0, 2), swapped=True).transpose(1, 0, 2)
        grid = self._keep_board(grid)
        grid = self._keep_board(grid.transpose(1, 0, 2), swapped=True).transpose(1, 0, 2)
        return grid

    # Rows below are node rows of ``g``; with ``swapped`` they are columns of
    # the board, so "along" edges are vertical and "across" edges horizontal.

    def _line_cover(self, line: NDArray, swapped: bool) -> float:
        covers = [self.edge_cover(line[i], line[i + 1], not swapped) for i in range(len(line) - 1)]
        return float(np.mean(covers)) if covers else 0.0

    def _join_cover(self, a: NDArray, b: NDArray, swapped: bool) -> float:
        covers = [self.edge_cover(a[i], b[i], swapped) for i in range(len(a))]
        return float(np.mean(covers)) if covers else 0.0

    def _extend(self, g: NDArray, swapped: bool = False) -> NDArray:
        while len(g) >= 2:
            new = self._snap(2 * g[0] - g[1], swapped)
            if not self._accept(new, g[0], g[1], swapped):
                break
            g = np.concatenate([new[None], g])
        while len(g) >= 2:
            new = self._snap(2 * g[-1] - g[-2], swapped)
            if not self._accept(new, g[-1], g[-2], swapped):
                break
            g = np.concatenate([g, new[None]])
        return g

    def _snap(self, line: NDArray, swapped: bool) -> NDArray:
        """Move an extrapolated line's nodes onto the grid line in the mask.

        A curved page bends the lines, so a straight extrapolation drifts off
        within a couple of rows. Each node moves across the line (y for a row,
        x for a column) to where the mask is densest along a cell-long window;
        the moves are median-smoothed so a digit remnant can't kink the line.
        """
        mask = self.h_lines if not swapped else self.v_lines
        if swapped:
            mask = mask.T
        line = line[:, ::-1] if swapped else line  # (along, across)
        h, w = mask.shape
        reach = int(_SNAP_REACH * self.pitch)
        half = int(0.4 * self.pitch)
        shifts = np.zeros(len(line))
        for i, (x, y) in enumerate(line):
            x, y = round(x), round(y)
            y0, y1 = max(0, y - reach), min(h, y + reach + 1)
            x0, x1 = max(0, x - half), min(w, x + half + 1)
            if y1 - y0 < 3 or x1 - x0 < 3:
                continue
            prof = (mask[y0:y1, x0:x1] > 0).sum(axis=1)
            if prof.max() == 0:
                continue
            peak = np.flatnonzero(prof == prof.max())
            shifts[i] = y0 + float(peak.mean()) - y
        k = min(5, len(shifts))
        smooth = np.array([
            np.median(shifts[max(0, i - k // 2):i + k // 2 + 1]) for i in range(len(shifts))
        ])
        out = line.astype(float).copy()
        out[:, 1] += smooth
        return out[:, ::-1] if swapped else out

    def _accept(self, new: NDArray, inner: NDArray, inner2: NDArray, swapped: bool) -> bool:
        """Whether an extrapolated line is the board's next line.

        It must sit a cell out (a neighbouring puzzle's border 0.6 cell away is
        not), carry dashes along it and be joined to the board by dashes.
        """
        step = float(np.median(np.hypot(*(inner - inner2).T)))
        gap = float(np.median(np.hypot(*(new - inner).T)))
        if not (1 - _EXTEND_STEP_TOL) * step <= gap <= (1 + _EXTEND_STEP_TOL) * step:
            return False
        return (
            self._line_cover(new, swapped) >= _EDGE_COVER_MIN
            and self._join_cover(new, inner, swapped) >= _EDGE_COVER_MIN
        )

    def _keep_board(self, g: NDArray, swapped: bool = False) -> NDArray:
        n = len(g)
        join_ok = [self._join_cover(g[i], g[i + 1], swapped) >= _EDGE_COVER_MIN for i in range(n - 1)]
        best = (0, 0)  # (length, start)
        i = 0
        while i < n:
            j = i
            while j + 1 < n and join_ok[j]:
                j += 1
            if j - i + 1 > best[0]:
                best = (j - i + 1, i)
            i = j + 1
        length, start = best
        if length < 2:
            return g
        return g[start:start + length]


def deskew_angle(gray: NDArray) -> float:
    """Page rotation in degrees (``cv2.getRotationMatrix2D`` sense) that levels the grid.

    The ink's row and column projections are sharpest (largest sum of squares)
    when the grid lines run along the axes. Searched on a ~1000px copy, coarse
    then fine. A curved page bends lines a little either way; the best overall
    angle still levels the board.
    """
    h, w = gray.shape[:2]
    s = min(1.0, _DESKEW_SIDE / max(h, w))
    small = cv2.resize(gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else gray
    ink = cv2.adaptiveThreshold(
        cv2.GaussianBlur(small, (3, 3), 0), 255,
        cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, _INK_OFFSET,
    )
    sh, sw = ink.shape
    centre = (sw / 2, sh / 2)

    def sharpness(angle: float) -> float:
        m = cv2.getRotationMatrix2D(centre, angle, 1.0)
        r = cv2.warpAffine(ink, m, (sw, sh), flags=cv2.INTER_NEAREST).astype(np.float64)
        return float((r.sum(axis=1) ** 2).sum() + (r.sum(axis=0) ** 2).sum())

    best = max(np.arange(-_DESKEW_MAX, _DESKEW_MAX + 1e-9, 0.5), key=sharpness)
    return float(max(np.arange(best - 0.5, best + 0.5 + 1e-9, 0.1), key=sharpness))


def _morph(mask: NDArray, op: int, size: tuple[int, int]) -> NDArray:
    return cv2.morphologyEx(mask, op, cv2.getStructuringElement(cv2.MORPH_RECT, size))


def _dash_stroke_px(ink: NDArray) -> float:
    """Stroke width of the dashes (px): the commonest ink run length across both axes.

    Only tells bold clue digits from the grid line (``_erase_digits``); a
    slitherlink board has no walls, so this is not wall classification.

    Every dash crosses many scan lines at its thickness, so that run length
    outnumbers the digits' (thicker) strokes and the dashes' own lengths.
    """
    counts = np.zeros(64)
    m = (ink > 0).astype(np.int8)
    for a in (m, m.T):
        d = np.diff(np.pad(a, ((1, 1), (0, 0))), axis=0)
        starts = np.argwhere(d.T == 1)[:, 1]
        ends = np.argwhere(d.T == -1)[:, 1]
        counts += np.bincount(np.minimum(ends - starts, 63), minlength=64)
    counts[:2] = 0
    return float(max(2, np.argmax(counts)))


def _erase_digits(ink: NDArray, thickness: float, pitch: float) -> NDArray:
    """Remove bold strokes (clue digits) but keep the thin dashes they touch.

    A digit's core (its stroke's middle) is a long stroke; the bold ``+`` at a
    crossing leaves only a spot, which must stay or every line breaks there.
    """
    dist = cv2.distanceTransform(ink, cv2.DIST_L2, 3)
    core = (dist > _DIGIT_CORE * thickness).astype(np.uint8)
    _, lab, st, _ = cv2.connectedComponentsWithStats(core, connectivity=8)
    long_ = np.maximum(st[:, 2], st[:, 3]) >= _DIGIT_CORE_MIN_CELLS * pitch
    long_[0] = False
    core = long_[lab].astype(np.uint8)
    r = round(1.2 * thickness)
    disk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return ink & ~(cv2.dilate(core, disk) * 255)
