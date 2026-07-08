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
    image: NDArray, border_pts: NDArray, target_height: int = 800
) -> tuple[NDArray, int, int]:
    """Perspective-warp the image to a rectangle preserving aspect ratio.

    Returns (warped_image, width, height).
    """
    src_w = float(np.linalg.norm(border_pts[1] - border_pts[0]))
    src_h = float(np.linalg.norm(border_pts[3] - border_pts[0]))
    aspect = src_w / src_h if src_h > 0 else 1.0

    warp_h = target_height
    warp_w = int(warp_h * aspect)
    dst = np.float32([[0, 0], [warp_w, 0], [warp_w, warp_h], [0, warp_h]])
    M = cv2.getPerspectiveTransform(border_pts, dst)
    warped = cv2.warpPerspective(image, M, (warp_w, warp_h))
    return warped, warp_w, warp_h


def detect_grid_lines(
    warped_gray: NDArray, warp_w: int, warp_h: int
) -> tuple[list[int], list[int]]:
    """Detect all horizontal and vertical grid lines via morphological projection."""
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )

    # Horizontal lines
    min_h_len = warp_w // 6
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (min_h_len, 1))
    h_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    row_sums = h_mask.sum(axis=1) / 255
    h_peaks, _ = find_peaks(row_sums, height=warp_w * 0.2, distance=warp_h // 20)

    # Vertical lines
    min_v_len = warp_h // 6
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_v_len))
    v_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)
    col_sums = v_mask.sum(axis=0) / 255
    v_peaks, _ = find_peaks(col_sums, height=warp_h * 0.2, distance=warp_w // 20)

    h_lines = merge_close_peaks(h_peaks.tolist(), min_gap=warp_h // 25)
    v_lines = merge_close_peaks(v_peaks.tolist(), min_gap=warp_w // 25)

    return h_lines, v_lines


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

    # Measure horizontal border widths
    h_widths: list[tuple[int, int, float]] = []
    for r in range(1, rows):
        y = h_lines[r]
        for c in range(cols):
            x_start = v_lines[c]
            x_end = v_lines[c + 1]
            width = _measure_h_border_width(binary, y, x_start, x_end)
            h_widths.append((r - 1, c, width))

    # Measure vertical border widths
    v_widths: list[tuple[int, int, float]] = []
    for c in range(1, cols):
        x = v_lines[c]
        for r in range(rows):
            y_start = h_lines[r]
            y_end = h_lines[r + 1]
            width = _measure_v_border_width(binary, x, y_start, y_end)
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
    binary: NDArray, y: int, x_start: int, x_end: int
) -> float:
    """Measure the width (in pixels) of a horizontal border at row y."""
    h = binary.shape[0]
    samples = []
    num_samples = 5
    for i in range(num_samples):
        x = x_start + (x_end - x_start) * (i + 1) // (num_samples + 1)
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

    Looks for the first significant gap in the sorted unique widths
    (>= 2px absolute AND >= 40% relative).
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

    for i in range(len(sorted_w) - 1):
        gap = sorted_w[i + 1] - sorted_w[i]
        if gap >= 2.0 and gap >= sorted_w[i] * 0.4:
            return (sorted_w[i] + sorted_w[i + 1]) / 2

    return (sorted_w[0] + sorted_w[-1]) / 2
