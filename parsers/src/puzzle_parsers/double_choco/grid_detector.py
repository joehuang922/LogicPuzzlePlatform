"""Grid detection for double-choco puzzles with dashed internal lines.

Uses Hough line detection + FFT period analysis instead of morphological
projection, since dashed lines are destroyed by long morphological kernels.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.ndimage import gaussian_filter1d
from scipy.signal import find_peaks

from puzzle_parsers.grid_utils import find_quadrilateral_border, warp_to_rectangle


@dataclass
class DoubleChocoGeometry:
    warped: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


def detect_double_choco_grid(
    image: NDArray, debug_dir: str | None = None
) -> DoubleChocoGeometry:
    from pathlib import Path

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

    if debug_path:
        cv2.imwrite(str(debug_path / "02_warped.png"), warped)

    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = _detect_dashed_grid(warped_gray, warp_w, warp_h)

    rows = len(h_lines) - 1
    cols = len(v_lines) - 1
    cell_h = (h_lines[-1] - h_lines[0]) / rows if rows > 0 else 1.0
    cell_w = (v_lines[-1] - v_lines[0]) / cols if cols > 0 else 1.0

    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 180, 0), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (180, 0, 0), 1)
        cv2.imwrite(str(debug_path / "03_gridlines.png"), vis)

    return DoubleChocoGeometry(
        warped=warped,
        rows=rows,
        cols=cols,
        h_lines=h_lines,
        v_lines=v_lines,
        cell_h=cell_h,
        cell_w=cell_w,
    )


def _detect_dashed_grid(
    warped_gray: NDArray, warp_w: int, warp_h: int
) -> tuple[list[int], list[int]]:
    """Detect grid lines in a dashed-line puzzle using Hough + FFT."""
    edges = cv2.Canny(warped_gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180, threshold=50, minLineLength=30, maxLineGap=20
    )

    if lines is None or len(lines) == 0:
        return _fallback_uniform(warp_w, warp_h)

    # Separate into horizontal and vertical segments
    h_hist = np.zeros(warp_h, dtype=float)
    v_hist = np.zeros(warp_w, dtype=float)

    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
        if angle < 10 or angle > 170:
            y_mid = (y1 + y2) // 2
            if 0 <= y_mid < warp_h:
                h_hist[y_mid] += 1
        elif 80 < angle < 100:
            x_mid = (x1 + x2) // 2
            if 0 <= x_mid < warp_w:
                v_hist[x_mid] += 1

    h_smooth = gaussian_filter1d(h_hist, sigma=5)
    v_smooth = gaussian_filter1d(v_hist, sigma=5)

    # Find grid cell count using FFT period detection
    n_rows = _detect_cell_count(h_smooth, warp_h)
    n_cols = _detect_cell_count(v_smooth, warp_w)

    if n_rows < 2 or n_cols < 2:
        return _fallback_uniform(warp_w, warp_h)

    # Find grid extents from strong peaks (outer border)
    h_start, h_end = _find_grid_extents(h_smooth)
    v_start, v_end = _find_grid_extents(v_smooth)

    # Generate evenly-spaced grid lines, then snap each to nearest detected peak
    h_lines = _generate_and_snap(h_smooth, h_start, h_end, n_rows)
    v_lines = _generate_and_snap(v_smooth, v_start, v_end, n_cols)

    return h_lines, v_lines


def _detect_cell_count(smooth_hist: NDArray, total_span: int) -> int:
    """Find the number of cells using FFT dominant period detection."""
    signal = smooth_hist - smooth_hist.mean()
    fft = np.fft.rfft(signal)
    magnitudes = np.abs(fft)
    freqs = np.fft.rfftfreq(len(signal))

    # Expected cell size between total/15 and total/5
    min_period = total_span / 15
    max_period = total_span / 5
    min_freq = 1.0 / max_period
    max_freq = 1.0 / min_period

    mask = (freqs >= min_freq) & (freqs <= max_freq)
    if not mask.any():
        return 0

    masked_mags = magnitudes.copy()
    masked_mags[~mask] = 0
    peak_idx = int(np.argmax(masked_mags))

    if freqs[peak_idx] == 0:
        return 0

    period = 1.0 / freqs[peak_idx]
    return round(total_span / period)


def _find_grid_extents(smooth_hist: NDArray) -> tuple[int, int]:
    """Find start and end of the grid from the histogram envelope."""
    threshold = float(np.max(smooth_hist)) * 0.25
    strong = np.where(smooth_hist > threshold)[0]
    if len(strong) < 2:
        return 0, len(smooth_hist) - 1
    return int(strong[0]), int(strong[-1])


def _generate_and_snap(
    smooth_hist: NDArray, start: int, end: int, n_cells: int
) -> list[int]:
    """Generate uniform grid and snap each line to the nearest local peak."""
    cell_size = (end - start) / n_cells
    snap_radius = int(cell_size * 0.15)

    result: list[int] = []
    for i in range(n_cells + 1):
        expected = int(start + i * cell_size)
        # Search for local peak within snap radius
        lo = max(0, expected - snap_radius)
        hi = min(len(smooth_hist), expected + snap_radius + 1)
        local = smooth_hist[lo:hi]
        if len(local) > 0:
            snapped = lo + int(np.argmax(local))
        else:
            snapped = expected
        result.append(snapped)

    return result


def _fallback_uniform(warp_w: int, warp_h: int) -> tuple[list[int], list[int]]:
    """Fallback: assume 10x10 grid, evenly divide the image."""
    n = 10
    h_lines = [int(i * warp_h / n) for i in range(n + 1)]
    v_lines = [int(i * warp_w / n) for i in range(n + 1)]
    return h_lines, v_lines
