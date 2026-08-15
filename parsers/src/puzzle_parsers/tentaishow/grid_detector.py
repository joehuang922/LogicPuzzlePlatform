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

    # Rough pitch estimate for dot-size bounds: assume a squarish board of
    # roughly 10 cells until we refine the count.
    approx_pitch = min(warp_w, warp_h) / 10.0

    dots = _detect_dots(warped_gray, approx_pitch)

    # Mask dots to background so they don't perturb line detection.
    cleaned = warped_gray.copy()
    for d in dots:
        cv2.circle(cleaned, (int(d.cx), int(d.cy)), int(approx_pitch * 0.5), 255, -1)

    if debug_path:
        cv2.imwrite(str(debug_path / "03_dots_masked.png"), cleaned)

    rows, cols = _count_cells(cleaned, warp_w, warp_h, dots)

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


def _detect_dots(warped_gray: NDArray, approx_pitch: float) -> list[DetectedDot]:
    """Detect dot centers via HoughCircles, with a contour-based fallback.

    Classifies each dot as open (0) or filled (1) by comparing the mean
    intensity of a small disk at the center against the annulus around it.
    """
    blurred = cv2.medianBlur(warped_gray, 5)
    min_r = max(4, int(approx_pitch * 0.12))
    max_r = int(approx_pitch * 0.42)
    min_dist = max(6, int(approx_pitch * 0.5))

    detected: list[DetectedDot] = []
    seen: list[tuple[float, float]] = []

    def _add(cx: float, cy: float, r: float) -> None:
        for sx, sy in seen:
            if (sx - cx) ** 2 + (sy - cy) ** 2 < (min_dist * 0.8) ** 2:
                return
        seen.append((cx, cy))
        detected.append(DetectedDot(cx=cx, cy=cy, color=_classify_dot(warped_gray, cx, cy, r)))

    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min_dist,
        param1=100,
        param2=18,
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


def _classify_dot(gray: NDArray, cx: float, cy: float, r: float) -> int:
    """0 = open (light center), 1 = filled (dark center).

    Compares a small central disk to the mid annulus; robust to anti-aliasing.
    """
    h, w = gray.shape
    ci, cj = int(round(cy)), int(round(cx))
    rr = max(2, int(r))
    y0, y1 = max(0, ci - rr), min(h, ci + rr + 1)
    x0, x1 = max(0, cj - rr), min(w, cj + rr + 1)
    patch = gray[y0:y1, x0:x1].astype(np.float32)
    if patch.size == 0:
        return 0
    ys, xs = np.mgrid[y0:y1, x0:x1]
    dist = np.sqrt((ys - ci) ** 2 + (xs - cj) ** 2)
    center_mask = dist <= r * 0.4
    if not center_mask.any():
        return 0
    center_mean = float(patch[center_mask].mean())
    return 1 if center_mean < 128 else 0


def _count_cells(
    cleaned: NDArray,
    warp_w: int,
    warp_h: int,
    dots: list[DetectedDot],
) -> tuple[int, int]:
    """Determine row/col counts.

    Primary signal is the dot lattice: every dot sits at a half-pitch multiple
    k*span/(2N), so the true N minimizes each dot's residual to that lattice.
    This is far more robust than dashed-line detection on faint/halftone
    boards. We fall back to the dashed-line count per axis when the lattice is
    not confident (too few dots, or no clear residual minimum).
    """
    mask = preprocess_dashed_lines(cleaned)
    dash_cols = _cell_count_axis(mask, "v", warp_w, warp_h)
    dash_rows = _cell_count_axis(mask, "h", warp_h, warp_w)

    xs = np.array([d.cx for d in dots], dtype=float)
    ys = np.array([d.cy for d in dots], dtype=float)
    n_cols = _lattice_count_axis(xs, warp_w) or dash_cols
    n_rows = _lattice_count_axis(ys, warp_h) or dash_rows
    return n_rows, n_cols


def _lattice_count_axis(
    coords: NDArray, span: int, n_min: int = 4, n_max: int = 40
) -> int | None:
    """Return the cell count N whose half-pitch lattice best fits the dots.

    A dot at pixel p sits at some k*span/(2N); its residual is the distance of
    2N*p/span from the nearest integer (0..0.5). The best N minimizes the mean
    residual. We only trust the result when it is a clear minimum: at least 4
    dots, error well below the ~0.25 expected for a random (wrong) N, and a
    margin over the runner-up.
    """
    if len(coords) < 4:
        return None

    scores: list[tuple[float, int]] = []
    for n in range(n_min, n_max + 1):
        half_pitch = span / (2 * n)
        res = coords / half_pitch
        err = float(np.mean(np.abs(res - np.round(res))))
        scores.append((err, n))

    scores.sort(key=lambda t: t[0])
    best_err, best_n = scores[0]
    runner_err = scores[1][0]
    # A genuine fit sits well under the ~0.25 mean residual of a wrong N and is
    # clearly separated from the next candidate.
    if best_err < 0.16 and best_err < runner_err * 0.75:
        return best_n
    return None


def _cell_count_axis(mask: NDArray, axis: str, line_len: int, span: int) -> int:
    if axis == "h":
        open_k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(1, line_len // 8), 1))
        lines_mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, open_k)
        proj = lines_mask.sum(axis=1).astype(float) / 255
    else:
        open_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(1, line_len // 8)))
        lines_mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, open_k)
        proj = lines_mask.sum(axis=0).astype(float) / 255

    peaks, _ = find_peaks(proj, height=line_len * 0.15, distance=max(1, span // 20))
    if len(peaks) < 3:
        return 10

    spacings = np.diff(peaks)
    med = float(np.median(spacings))
    good = spacings[spacings > med * 0.5]
    if len(good) == 0:
        return 10
    cell_size = float(np.median(good))
    count = round(span / cell_size)
    return max(2, count)
