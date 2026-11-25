"""Melon Pie board, lattice and circle detection.

The board is a lattice of dashed lines with no solid border (the outer boundary is
dashed too) and circles on its points, border points included. The photos are busy:
fingers, neighbouring boards' lattices, text. Neither ``find_quadrilateral_border`` nor
``lattice_fit.figure_frame_image`` (largest ink block) finds it, so:

1. **Locate** (``board_frame_image``): close the dashes along each axis into strokes and
   keep long ones; strokes that touch form components, and the board is the largest
   component holding both directions that doesn't touch the photo's edge (a board cut off
   by the frame loses to a complete one). A frame drawn around it, half a cell out, goes
   to ``rectify_board`` as ``border_image``, as for Picturesque Maze, so the board is
   still flattened (CLAUDE.md).
2. **Lattice** (``lattice_lines``): on the warp at source resolution (``native``; the
   cell-size normalisation can lock onto the dash period of a dashed board), the same
   strokes' projections give candidate lines. The lattice is the longest run of
   consecutive candidates whose gaps strokes in the other direction span: a neighbouring
   board's last line one cell away, with no lines crossing the gap, drops out.
3. **Points** (``refine_point``): a lightly curled page tilts lines by a few pixels, so
   each point moves to where its two strokes actually cross nearby.
4. **Circles**: the shared ring probe and colour thresholds (``ring_probe``,
   ``lattice_circles.circle_color``) at every point.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.signal import find_peaks

from puzzle_parsers.grid_utils import ink_intensity, rectify_board
from puzzle_parsers.lattice_circles import DetectedCircle, circle_color
from puzzle_parsers.lattice_fit import dark_mask, strokes
from puzzle_parsers.ring_probe import RING_SUPPORT, fill_ratio, probe_ring

# Locating, as fractions of the photo's long side: the closing that bridges dash gaps
# (gaps measured ~0.5%), the shortest stroke kept (a 6-cell board's lines ~25%), and the
# margin from the photo's edge that counts as touching it.
_LOCATE_CLOSE = 0.012
_LOCATE_LONG = 0.06
_EDGE = 0.005
# Frame margin around the located lattice, as a fraction of its larger side (~half a
# cell on a 6x6 board): border circles reach 0.2 cell past their lines.
_FRAME_MARGIN = 0.08
# On the warp, as fractions of its long side: dash-gap closing and shortest stroke.
_WARP_CLOSE = 0.03
_WARP_LONG = 0.2
# A gap between two lattice lines counts as spanned when the perpendicular strokes cover
# more than this share of it (median over the better half of the lines).
_SPAN_COVER = 0.5


@dataclass
class MelonPieGeometry:
    h_lines: list[int]  # point rows on the native warp
    v_lines: list[int]  # point columns
    quad: NDArray
    native: NDArray
    circles: list[DetectedCircle] = field(default_factory=list)  # dr / dc hold the point's r / c

    @property
    def height(self) -> int:
        return len(self.h_lines) - 1

    @property
    def width(self) -> int:
        return len(self.v_lines) - 1


def _axis_strokes(dark: NDArray, close: int, length: int) -> tuple[NDArray, NDArray]:
    """Horizontal and vertical strokes: dashes closed along the axis, then long runs only."""
    out = []
    for horizontal in (True, False):
        size = (close, 1) if horizontal else (1, close)
        closed = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, size))
        out.append(strokes(closed, horizontal, length))
    return out[0], out[1]


def board_frame_image(image: NDArray) -> NDArray:
    """Grayscale image for ``rectify_board``: the located lattice's ink inside a drawn frame."""
    ink = ink_intensity(image)
    h, w = ink.shape[:2]
    long_side = max(h, w)
    dark = dark_mask(ink, 31)
    close = max(3, int(long_side * _LOCATE_CLOSE))
    hz, vt = _axis_strokes(dark, close, max(5, int(long_side * _LOCATE_LONG)))
    both = cv2.dilate(hz | vt, cv2.getStructuringElement(cv2.MORPH_RECT, (close // 2 | 1, close // 2 | 1)))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(both, 8)
    edge = int(long_side * _EDGE)
    best: tuple[tuple[bool, int], tuple[int, int, int, int]] | None = None
    for i in range(1, count):
        x, y, bw, bh, area = (int(v) for v in stats[i])
        comp = labels[y:y + bh, x:x + bw] == i
        if not (hz[y:y + bh, x:x + bw][comp].any() and vt[y:y + bh, x:x + bw][comp].any()):
            continue
        inside = x > edge and y > edge and x + bw < w - edge and y + bh < h - edge
        key = (inside, area)
        if best is None or key > best[0]:
            best = (key, (x, y, bw, bh))
    if best is None:
        return ink
    x, y, bw, bh = best[1]
    m = int(_FRAME_MARGIN * max(bw, bh))
    x0, y0 = max(1, x - m), max(1, y - m)
    x1, y1 = min(w - 2, x + bw + m), min(h - 2, y + bh + m)
    region = np.zeros_like(ink)
    cv2.rectangle(region, (x0, y0), (x1, y1), 255, -1)
    out = np.where(region > 0, ink, 255).astype(np.uint8)
    cv2.rectangle(out, (x0, y0), (x1, y1), 0, max(2, long_side // 800))
    return out


def _candidates(proj: NDArray, n: int) -> list[int]:
    peaks, _ = find_peaks(proj.astype(float), height=0.15 * float(proj.max() or 1), distance=max(3, int(0.04 * n)))
    return [int(p) for p in peaks]


def _spanned_run(lines: list[int], cross: NDArray, cross_lines: list[int], rows: bool) -> list[int]:
    """The longest run of consecutive lines whose gaps the perpendicular strokes span."""
    if len(lines) < 2:
        return lines
    spanned = []
    for a, b in zip(lines, lines[1:]):
        lo, hi = a + (b - a) // 4, b - (b - a) // 4
        cover = []
        for x in cross_lines:
            band = cross[lo:hi, max(0, x - 3):x + 4] if rows else cross[max(0, x - 3):x + 4, lo:hi]
            if band.size:
                cover.append(float(band.any(axis=1 if rows else 0).mean()))
        cover.sort()
        spanned.append(bool(cover) and float(np.mean(cover[len(cover) // 2:])) > _SPAN_COVER)
    best, run, start = (0, 0), 0, 0
    for i, ok in enumerate(spanned):
        run = run + 1 if ok else 0
        if run == 1:
            start = i
        if run > best[1] - best[0]:
            best = (start, start + run)
    return lines[best[0]:best[1] + 1]


def lattice_lines(ink: NDArray) -> tuple[list[int], list[int], NDArray, NDArray]:
    """Point rows and columns on the warp, and the stroke masks they came from."""
    h, w = ink.shape[:2]
    long_side = max(h, w)
    hz, vt = _axis_strokes(dark_mask(ink, 31), max(3, int(long_side * _WARP_CLOSE)), max(5, int(long_side * _WARP_LONG)))
    hz, vt = hz > 0, vt > 0
    rows = _candidates(hz.sum(axis=1), h)
    cols = _candidates(vt.sum(axis=0), w)
    rows = _spanned_run(rows, vt, cols, rows=True)
    cols = _spanned_run(cols, hz, rows, rows=False)
    rows = _spanned_run(rows, vt, cols, rows=True)
    return rows, cols, hz, vt


def refine_point(hz: NDArray, vt: NDArray, x: float, y: float, pitch: float) -> tuple[float, float]:
    """Where the point's two strokes cross nearby: the stroke centre in a small window."""
    reach, half = int(0.3 * pitch), int(0.25 * pitch)
    xi, yi = int(round(x)), int(round(y))
    band = hz[max(0, yi - half):yi + half + 1, max(0, xi - reach):xi + reach + 1].sum(axis=1)
    if band.sum() > 0:
        y = max(0, yi - half) + float((band * np.arange(len(band))).sum() / band.sum())
    band = vt[max(0, yi - reach):yi + reach + 1, max(0, xi - half):xi + half + 1].sum(axis=0)
    if band.sum() > 0:
        x = max(0, xi - half) + float((band * np.arange(len(band))).sum() / band.sum())
    return x, y


def detect_melon_pie(image: NDArray, debug_dir: str | None = None) -> MelonPieGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    board = rectify_board(image, border_image=board_frame_image(image))
    native = board.native
    gray = cv2.cvtColor(native, cv2.COLOR_BGR2GRAY)
    rows, cols, hz, vt = lattice_lines(ink_intensity(native))
    circles: list[DetectedCircle] = []
    if len(rows) >= 2 and len(cols) >= 2:
        pitch = float(min(np.median(np.diff(rows)), np.median(np.diff(cols))))
        for r, y in enumerate(rows):
            for c, x in enumerate(cols):
                px, py = refine_point(hz, vt, x, y, pitch)
                ring = probe_ring(gray, px, py, pitch)
                if ring.support >= RING_SUPPORT:
                    circles.append(DetectedCircle(dr=r, dc=c, color=circle_color(fill_ratio(gray, ring.cx, ring.cy, pitch))))

    if debug_path:
        vis = image.copy()
        cv2.polylines(vis, [board.quad.astype(int)], True, (0, 255, 0), 3)
        cv2.imwrite(str(debug_path / "01_board.png"), vis)
        vis = native.copy()
        for y in rows:
            cv2.line(vis, (0, y), (vis.shape[1], y), (0, 180, 0), 1)
        for x in cols:
            cv2.line(vis, (x, 0), (x, vis.shape[0]), (0, 180, 0), 1)
        palette = [(255, 0, 0), (0, 0, 255), (0, 160, 255)]
        for k in circles:
            cv2.circle(vis, (cols[k.dc], rows[k.dr]), 12, palette[k.color], 3)
        cv2.imwrite(str(debug_path / "02_lattice_circles.png"), vis)

    return MelonPieGeometry(h_lines=rows, v_lines=cols, quad=board.quad, native=native, circles=circles)
