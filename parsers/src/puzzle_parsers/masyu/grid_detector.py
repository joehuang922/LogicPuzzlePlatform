"""Grid detection for masyu puzzles via line detection.

Pipeline:
1. Detect grid lines using Hough transform or contour analysis
2. Cluster lines into rows and columns
3. Compute cell centers from grid intersections
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray


@dataclass
class MasyuGeometry:
    image: NDArray
    rows: int
    cols: int
    cell_centers: NDArray  # (rows, cols, 2) array of cell center coordinates
    cell_h: float
    cell_w: float


def detect_masyu_grid(
    image: NDArray,
    expected_rows: int | None = None,
    expected_cols: int | None = None,
    debug_dir: str | None = None,
) -> MasyuGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape[:2]

    h_lines, v_lines = _detect_grid_lines(gray)

    if debug_path:
        vis = image.copy()
        for y in h_lines:
            cv2.line(vis, (0, int(y)), (w_img, int(y)), (0, 0, 255), 1)
        for x in v_lines:
            cv2.line(vis, (int(x), 0), (int(x), h_img), (255, 0, 0), 1)
        cv2.imwrite(str(debug_path / "01_grid_lines.png"), vis)

    if expected_rows is None:
        expected_rows = max(2, len(h_lines) - 1) if len(h_lines) > 2 else 10
    if expected_cols is None:
        expected_cols = max(2, len(v_lines) - 1) if len(v_lines) > 2 else 10

    # Ensure we have expected_rows + 1 horizontal lines and expected_cols + 1 vertical
    h_positions = _fit_lines(h_lines, expected_rows + 1, h_img)
    v_positions = _fit_lines(v_lines, expected_cols + 1, w_img)

    cell_h = float(np.mean(np.diff(h_positions)))
    cell_w = float(np.mean(np.diff(v_positions)))

    # Compute cell centers
    cell_centers = np.zeros((expected_rows, expected_cols, 2), dtype=np.float64)
    for r in range(expected_rows):
        for c in range(expected_cols):
            cx = (v_positions[c] + v_positions[c + 1]) / 2
            cy = (h_positions[r] + h_positions[r + 1]) / 2
            cell_centers[r, c] = [cx, cy]

    if debug_path:
        vis = image.copy()
        for r in range(expected_rows):
            for c in range(expected_cols):
                cx, cy = cell_centers[r, c]
                cv2.circle(vis, (int(cx), int(cy)), 3, (0, 255, 0), -1)
        cv2.imwrite(str(debug_path / "02_cell_centers.png"), vis)

    return MasyuGeometry(
        image=image,
        rows=expected_rows,
        cols=expected_cols,
        cell_centers=cell_centers,
        cell_h=cell_h,
        cell_w=cell_w,
    )


def _detect_grid_lines(gray: NDArray) -> tuple[NDArray, NDArray]:
    """Detect horizontal and vertical grid lines via projection profiles."""
    h_img, w_img = gray.shape[:2]

    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Horizontal projection (sum along rows)
    h_proj = np.sum(binary, axis=1).astype(np.float64)
    h_proj = h_proj / h_proj.max() if h_proj.max() > 0 else h_proj

    # Vertical projection (sum along columns)
    v_proj = np.sum(binary, axis=0).astype(np.float64)
    v_proj = v_proj / v_proj.max() if v_proj.max() > 0 else v_proj

    h_lines = _find_peaks(h_proj, min_distance=h_img // 30)
    v_lines = _find_peaks(v_proj, min_distance=w_img // 30)

    return np.array(h_lines, dtype=np.float64), np.array(v_lines, dtype=np.float64)


def _find_peaks(profile: NDArray, min_distance: int = 10, threshold: float = 0.3) -> list[float]:
    """Find peaks in a 1D profile above a threshold with minimum spacing."""
    peaks = []
    for i in range(1, len(profile) - 1):
        if profile[i] > threshold and profile[i] >= profile[i - 1] and profile[i] >= profile[i + 1]:
            if not peaks or (i - peaks[-1]) >= min_distance:
                peaks.append(float(i))
    return peaks


def _fit_lines(detected: NDArray, expected_count: int, dimension: int) -> NDArray:
    """Fit detected lines to expected count, filling in missing ones."""
    if len(detected) >= expected_count:
        # Use the best-fitting subset
        detected = np.sort(detected)
        if len(detected) == expected_count:
            return detected
        # Pick the most evenly-spaced subset
        span = detected[-1] - detected[0]
        ideal_spacing = span / (expected_count - 1)
        best_set = detected[:expected_count]
        best_score = float("inf")
        for start_idx in range(len(detected) - expected_count + 1):
            subset = detected[start_idx : start_idx + expected_count]
            diffs = np.diff(subset)
            score = float(np.std(diffs))
            if score < best_score:
                best_score = score
                best_set = subset
        return best_set

    if len(detected) >= 2:
        # Extrapolate from detected lines
        detected = np.sort(detected)
        spacing = float(np.median(np.diff(detected)))
        first = float(detected[0])
        return np.array([first + i * spacing for i in range(expected_count)])

    # Fallback: uniform grid
    margin = dimension * 0.05
    return np.linspace(margin, dimension - margin, expected_count)
