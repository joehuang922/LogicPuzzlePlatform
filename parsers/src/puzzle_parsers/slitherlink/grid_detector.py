"""Grid detection for slitherlink puzzles via dot (intersection) detection.

Pipeline:
1. Threshold to binary, find small circular blobs (the intersection dots)
2. Filter by area and circularity to keep only dots
3. Cluster dot centers into rows and columns
4. Infer grid dimensions from the (rows+1) x (cols+1) dot array
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray


@dataclass
class SlitherlinkGeometry:
    image: NDArray
    rows: int
    cols: int
    dot_grid: NDArray  # (rows+1, cols+1, 2) array of dot center coordinates
    cell_h: float
    cell_w: float


def detect_slitherlink_grid(
    image: NDArray, expected_rows: int | None = None, expected_cols: int | None = None,
    debug_dir: str | None = None,
) -> SlitherlinkGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    dots = _detect_dots(gray)

    if debug_path:
        vis = image.copy()
        for (cx, cy) in dots:
            cv2.circle(vis, (int(cx), int(cy)), 5, (0, 0, 255), 2)
        cv2.imwrite(str(debug_path / "01_dots_raw.png"), vis)

    if expected_rows is None or expected_cols is None:
        det_rows, det_cols = _auto_detect_dimensions(dots)
        if expected_rows is None:
            expected_rows = det_rows
        if expected_cols is None:
            expected_cols = det_cols

    dot_grid = _cluster_dots_to_grid(
        dots, expected_rows + 1, expected_cols + 1, gray.shape
    )

    if debug_path:
        vis = image.copy()
        for r in range(dot_grid.shape[0]):
            for c in range(dot_grid.shape[1]):
                cx, cy = dot_grid[r, c]
                cv2.circle(vis, (int(cx), int(cy)), 4, (0, 255, 0), -1)
                cv2.putText(vis, f"{r},{c}", (int(cx) + 5, int(cy) - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.3, (255, 0, 0), 1)
        cv2.imwrite(str(debug_path / "02_dot_grid.png"), vis)

    n_dot_rows = dot_grid.shape[0]
    n_dot_cols = dot_grid.shape[1]
    rows = n_dot_rows - 1
    cols = n_dot_cols - 1

    cell_h = float(np.mean(dot_grid[1:, :, 1] - dot_grid[:-1, :, 1]))
    cell_w = float(np.mean(dot_grid[:, 1:, 0] - dot_grid[:, :-1, 0]))

    return SlitherlinkGeometry(
        image=image,
        rows=rows,
        cols=cols,
        dot_grid=dot_grid,
        cell_h=cell_h,
        cell_w=cell_w,
    )


def _auto_detect_dimensions(dots: NDArray) -> tuple[int, int]:
    """Infer grid cell dimensions (rows, cols) from detected dots.

    Uses autocorrelation on X positions to find the cell spacing, then
    derives cols from the X span and rows from the filtered Y span.
    """
    if len(dots) < 4:
        return 10, 10

    xs = dots[:, 0]
    x_min, x_max = float(xs.min()), float(xs.max())
    x_span = x_max - x_min
    if x_span < 10:
        return 10, 10

    spacing = _estimate_spacing_autocorrelation(xs)
    if spacing is None:
        return 10, 10

    est_cols = max(2, round(x_span / spacing))

    filtered = _filter_dots_by_row_density(dots, est_cols + 1)
    ys_filt = filtered[:, 1]
    y_span = float(ys_filt.max() - ys_filt.min())
    est_rows = max(2, round(y_span / spacing))

    return est_rows, est_cols


def _estimate_spacing_autocorrelation(values: NDArray) -> float | None:
    """Estimate regular grid spacing via autocorrelation of a 1D histogram."""
    from numpy.fft import fft, ifft

    sorted_vals = np.sort(values)
    v_min, v_max = float(sorted_vals[0]), float(sorted_vals[-1])
    span = v_max - v_min
    if span < 10:
        return None

    bins = np.arange(v_min, v_max + 1, 1)
    density, _ = np.histogram(sorted_vals, bins=bins)
    n = len(density)
    if n < 100:
        return None

    f = fft(density - density.mean())
    acf = np.real(ifft(f * np.conj(f)))
    acf = acf[: n // 2]
    if acf[0] == 0:
        return None
    acf = acf / acf[0]

    min_lag = max(50, int(span * 0.02))
    for i in range(min_lag, len(acf) - 1):
        if acf[i] > acf[i - 1] and acf[i] > acf[i + 1] and acf[i] > 0.3:
            return float(i)

    return None


def _detect_dots(gray: NDArray) -> NDArray:
    """Detect dot blobs and return their centers as (N, 2) array of (x, y).

    Strategy: dots are highly circular and cluster tightly around one area value.
    First find all round blobs (circularity > 0.7), compute their median area,
    then keep only those within a tight band around that median.
    """
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    # First pass: collect all highly circular blobs with their areas
    round_blobs: list[tuple[float, float, float]] = []  # (cx, cy, area)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 5:
            continue
        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue
        circularity = 4 * np.pi * area / (perimeter * perimeter)
        if circularity < 0.7:
            continue
        M = cv2.moments(cnt)
        if M["m00"] == 0:
            continue
        cx = M["m10"] / M["m00"]
        cy = M["m01"] / M["m00"]
        round_blobs.append((cx, cy, area))

    if len(round_blobs) < 10:
        return np.empty((0, 2), dtype=np.float64)

    # Second pass: find the dot-sized cluster via median area of round blobs
    areas = np.array([b[2] for b in round_blobs])
    median_area = float(np.median(areas))

    # Dots cluster tightly — keep blobs within 0.5x to 2x the median
    centers = []
    for cx, cy, area in round_blobs:
        if median_area * 0.5 <= area <= median_area * 2.0:
            centers.append((cx, cy))

    return np.array(centers, dtype=np.float64) if centers else np.empty((0, 2), dtype=np.float64)


def _cluster_dots_to_grid(
    dots: NDArray, expected_rows: int, expected_cols: int,
    img_shape: tuple[int, ...],
) -> NDArray:
    """Cluster detected dots into a regular grid.

    Uses a uniform-spacing model: find the best (origin, spacing) pair that
    explains the most dots along each axis. Pre-filters dots to remove stray
    points that don't belong to a row/column of sufficient density.
    """
    if len(dots) == 0:
        h, w = img_shape[:2]
        return _synthetic_grid(w, h, expected_rows, expected_cols)

    # Pre-filter: only keep dots that are part of dense horizontal rows
    # A real puzzle row should have at least expected_cols/2 dots at similar Y
    dots = _filter_dots_by_row_density(dots, expected_cols)
    if len(dots) < expected_rows * expected_cols * 0.3:
        h, w = img_shape[:2]
        return _synthetic_grid(w, h, expected_rows, expected_cols)

    xs = dots[:, 0]
    ys = dots[:, 1]

    row_positions = _fit_uniform_grid_1d(ys, expected_rows)
    col_positions = _fit_uniform_grid_1d(xs, expected_cols)

    if row_positions is None or col_positions is None:
        h, w = img_shape[:2]
        return _synthetic_grid(w, h, expected_rows, expected_cols)

    # Build the grid by assigning dots to nearest (row, col)
    grid = np.zeros((expected_rows, expected_cols, 2), dtype=np.float64)
    assigned = np.zeros((expected_rows, expected_cols), dtype=bool)

    r_spacing = (row_positions[-1] - row_positions[0]) / max(1, expected_rows - 1)
    c_spacing = (col_positions[-1] - col_positions[0]) / max(1, expected_cols - 1)

    for (cx, cy) in dots:
        r_idx = int(np.argmin(np.abs(row_positions - cy)))
        c_idx = int(np.argmin(np.abs(col_positions - cx)))

        r_dist = abs(cy - row_positions[r_idx])
        c_dist = abs(cx - col_positions[c_idx])

        if r_dist < r_spacing * 0.3 and c_dist < c_spacing * 0.3:
            if not assigned[r_idx, c_idx]:
                grid[r_idx, c_idx] = [cx, cy]
                assigned[r_idx, c_idx] = True

    _fill_missing(grid, assigned, row_positions, col_positions)
    return grid


def _filter_dots_by_row_density(
    dots: NDArray, expected_cols: int
) -> NDArray:
    """Remove dots that aren't part of a dense horizontal row.

    Groups dots by Y proximity, keeps only those in groups with at least
    expected_cols/2 members. This filters out stray dots from title areas
    or digit internals.
    """
    if len(dots) == 0:
        return dots

    ys = dots[:, 1]
    sorted_indices = np.argsort(ys)
    sorted_dots = dots[sorted_indices]

    # Estimate row spacing from the span and expected count
    y_span = float(ys.max() - ys.min())
    est_spacing = y_span / max(1, expected_cols)  # rough estimate
    merge_threshold = est_spacing * 0.3

    # Group dots into rows by Y proximity
    groups: list[list[int]] = []
    current_group: list[int] = [0]
    for i in range(1, len(sorted_dots)):
        if sorted_dots[i, 1] - sorted_dots[current_group[-1], 1] < merge_threshold:
            current_group.append(i)
        else:
            groups.append(current_group)
            current_group = [i]
    groups.append(current_group)

    # Keep only dots from groups with sufficient density
    min_count = max(3, expected_cols // 2)
    keep_indices = []
    for group in groups:
        if len(group) >= min_count:
            keep_indices.extend(group)

    if not keep_indices:
        return dots  # fallback: keep all

    return sorted_dots[keep_indices]


def _fit_uniform_grid_1d(values: NDArray, expected_count: int) -> NDArray | None:
    """Fit a uniform grid (origin + spacing) to 1D dot positions.

    Uses a two-phase approach:
    1. Estimate spacing from the most common pairwise difference
    2. Score candidate grids by how many dots have MULTIPLE matches on the
       perpendicular axis (true dots appear in rows/cols of ~expected_count,
       stray dots from headers/digits don't)

    Since we only have 1D values here, we use a simpler scoring: for each
    candidate grid line, count how many actual dots fall near it. We then
    prefer grids where ALL lines have at least one dot (complete coverage).
    """
    if len(values) < expected_count:
        return None

    sorted_vals = np.sort(values)
    v_min = float(sorted_vals[0])
    v_max = float(sorted_vals[-1])
    span = v_max - v_min
    if span < 10:
        return None

    # The true spacing should be close to span / (expected_count - 1)
    expected_spacing = span / (expected_count - 1)
    tolerance = expected_spacing * 0.2

    # Generate candidate spacings from pairwise differences
    diffs = []
    for i in range(len(sorted_vals)):
        for j in range(i + 1, min(i + expected_count, len(sorted_vals))):
            d = sorted_vals[j] - sorted_vals[i]
            for k in range(1, expected_count):
                candidate = d / k
                if abs(candidate - expected_spacing) < expected_spacing * 0.15:
                    diffs.append(candidate)

    if not diffs:
        return np.linspace(v_min, v_max, expected_count)

    # Find mode spacing via histogram
    diffs_arr = np.array(diffs)
    n_bins = max(20, len(diffs) // 5)
    hist, bin_edges = np.histogram(diffs_arr, bins=n_bins)
    best_bin = np.argmax(hist)
    mask = (diffs_arr >= bin_edges[best_bin]) & (diffs_arr < bin_edges[best_bin + 1])
    best_spacing = float(np.median(diffs_arr[mask]))

    # Score candidate origins: prefer grids where every line has a dot nearby
    # Weight by total inlier count with a heavy penalty for missing lines
    best_score = -1.0
    best_origin = v_min
    for val in sorted_vals:
        for grid_idx in range(expected_count):
            origin = val - grid_idx * best_spacing
            # Skip if grid extends far outside the data range
            grid_end = origin + (expected_count - 1) * best_spacing
            if origin < v_min - tolerance * 2 or grid_end > v_max + tolerance * 2:
                continue

            inliers = 0
            min_dots_per_line = float("inf")
            for k in range(expected_count):
                target = origin + k * best_spacing
                dots_on_line = int(np.sum(np.abs(sorted_vals - target) < tolerance))
                if dots_on_line > 0:
                    inliers += 1
                min_dots_per_line = min(min_dots_per_line, dots_on_line)

            # Score: number of covered lines + bonus for no empty lines
            score = inliers + (0.5 if min_dots_per_line > 0 else 0)
            if score > best_score:
                best_score = score
                best_origin = origin

    # Build the grid positions, snapping to actual dots
    positions = np.zeros(expected_count)
    for k in range(expected_count):
        target = best_origin + k * best_spacing
        dists = np.abs(sorted_vals - target)
        min_idx = np.argmin(dists)
        if dists[min_idx] < tolerance:
            positions[k] = sorted_vals[min_idx]
        else:
            positions[k] = target

    return positions


def _fill_missing(
    grid: NDArray, assigned: NDArray,
    row_positions: NDArray, col_positions: NDArray,
) -> None:
    """Fill unassigned grid positions using the expected row/col positions."""
    rows, cols = assigned.shape
    for r in range(rows):
        for c in range(cols):
            if not assigned[r, c]:
                grid[r, c] = [col_positions[c], row_positions[r]]


def _synthetic_grid(
    width: int, height: int, n_rows: int, n_cols: int
) -> NDArray:
    """Generate a uniform synthetic grid as fallback."""
    margin_x = width * 0.05
    margin_y = height * 0.05
    xs = np.linspace(margin_x, width - margin_x, n_cols)
    ys = np.linspace(margin_y, height - margin_y, n_rows)
    grid = np.zeros((n_rows, n_cols, 2), dtype=np.float64)
    for r in range(n_rows):
        for c in range(n_cols):
            grid[r, c] = [xs[c], ys[r]]
    return grid
