from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.signal import find_peaks


@dataclass
class NurimazeGeometry:
    warped: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


def detect_nurimaze_grid(
    image: NDArray, debug_dir: str | None = None
) -> NurimazeGeometry:
    """Detect the nurimaze grid: find border, warp, locate grid lines."""
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    border_pts = _find_border(gray)

    if debug_path:
        vis = image.copy()
        cv2.polylines(vis, [border_pts.astype(int)], True, (0, 255, 0), 3)
        cv2.imwrite(str(debug_path / "01_border.png"), vis)

    # Warp to rectangle preserving aspect ratio
    src_w = float(np.linalg.norm(border_pts[1] - border_pts[0]))
    src_h = float(np.linalg.norm(border_pts[3] - border_pts[0]))
    aspect = src_w / src_h if src_h > 0 else 1.0

    warp_h = 800
    warp_w = int(warp_h * aspect)
    dst = np.float32([[0, 0], [warp_w, 0], [warp_w, warp_h], [0, warp_h]])
    M = cv2.getPerspectiveTransform(border_pts, dst)
    warped = cv2.warpPerspective(image, M, (warp_w, warp_h))

    if debug_path:
        cv2.imwrite(str(debug_path / "02_warped.png"), warped)

    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = _detect_grid_lines(warped_gray, warp_w, warp_h)

    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 180, 0), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (180, 0, 0), 1)
        cv2.imwrite(str(debug_path / "03_gridlines.png"), vis)

    rows = len(h_lines) - 1
    cols = len(v_lines) - 1
    cell_h = (h_lines[-1] - h_lines[0]) / rows if rows > 0 else 1.0
    cell_w = (v_lines[-1] - v_lines[0]) / cols if cols > 0 else 1.0

    return NurimazeGeometry(
        warped=warped, rows=rows, cols=cols,
        h_lines=h_lines, v_lines=v_lines,
        cell_h=cell_h, cell_w=cell_w,
    )


def classify_borders(
    warped_gray: NDArray, geom: NurimazeGeometry, debug_dir: str | None = None
) -> tuple[list[list[int]], list[list[int]]]:
    """Classify each internal border as thick (1) or thin (0).

    Strategy: measure the ink width at each border segment by scanning
    perpendicular to the line direction. Thick borders are significantly
    wider than thin ones. We use k-means (k=2) on all widths to find the
    threshold.

    Returns (h_borders, v_borders):
      h_borders: (rows-1) x cols array — h_borders[r][c] = border below cell[r][c]
      v_borders: rows x (cols-1) array — v_borders[r][c] = border right of cell[r][c]
    """
    debug_path = Path(debug_dir) if debug_dir else None
    rows, cols = geom.rows, geom.cols

    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )

    # Measure horizontal border widths (borders between rows)
    h_widths: list[tuple[int, int, float]] = []
    for r in range(1, rows):
        y = geom.h_lines[r]
        for c in range(cols):
            x_start = geom.v_lines[c]
            x_end = geom.v_lines[c + 1]
            width = _measure_h_border_width(binary, y, x_start, x_end)
            h_widths.append((r - 1, c, width))

    # Measure vertical border widths (borders between columns)
    v_widths: list[tuple[int, int, float]] = []
    for c in range(1, cols):
        x = geom.v_lines[c]
        for r in range(rows):
            y_start = geom.h_lines[r]
            y_end = geom.h_lines[r + 1]
            width = _measure_v_border_width(binary, x, y_start, y_end)
            v_widths.append((r, c - 1, width))

    # Classify using threshold between two clusters
    all_widths = [w for _, _, w in h_widths] + [w for _, _, w in v_widths]
    threshold = _find_thickness_threshold(all_widths)

    h_borders = [[0] * cols for _ in range(rows - 1)]
    for r, c, w in h_widths:
        h_borders[r][c] = 1 if w > threshold else 0

    v_borders = [[0] * (cols - 1) for _ in range(rows)]
    for r, c, w in v_widths:
        v_borders[r][c] = 1 if w > threshold else 0

    if debug_path:
        vis = geom.warped.copy()
        for r in range(rows - 1):
            for c in range(cols):
                if h_borders[r][c] == 1:
                    y = geom.h_lines[r + 1]
                    x1 = geom.v_lines[c]
                    x2 = geom.v_lines[c + 1]
                    cv2.line(vis, (x1, y), (x2, y), (0, 0, 255), 2)
        for r in range(rows):
            for c in range(cols - 1):
                if v_borders[r][c] == 1:
                    x = geom.v_lines[c + 1]
                    y1 = geom.h_lines[r]
                    y2 = geom.h_lines[r + 1]
                    cv2.line(vis, (x, y1), (x, y2), (255, 0, 0), 2)
        cv2.imwrite(str(debug_path / "04_thick_borders.png"), vis)

    return h_borders, v_borders


def classify_symbols(
    warped_gray: NDArray, geom: NurimazeGeometry, debug_dir: str | None = None
) -> list[list[int]]:
    """Classify symbols in each cell: 0=empty, 1=circle, 2=triangle, 3=S, 4=G.

    Strategy:
    - Extract each cell's interior (with margin to avoid grid lines)
    - Threshold and find contours
    - Classify by shape features:
      - Circle: high circularity (4*pi*area / perimeter^2 > 0.7), hollow
      - Triangle: 3 vertices (approxPolyDP), hollow
      - S/G: text-like features — filled, bounding box aspect ratio ~1:1
    """
    debug_path = Path(debug_dir) if debug_dir else None
    rows, cols = geom.rows, geom.cols
    cells = [[0] * cols for _ in range(rows)]

    margin_ratio = 0.2

    if debug_path:
        vis = geom.warped.copy()

    for r in range(rows):
        for c in range(cols):
            y1 = geom.h_lines[r]
            y2 = geom.h_lines[r + 1]
            x1 = geom.v_lines[c]
            x2 = geom.v_lines[c + 1]

            cell_h = y2 - y1
            cell_w = x2 - x1
            my = int(cell_h * margin_ratio)
            mx = int(cell_w * margin_ratio)

            roi = warped_gray[y1 + my: y2 - my, x1 + mx: x2 - mx]
            if roi.size == 0:
                continue

            symbol = _classify_cell_symbol(roi)
            cells[r][c] = symbol

            if debug_path and symbol > 0:
                label = {1: "O", 2: "T", 3: "S", 4: "G"}[symbol]
                cx = (x1 + x2) // 2
                cy = (y1 + y2) // 2
                cv2.putText(vis, label, (cx - 8, cy + 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

    if debug_path:
        cv2.imwrite(str(debug_path / "05_symbols.png"), vis)

    return cells


def _classify_cell_symbol(roi: NDArray) -> int:
    """Classify a single cell ROI into 0/1/2/3/4.

    Strategy:
    - High ink ratio (>0.25): filled text → S or G
    - Medium ink ratio (0.05-0.25): hollow outline → circle or triangle
    - For circles: use HoughCircles detection
    - For triangles: use convex hull vertex analysis on the ink region
    - For S vs G: G has a horizontal bar creating more ink in the mid-right area
    """
    _, binary = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    ink_ratio = np.count_nonzero(binary) / binary.size
    if ink_ratio < 0.04:
        return 0

    # High ink ratio → text character (S or G)
    if ink_ratio > 0.25:
        return _classify_text_symbol(binary)

    # Medium ink ratio → hollow symbol (circle or triangle)
    if ink_ratio > 0.05:
        return _classify_hollow_symbol(roi, binary)

    return 0


def _classify_text_symbol(binary: NDArray) -> int:
    """Distinguish S from G in a filled text region.

    Key difference: G has a horizontal bar on the right side at ~60% height,
    while S has no ink in that region (the curve goes left at the bottom).
    """
    h, w = binary.shape

    # Check ink at ~60% height in the rightmost quarter.
    # G's bar creates significant ink here; S has almost none.
    bar_region_start = int(h * 0.55)
    bar_region_end = int(h * 0.7)
    right_bar = binary[bar_region_start:bar_region_end, w * 3 // 4:]
    bar_ink = np.count_nonzero(right_bar) / (right_bar.size + 1)

    if bar_ink > 0.25:
        return 4  # G (has the bar)

    return 3  # S (no bar)


def _classify_hollow_symbol(roi: NDArray, binary: NDArray) -> int:
    """Distinguish circle from triangle in a hollow outline."""
    h, w = roi.shape

    # Find all ink pixels and compute the convex hull
    points = np.column_stack(np.nonzero(binary))
    if len(points) < 10:
        return 0

    hull = cv2.convexHull(points)
    hull_area = cv2.contourArea(hull)
    hull_perimeter = cv2.arcLength(hull, True)

    if hull_perimeter == 0:
        return 0

    # Hull circularity: circles have high circularity (>0.8), triangles low (<0.7)
    hull_circularity = 4 * np.pi * hull_area / (hull_perimeter * hull_perimeter)

    if hull_circularity > 0.78:
        return 1  # circle

    # Check for triangle via polygon approximation
    approx = cv2.approxPolyDP(hull, 0.05 * hull_perimeter, True)
    if len(approx) == 3:
        return 2  # triangle

    approx_loose = cv2.approxPolyDP(hull, 0.08 * hull_perimeter, True)
    if len(approx_loose) == 3:
        return 2  # triangle

    # Low circularity + 4-5 vertices → likely triangle with one rounded corner
    if hull_circularity < 0.75 and len(approx) <= 5:
        return 2  # triangle

    # Fallback: try HoughCircles for edge cases
    blurred = cv2.GaussianBlur(roi, (5, 5), 0)
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min(h, w) // 2,
        param1=60,
        param2=20,
        minRadius=min(h, w) // 8,
        maxRadius=min(h, w) // 2,
    )
    if circles is not None and len(circles[0]) > 0:
        return 1  # circle

    return 0


def _measure_h_border_width(
    binary: NDArray, y: int, x_start: int, x_end: int
) -> float:
    """Measure the width (in pixels) of a horizontal border at row y."""
    # Sample at multiple x positions along the segment
    h = binary.shape[0]
    samples = []
    num_samples = 5
    for i in range(num_samples):
        x = x_start + (x_end - x_start) * (i + 1) // (num_samples + 1)
        # Scan vertically to find ink extent
        scan_range = 15
        y0 = max(0, y - scan_range)
        y1 = min(h, y + scan_range)
        col_strip = binary[y0:y1, max(0, x - 1): x + 2].max(axis=1)
        nz = np.nonzero(col_strip)[0]
        if len(nz) > 0:
            width = nz[-1] - nz[0] + 1
            samples.append(width)

    return float(np.median(samples)) if samples else 0.0


def _measure_v_border_width(
    binary: NDArray, x: int, y_start: int, y_end: int
) -> float:
    """Measure the width (in pixels) of a vertical border at column x."""
    w = binary.shape[1]
    samples = []
    num_samples = 5
    for i in range(num_samples):
        y = y_start + (y_end - y_start) * (i + 1) // (num_samples + 1)
        scan_range = 15
        x0 = max(0, x - scan_range)
        x1 = min(w, x + scan_range)
        row_strip = binary[max(0, y - 1): y + 2, x0:x1].max(axis=0)
        nz = np.nonzero(row_strip)[0]
        if len(nz) > 0:
            width = nz[-1] - nz[0] + 1
            samples.append(width)

    return float(np.median(samples)) if samples else 0.0


def _find_thickness_threshold(widths: list[float]) -> float:
    """Find threshold to separate thick from thin borders.

    The width distribution is typically bimodal (thin ~2-4px, thick ~7-9px)
    with possible outliers at intersections (15+px). We want the split between
    the first two clusters.

    Strategy: find the first gap that represents a significant jump — both
    in absolute terms (>= 2px) and relative terms (>= 40% of the lower value).
    """
    if not widths:
        return 3.0

    arr = np.array(widths)
    arr = arr[arr > 0]

    if len(arr) < 2:
        return 3.0

    sorted_w = np.sort(np.unique(arr))
    if len(sorted_w) < 2:
        return float(sorted_w[0]) + 1.0

    # Find the first significant gap (both absolute >= 2 and relative >= 40%)
    for i in range(len(sorted_w) - 1):
        gap = sorted_w[i + 1] - sorted_w[i]
        if gap >= 2.0 and gap >= sorted_w[i] * 0.4:
            return (sorted_w[i] + sorted_w[i + 1]) / 2

    # Fallback: use the midpoint of the full range
    return (sorted_w[0] + sorted_w[-1]) / 2


def _find_border(gray: NDArray) -> NDArray:
    """Find the 4 corners of the nurimaze puzzle border."""
    h, w = gray.shape

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    binary = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 11, 3,
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    binary = cv2.dilate(binary, kernel, iterations=1)

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return np.float32([[0, 0], [w, 0], [w, h], [0, h]])

    largest = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest)
    img_area = h * w

    if area < img_area * 0.1:
        return np.float32([[0, 0], [w, 0], [w, h], [0, h]])

    peri = cv2.arcLength(largest, True)
    approx = cv2.approxPolyDP(largest, 0.02 * peri, True)

    if len(approx) == 4:
        pts = approx.reshape(4, 2).astype(np.float32)
        return _order_points(pts)

    rect = cv2.minAreaRect(largest)
    box = cv2.boxPoints(rect)
    return _order_points(np.float32(box))


def _detect_grid_lines(
    warped_gray: NDArray, warp_w: int, warp_h: int
) -> tuple[list[int], list[int]]:
    """Detect all horizontal and vertical grid lines (both thick and thin)."""
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )

    # Horizontal lines
    min_h_len = warp_w // 4
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (min_h_len, 1))
    h_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    row_sums = h_mask.sum(axis=1) / 255
    h_peaks, _ = find_peaks(row_sums, height=warp_w * 0.2, distance=warp_h // 20)

    # Vertical lines
    min_v_len = warp_h // 4
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_v_len))
    v_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)
    col_sums = v_mask.sum(axis=0) / 255
    v_peaks, _ = find_peaks(col_sums, height=warp_h * 0.2, distance=warp_w // 20)

    h_lines = _merge_close_peaks(h_peaks.tolist(), min_gap=warp_h // 25)
    v_lines = _merge_close_peaks(v_peaks.tolist(), min_gap=warp_w // 25)

    return h_lines, v_lines


def _merge_close_peaks(lines: list[int], min_gap: int = 10) -> list[int]:
    """Merge peaks that are closer than min_gap (thick border double-detections)."""
    if not lines:
        return lines
    merged: list[int] = []
    group: list[int] = [lines[0]]
    for i in range(1, len(lines)):
        if lines[i] - group[-1] < min_gap:
            group.append(lines[i])
        else:
            merged.append(int(np.mean(group)))
            group = [lines[i]]
    merged.append(int(np.mean(group)))
    return merged


def _order_points(pts: NDArray) -> NDArray:
    """Order 4 points as: top-left, top-right, bottom-right, bottom-left."""
    sorted_by_y = pts[np.argsort(pts[:, 1])]
    top = sorted_by_y[:2]
    bottom = sorted_by_y[2:]
    top = top[np.argsort(top[:, 0])]
    bottom = bottom[np.argsort(bottom[:, 0])]
    return np.float32([top[0], top[1], bottom[1], bottom[0]])
