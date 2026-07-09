"""Shared grid detection primitives for puzzle parsers.

Provides reusable building blocks for:
- Finding quadrilateral puzzle borders
- Perspective warping to rectify the image
- Detecting grid lines via morphological projection
- Classifying internal border thickness (thick/thin for rooms/walls)
"""
from __future__ import annotations

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.signal import find_peaks


def find_quadrilateral_border(gray: NDArray) -> NDArray:
    """Find the 4 corners of the puzzle's outer border.

    Returns a (4,2) float32 array ordered as: TL, TR, BR, BL.
    Falls back to full image bounds if no clear border is found.
    """
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
        return order_points(pts)

    rect = cv2.minAreaRect(largest)
    box = cv2.boxPoints(rect)
    return order_points(np.float32(box))


def order_points(pts: NDArray) -> NDArray:
    """Order 4 points as: top-left, top-right, bottom-right, bottom-left."""
    sorted_by_y = pts[np.argsort(pts[:, 1])]
    top = sorted_by_y[:2]
    bottom = sorted_by_y[2:]
    top = top[np.argsort(top[:, 0])]
    bottom = bottom[np.argsort(bottom[:, 0])]
    return np.float32([top[0], top[1], bottom[1], bottom[0]])


def warp_to_rectangle(
    image: NDArray, border_pts: NDArray,
) -> tuple[NDArray, int, int]:
    """Perspective-warp the image to a rectangle at source resolution.

    Preserves the native pixel density so that grid line detection works
    reliably across all board sizes (from 7×7 to 60×100+).

    Returns (warped_image, width, height).
    """
    src_w = float(np.linalg.norm(border_pts[1] - border_pts[0]))
    src_h = float(np.linalg.norm(border_pts[3] - border_pts[0]))
    aspect = src_w / src_h if src_h > 0 else 1.0

    warp_h = int(src_h)
    warp_w = int(warp_h * aspect)
    dst = np.float32([[0, 0], [warp_w, 0], [warp_w, warp_h], [0, warp_h]])
    M = cv2.getPerspectiveTransform(border_pts, dst)
    warped = cv2.warpPerspective(image, M, (warp_w, warp_h))
    return warped, warp_w, warp_h


def detect_grid_lines(
    warped_gray: NDArray, warp_w: int, warp_h: int
) -> tuple[list[int], list[int]]:
    """Detect all horizontal and vertical grid lines via morphological projection.

    Uses a two-pass approach: first detects lines with a conservative kernel to
    estimate cell size, then re-detects with adaptive parameters tuned to the
    actual cell density.
    """
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )

    h_lines = _detect_lines_1d(binary, axis="h", img_len=warp_w, img_span=warp_h)
    v_lines = _detect_lines_1d(binary, axis="v", img_len=warp_h, img_span=warp_w)

    return h_lines, v_lines


def _detect_lines_1d(
    binary: NDArray, axis: str, img_len: int, img_span: int,
) -> list[int]:
    """Detect grid lines along one axis with adaptive parameters.

    Uses progressively shorter morphological kernels until a consistent grid
    emerges. Picks the kernel that yields the most regular spacing (quasi-square
    cells). Then merges double-detections from thick lines.

    Args:
        binary: binarized image (ink=255)
        axis: "h" for horizontal lines, "v" for vertical
        img_len: length along the line direction (width for h, height for v)
        img_span: span perpendicular to lines (height for h, width for v)
    """
    kernel_fractions = [1/4, 1/6, 1/8, 1/12, 1/16, 1/20, 1/30]

    best_result: list[int] = []
    best_regularity = float("inf")

    for frac in kernel_fractions:
        min_line_len = max(20, int(img_len * frac))

        if axis == "h":
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (min_line_len, 1))
            mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            projection = mask.sum(axis=1) / 255
        else:
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_line_len))
            mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            projection = mask.sum(axis=0) / 255

        peaks, _ = find_peaks(
            projection, height=img_len * 0.03, distance=3
        )

        if len(peaks) < 3:
            continue

        # Adaptive merge: find the natural gap between double-detection
        # spacings and true cell spacings
        merge_gap = _estimate_merge_gap(peaks.tolist(), img_span)
        merged = merge_close_peaks(peaks.tolist(), min_gap=merge_gap)

        if len(merged) < 3:
            continue

        # Score regularity: coefficient of variation of spacings
        final_spacings = np.diff(merged)
        cv_score = float(np.std(final_spacings) / np.mean(final_spacings))

        # Prefer results with more lines AND good regularity.
        # Among results with similar regularity (cv < 0.15), prefer more lines.
        if cv_score < 0.15 and len(merged) > len(best_result):
            best_result = merged
            best_regularity = cv_score
        elif cv_score < best_regularity and len(merged) >= len(best_result):
            best_result = merged
            best_regularity = cv_score

    if len(best_result) < 2:
        # Absolute fallback: raw projection without morph
        if axis == "h":
            projection = binary.sum(axis=1) / 255
        else:
            projection = binary.sum(axis=0) / 255
        peaks, _ = find_peaks(projection, height=img_len * 0.2, distance=img_span // 20)
        return merge_close_peaks(peaks.tolist(), min_gap=max(3, img_span // 50))

    return best_result


def _estimate_merge_gap(peaks: list[int], img_span: int) -> int:
    """Find the merge gap that separates double-detections from true cell spacings.

    Looks for the largest jump in sorted pairwise spacings — anything below
    that jump is a double-detection, anything above is a real cell boundary.
    """
    if len(peaks) < 3:
        return max(3, img_span // 50)

    spacings = sorted(np.diff(peaks).tolist())
    if not spacings:
        return max(3, img_span // 50)

    # Find the largest relative gap in the sorted spacings
    best_gap_idx = 0
    best_gap_ratio = 0.0
    for i in range(len(spacings) - 1):
        if spacings[i] == 0:
            continue
        ratio = spacings[i + 1] / spacings[i]
        if ratio > best_gap_ratio:
            best_gap_ratio = ratio
            best_gap_idx = i

    # If there's a clear jump (>2x), merge threshold is midway between
    # the last small spacing and the first large one
    if best_gap_ratio > 2.0:
        merge_threshold = (spacings[best_gap_idx] + spacings[best_gap_idx + 1]) // 2
        return max(3, merge_threshold)

    # No clear bimodal split — use a fraction of median spacing
    median_spacing = float(np.median(spacings))
    return max(3, int(median_spacing * 0.4))


def merge_close_peaks(lines: list[int], min_gap: int = 10) -> list[int]:
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


def classify_border_thickness(
    warped_gray: NDArray,
    h_lines: list[int],
    v_lines: list[int],
    rows: int,
    cols: int,
) -> tuple[list[list[int]], list[list[int]]]:
    """Classify each internal border as thick (1) or thin (0).

    Measures ink width perpendicular to each border segment and uses a bimodal
    split to find the threshold between thin and thick.

    Returns (h_borders, v_borders):
      h_borders: (rows-1) x cols — border below cell[r][c]
      v_borders: rows x (cols-1) — border right of cell[r][c]
    """
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )

    avg_cell_h = (h_lines[-1] - h_lines[0]) / rows if rows > 0 else 50.0
    avg_cell_w = (v_lines[-1] - v_lines[0]) / cols if cols > 0 else 50.0

    # Measure horizontal border widths
    h_widths: list[tuple[int, int, float]] = []
    for r in range(1, rows):
        y = h_lines[r]
        for c in range(cols):
            x_start = v_lines[c]
            x_end = v_lines[c + 1]
            width = _measure_h_border_width(binary, y, x_start, x_end, avg_cell_h)
            h_widths.append((r - 1, c, width))

    # Measure vertical border widths
    v_widths: list[tuple[int, int, float]] = []
    for c in range(1, cols):
        x = v_lines[c]
        for r in range(rows):
            y_start = h_lines[r]
            y_end = h_lines[r + 1]
            width = _measure_v_border_width(binary, x, y_start, y_end, avg_cell_w)
            v_widths.append((r, c - 1, width))

    # Classify using bimodal threshold
    all_widths = [w for _, _, w in h_widths] + [w for _, _, w in v_widths]
    threshold = _find_thickness_threshold(all_widths)

    h_borders = [[0] * cols for _ in range(rows - 1)]
    for r, c, w in h_widths:
        h_borders[r][c] = 1 if w > threshold else 0

    v_borders = [[0] * (cols - 1) for _ in range(rows)]
    for r, c, w in v_widths:
        v_borders[r][c] = 1 if w > threshold else 0

    return h_borders, v_borders


def _measure_h_border_width(
    binary: NDArray, y: int, x_start: int, x_end: int, cell_h: float = 50.0,
) -> float:
    """Measure the width (in pixels) of a horizontal border at row y.

    Uses the longest continuous ink run (not first-to-last span) to avoid
    inflated measurements from nearby symbols bleeding into the scan window.
    """
    h = binary.shape[0]
    samples = []
    num_samples = max(3, min(7, (x_end - x_start) // 10))
    scan_range = max(5, int(cell_h * 0.3))
    for i in range(num_samples):
        x = x_start + (x_end - x_start) * (i + 1) // (num_samples + 1)
        y0 = max(0, y - scan_range)
        y1 = min(h, y + scan_range)
        col_strip = binary[y0:y1, max(0, x - 1): x + 2].max(axis=1)
        width = _longest_run(col_strip)
        if width > 0:
            samples.append(width)

    return float(np.median(samples)) if samples else 0.0


def _measure_v_border_width(
    binary: NDArray, x: int, y_start: int, y_end: int, cell_w: float = 50.0,
) -> float:
    """Measure the width (in pixels) of a vertical border at column x.

    Uses the longest continuous ink run (not first-to-last span) to avoid
    inflated measurements from nearby symbols bleeding into the scan window.
    """
    w = binary.shape[1]
    samples = []
    num_samples = max(3, min(7, (y_end - y_start) // 10))
    scan_range = max(5, int(cell_w * 0.3))
    for i in range(num_samples):
        y = y_start + (y_end - y_start) * (i + 1) // (num_samples + 1)
        x0 = max(0, x - scan_range)
        x1 = min(w, x + scan_range)
        row_strip = binary[max(0, y - 1): y + 2, x0:x1].max(axis=0)
        width = _longest_run(row_strip)
        if width > 0:
            samples.append(width)

    return float(np.median(samples)) if samples else 0.0


def _longest_run(strip: NDArray) -> int:
    """Find the longest continuous run of nonzero values in a 1D array."""
    max_run = 0
    current_run = 0
    for val in strip:
        if val:
            current_run += 1
            if current_run > max_run:
                max_run = current_run
        else:
            current_run = 0
    return max_run


def _find_thickness_threshold(widths: list[float]) -> float:
    """Find threshold to separate thick from thin borders using Otsu's method.

    Finds the threshold that minimizes within-class variance of the width
    distribution — the optimal bimodal split regardless of which class is
    larger. Works for nurimaze where thick borders are typically the majority.
    """
    if not widths:
        return 3.0

    arr = np.array(widths)
    arr = arr[arr > 0]

    if len(arr) < 2:
        return 3.0

    unique_vals = np.unique(arr)
    if len(unique_vals) < 2:
        return float(unique_vals[0]) + 1.0

    n = len(arr)
    best_thresh = float(unique_vals[len(unique_vals) // 2])
    best_var = float("inf")

    for i in range(len(unique_vals) - 1):
        t = (unique_vals[i] + unique_vals[i + 1]) / 2
        c0 = arr[arr <= t]
        c1 = arr[arr > t]
        if len(c0) == 0 or len(c1) == 0:
            continue
        w0 = len(c0) / n
        w1 = len(c1) / n
        var = w0 * c0.var() + w1 * c1.var()
        if var < best_var:
            best_var = var
            best_thresh = t

    return best_thresh
