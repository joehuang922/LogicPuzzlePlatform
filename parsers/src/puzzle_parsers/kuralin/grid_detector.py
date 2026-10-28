"""Grid + circle detection for Kuralin.

Design (see docs/kuralin/kuralin.md, "Puzzle Parser"):

The board is a dashed grid with white, black, and gray (halftone) circles. Every
circle sits on a grid line — an edge midpoint or an interior corner — so the
set of places a circle can be is a small, known lattice once the grid is found.

1. Find the outer-border quadrilateral and warp it to a rectangle (shared
   ``find_quadrilateral_border``; on a page with a small worked example above
   the puzzle it picks the main board, the largest quadrilateral).
2. Count cells from the dashed grid lines (Tentai Show's ``_count_cells``).
3. Probe every lattice point with at least one even doubled coordinate for a
   printed ring. Probing replaces Hough: HoughCircles (as used by Tentai Show)
   missed a gray circle whose halftone fill and touching dashes defeated both
   the gradient vote and the contour fallback, while a ring test at a known
   center finds it. A dashed crossing has ink on only ~4 perimeter samples, so
   it never passes the ring test.
4. Classify each circle by its inner-disk brightness relative to the paper:
   white ~1.0, gray halftone ~0.6-0.8, black <0.3.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import find_quadrilateral_border, warp_to_rectangle
from puzzle_parsers.tentaishow.grid_detector import _count_cells

# Ring test: fraction of perimeter samples that must be inked.
RING_SUPPORT = 0.75
# Circle radius search range and center search window, as fractions of pitch.
RADII = (0.14, 0.16, 0.18, 0.20, 0.22)
OFFSETS = np.linspace(-0.1, 0.1, 9)
# Inner-disk brightness / paper brightness thresholds for color.
BLACK_MAX = 0.40
WHITE_MIN = 0.90


@dataclass
class DetectedCircle:
    dr: int
    dc: int
    color: int  # 0 = white, 1 = black, 2 = gray


@dataclass
class KuralinGeometry:
    warped: NDArray
    warp_w: int
    warp_h: int
    rows: int
    cols: int
    circles: list[DetectedCircle] = field(default_factory=list)


def detect_kuralin_grid(
    image: NDArray, debug_dir: str | None = None
) -> KuralinGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    border_pts = find_quadrilateral_border(gray)

    if debug_path:
        vis = image.copy()
        cv2.polylines(vis, [border_pts.astype(int)], True, (0, 255, 0), 3)
        cv2.imwrite(str(debug_path / "01_border.png"), vis)

    warped, warp_w, warp_h = warp_to_rectangle(image, border_pts)
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    if debug_path:
        cv2.imwrite(str(debug_path / "02_warped.png"), warped)

    rows, cols = _count_cells(warped_gray, warp_w, warp_h)
    circles = _probe_circles(warped_gray, rows, cols, warp_w / cols, warp_h / rows)

    if debug_path:
        vis = warped.copy()
        pitch_x = warp_w / cols
        pitch_y = warp_h / rows
        for i in range(cols + 1):
            x = int(i * pitch_x)
            cv2.line(vis, (x, 0), (x, warp_h), (0, 180, 0), 1)
        for i in range(rows + 1):
            y = int(i * pitch_y)
            cv2.line(vis, (0, y), (warp_w, y), (0, 180, 0), 1)
        palette = [(255, 0, 0), (0, 0, 255), (0, 160, 255)]
        for c in circles:
            center = (int(c.dc * pitch_x / 2), int(c.dr * pitch_y / 2))
            cv2.circle(vis, center, int(0.3 * pitch_x), palette[c.color], 3)
        cv2.imwrite(str(debug_path / "03_grid_circles.png"), vis)

    return KuralinGeometry(
        warped=warped,
        warp_w=warp_w,
        warp_h=warp_h,
        rows=rows,
        cols=cols,
        circles=circles,
    )


def _probe_circles(
    gray: NDArray, rows: int, cols: int, pitch_x: float, pitch_y: float
) -> list[DetectedCircle]:
    """Test every valid lattice point (edge midpoint or interior corner) for a circle."""
    pitch = min(pitch_x, pitch_y)
    circles: list[DetectedCircle] = []
    for dr in range(1, 2 * rows):
        for dc in range(1, 2 * cols):
            if dr % 2 == 1 and dc % 2 == 1:
                continue
            x0 = dc * pitch_x / 2
            y0 = dr * pitch_y / 2
            dark_thr = _paper_level(gray, x0, y0, pitch) - 45.0
            best = (0.0, x0, y0)
            for oy in OFFSETS:
                for ox in OFFSETS:
                    cx, cy = x0 + ox * pitch, y0 + oy * pitch
                    support = max(_ring_support(gray, cx, cy, f * pitch, dark_thr) for f in RADII)
                    if support > best[0]:
                        best = (support, cx, cy)
            support, cx, cy = best
            if support < RING_SUPPORT:
                continue
            circles.append(DetectedCircle(dr=dr, dc=dc, color=_classify(gray, cx, cy, pitch)))
    return circles


def _paper_level(gray: NDArray, cx: float, cy: float, pitch: float) -> float:
    """Paper brightness around a point: the bright majority of a ~1-pitch box."""
    h, w = gray.shape
    half = int(pitch * 0.45)
    ci, cj = int(round(cy)), int(round(cx))
    patch = gray[max(0, ci - half):min(h, ci + half), max(0, cj - half):min(w, cj + half)]
    return float(np.percentile(patch, 85)) if patch.size else 255.0


def _ring_support(gray: NDArray, cx: float, cy: float, r: float, dark_thr: float) -> float:
    """Fraction of points on a circle of radius ``r`` at (cx, cy) darker than ``dark_thr``."""
    h, w = gray.shape
    n = max(24, int(2 * np.pi * r / 3))
    angles = 2 * np.pi * np.arange(n) / n
    xs = np.round(cx + r * np.cos(angles)).astype(int)
    ys = np.round(cy + r * np.sin(angles)).astype(int)
    inside = (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
    if not inside.any():
        return 0.0
    return float((gray[ys[inside], xs[inside]] < dark_thr).mean())


def _classify(gray: NDArray, cx: float, cy: float, pitch: float) -> int:
    """0 = white, 1 = black, 2 = gray, from the inner disk's mean brightness."""
    h, w = gray.shape
    r = max(2, int(pitch * 0.08))
    ci, cj = int(round(cy)), int(round(cx))
    disk = gray[max(0, ci - r):min(h, ci + r + 1), max(0, cj - r):min(w, cj + r + 1)]
    ratio = float(disk.mean()) / max(1.0, _paper_level(gray, cx, cy, pitch))
    if ratio < BLACK_MAX:
        return 1
    if ratio > WHITE_MIN:
        return 0
    return 2
