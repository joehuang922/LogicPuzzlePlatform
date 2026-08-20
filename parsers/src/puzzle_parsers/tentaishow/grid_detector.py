"""Grid + dot detection for Tentai Show (Spiral Galaxies).

Design (see docs/tentaishow/tentaishow.md, "Puzzle Parser"):

The question image contains no walls/numbers — only dots. So the parser needs
(1) the cell counts and (2) precise sub-cell dot positions. Because a dot can
sit at a cell center, edge midpoint, or grid corner, grid geometry must be very
accurate: the corner/edge decision boundary is only +/- 1/4 pitch.

Two phases:

Phase 1 — rectify (find the board, warp to an axis-aligned rectangle):
1. Find the outer-border quadrilateral and perspective-warp it to a rectangle.
   The shared ``find_quadrilateral_border`` captures slight skew on a clean scan
   and, on a dashed/broken border where no closed contour forms, rejects a
   title-strip-contaminated quad via edge-support scoring and falls back to a
   dark-pixel projection box. Either way the output is a rectified board.

Phase 2 — parse the board:
2. Detect dots (HoughCircles + contour fallback) and classify open/filled.
3. Mask the dots out of the image before line detection.
4. Determine row/col counts. Dots always sit on a half-pitch lattice, so a
   dot-lattice cross-check (which N minimizes each dot's residual to the
   nearest k*span/(2N)) recovers the count robustly even when the dashed grid
   lines are faint or the halftone shading confuses line detection. The dashed
   line count is used only as a fallback when too few dots are present.
5. Synthesize a uniform grid from the border span + counts, and snap each dot
   to the nearest doubled coordinate.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.signal import find_peaks

from puzzle_parsers.grid_utils import (
    find_quadrilateral_border,
    preprocess_dashed_lines,
    warp_to_rectangle,
)


@dataclass
class DetectedDot:
    cx: float
    cy: float
    color: int  # 0 = open/white, 1 = filled/black


@dataclass
class TentaishowGeometry:
    warped: NDArray
    warp_w: int
    warp_h: int
    rows: int
    cols: int
    dots: list[DetectedDot] = field(default_factory=list)


def detect_tentaishow_grid(
    image: NDArray, debug_dir: str | None = None
) -> TentaishowGeometry:
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

    # Count cells FIRST, from the dashed grid alone. The dot lattice can only
    # confirm a count once the dots are known, but the dots can only be sized
    # reliably once the pitch is known — so we break the cycle by reading the
    # cell count straight off the rectified grid lines. This also fixes large
    # boards: a fixed "~10 cells" pitch guess mis-sized dot radii on a 25x25.
    rows, cols = _count_cells(warped_gray, warp_w, warp_h)
    pitch = min(warp_w / cols, warp_h / rows)

    if debug_path:
        mask = preprocess_dashed_lines(warped_gray)
        cv2.imwrite(str(debug_path / "03_dashed_mask.png"), mask)

    dots = _detect_dots(warped_gray, pitch)

    if debug_path:
        vis = warped.copy()
        for d in dots:
            col = (0, 0, 255) if d.color == 1 else (255, 0, 0)
            cv2.circle(vis, (int(d.cx), int(d.cy)), 6, col, 2)
        pitch_x = warp_w / cols
        pitch_y = warp_h / rows
        for i in range(cols + 1):
            x = int(i * pitch_x)
            cv2.line(vis, (x, 0), (x, warp_h), (0, 180, 0), 1)
        for i in range(rows + 1):
            y = int(i * pitch_y)
            cv2.line(vis, (0, y), (warp_w, y), (0, 180, 0), 1)
        cv2.imwrite(str(debug_path / "04_grid_dots.png"), vis)

    return TentaishowGeometry(
        warped=warped,
        warp_w=warp_w,
        warp_h=warp_h,
        rows=rows,
        cols=cols,
        dots=dots,
    )


def _detect_dots(warped_gray: NDArray, pitch: float) -> list[DetectedDot]:
    """Detect dot centers via HoughCircles, with a contour-based fallback.

    HoughCircles is deliberately permissive, so on a dashed/halftone board it
    hallucinates large circles floating over empty cells. Every candidate is
    therefore gated by :func:`_verify_dot`, which keeps it only if dark ink
    actually runs along the detected perimeter (a filled disk's body or an open
    dot's printed ring). This is the same edge-support idea the shared border
    detector uses, and it is what removes the false-positive "open dots" that
    previously littered empty cells.
    """
    blurred = cv2.medianBlur(warped_gray, 5)
    min_r = max(4, int(pitch * 0.14))
    max_r = int(pitch * 0.45)
    min_dist = max(6, int(pitch * 0.5))

    detected: list[DetectedDot] = []
    seen: list[tuple[float, float]] = []

    def _add(cx: float, cy: float, r: float) -> None:
        for sx, sy in seen:
            if (sx - cx) ** 2 + (sy - cy) ** 2 < (min_dist * 0.8) ** 2:
                return
        color = _verify_dot(warped_gray, cx, cy, r)
        if color is None:
            return
        seen.append((cx, cy))
        detected.append(DetectedDot(cx=cx, cy=cy, color=color))

    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min_dist,
        param1=100,
        param2=20,
        minRadius=min_r,
        maxRadius=max_r,
    )
    if circles is not None:
        for cx, cy, r in circles[0]:
            _add(float(cx), float(cy), float(r))

    # Contour fallback: filled dots (solid disks) are sometimes missed by Hough.
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 4,
    )
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    min_area = np.pi * (min_r ** 2) * 0.5
    max_area = np.pi * (max_r ** 2) * 1.8
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue
        perim = cv2.arcLength(cnt, True)
        if perim <= 0:
            continue
        circularity = 4 * np.pi * area / (perim * perim)
        if circularity < 0.6:
            continue
        (cx, cy), r = cv2.minEnclosingCircle(cnt)
        _add(float(cx), float(cy), float(r))

    return detected


def _verify_dot(
    gray: NDArray, cx: float, cy: float, r: float
) -> int | None:
    """Confirm a Hough/contour candidate is a real dot and classify it.

    Returns ``1`` (filled), ``0`` (open), or ``None`` if the candidate is not a
    dot at all. A real dot is distinguished from a phantom circle over an empty
    cell by *perimeter ink support*: sampling ``gray`` around the candidate
    circle, most samples must be clearly darker than the local background (a
    filled disk is dark all the way out; an open dot has a dark printed ring at
    exactly this radius). An empty cell — or a circle that happens to straddle
    faint dashed lines — has too few dark perimeter samples and is rejected.

    Filled vs open is then decided by whether the small central disk is itself
    inked (filled) or bright (open ring around white paper).
    """
    h, w = gray.shape
    ci, cj = int(round(cy)), int(round(cx))
    rr = int(r * 1.5) + 2
    y0, y1 = max(0, ci - rr), min(h, ci + rr + 1)
    x0, x1 = max(0, cj - rr), min(w, cj + rr + 1)
    patch = gray[y0:y1, x0:x1]
    if patch.size == 0:
        return None

    # Local background from the bright majority of the surrounding box; a dot
    # only covers a fraction of it, so the 85th percentile is paper-white.
    bg = float(np.percentile(patch, 85))
    dark_thr = bg - 45.0

    # Perimeter support: fraction of points on the candidate circle over ink.
    n_samples = max(16, int(2 * np.pi * r / 3))
    hits = 0
    total = 0
    for k in range(n_samples):
        a = 2 * np.pi * k / n_samples
        x = int(round(cx + r * np.cos(a)))
        y = int(round(cy + r * np.sin(a)))
        if 0 <= x < w and 0 <= y < h:
            total += 1
            if gray[y, x] < dark_thr:
                hits += 1
    if total == 0 or hits / total < 0.6:
        return None

    ys, xs = np.mgrid[y0:y1, x0:x1]
    dist = np.sqrt((ys - ci) ** 2 + (xs - cj) ** 2)
    center_mask = dist <= r * 0.4
    if not center_mask.any():
        return None
    center_dark = float((patch[center_mask] < dark_thr).mean())
    return 1 if center_dark > 0.55 else 0


def _count_cells(
    warped_gray: NDArray,
    warp_w: int,
    warp_h: int,
) -> tuple[int, int]:
    """Determine row/col counts straight from the dashed grid lines.

    This runs *before* dot detection, so it cannot lean on the dot lattice — but
    the dashed grid alone is a strong signal once the board is rectified. We
    detect the grid-line pitch on each axis and, because Tentai Show cells are
    square, pool both axes into one pitch estimate. The counts then follow as
    ``round(span / pitch)``. Pooling is what rescues a board whose dashes are
    faint on one axis: the stronger axis fixes the shared pitch.

    The per-axis pitch is the median grid-line spacing found by
    :func:`_axis_line_pitch`; if neither axis yields one (extremely degraded
    scan) we fall back to a 10x10 guess, matching the historical default.
    """
    mask = preprocess_dashed_lines(warped_gray)
    pitch_x = _axis_line_pitch(mask, "v", warp_h, warp_w)
    pitch_y = _axis_line_pitch(mask, "h", warp_w, warp_h)

    pitches = [p for p in (pitch_x, pitch_y) if p is not None]
    if not pitches:
        return 10, 10

    pooled = float(np.median(pitches))
    cols = max(2, round(warp_w / pooled))
    rows = max(2, round(warp_h / pooled))
    return rows, cols


def _axis_line_pitch(
    mask: NDArray, axis: str, line_len: int, span: int
) -> float | None:
    """Median spacing between grid lines along one axis, in pixels.

    ``axis="v"`` finds vertical lines (spacing gives the column pitch); ``"h"``
    finds horizontal lines. Lines are isolated by morphological opening with a
    long directional kernel, then located as projection peaks. The peak
    ``distance`` is deliberately a small fraction of the span (``span/40``): the
    previous ``span/20`` exceeded the true pitch on a 25x25 board and merged
    adjacent lines, collapsing the count to ~10.
    """
    if axis == "h":
        open_k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(1, line_len // 8), 1))
        lines_mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, open_k)
        proj = lines_mask.sum(axis=1).astype(float) / 255
    else:
        open_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(1, line_len // 8)))
        lines_mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, open_k)
        proj = lines_mask.sum(axis=0).astype(float) / 255

    peaks, _ = find_peaks(proj, height=line_len * 0.15, distance=max(1, span // 40))
    if len(peaks) < 3:
        return None

    spacings = np.diff(peaks)
    med = float(np.median(spacings))
    good = spacings[spacings > med * 0.5]
    if len(good) == 0:
        return None
    return float(np.median(good))
