"""Grid detection for double-choco puzzles with dashed internal lines.

Uses preprocess_dashed_lines() from grid_utils to bridge dashes, then
finds peaks and snaps a uniform grid to them.
"""
from __future__ import annotations

from dataclasses import dataclass
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
    """Detect grid lines from dashed-line image using shared preprocessing."""
    mask = preprocess_dashed_lines(warped_gray)

    h_peaks = _find_line_peaks(mask, "h", warp_w, warp_h)
    v_peaks = _find_line_peaks(mask, "v", warp_h, warp_w)

    n_rows = _cell_count_from_peaks(h_peaks, warp_h)
    n_cols = _cell_count_from_peaks(v_peaks, warp_w)

    h_lines = _uniform_grid_snapped(h_peaks, warp_h, n_rows)
    v_lines = _uniform_grid_snapped(v_peaks, warp_w, n_cols)

    return h_lines, v_lines


def _find_line_peaks(
    mask: NDArray, axis: str, line_len: int, span: int
) -> NDArray:
    """Find grid line positions along one axis via morphological opening + projection."""
    if axis == "h":
        open_k = cv2.getStructuringElement(cv2.MORPH_RECT, (line_len // 8, 1))
        lines_mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, open_k)
        proj = lines_mask.sum(axis=1).astype(float) / 255
    else:
        open_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, line_len // 8))
        lines_mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, open_k)
        proj = lines_mask.sum(axis=0).astype(float) / 255

    peaks, _ = find_peaks(proj, height=line_len * 0.15, distance=span // 20)
    return peaks


def _cell_count_from_peaks(peaks: NDArray, total_span: int) -> int:
    """Determine cell count from the median spacing of detected peaks."""
    if len(peaks) < 3:
        return 10

    spacings = np.diff(peaks)
    med = float(np.median(spacings))
    good = spacings[spacings > med * 0.5]
    if len(good) == 0:
        return 10

    cell_size = float(np.median(good))
    count = round(total_span / cell_size)
    return max(2, count)


def _uniform_grid_snapped(
    peaks: NDArray, total_span: int, n_cells: int
) -> list[int]:
    """Generate a uniform grid and snap each position to the nearest peak."""
    cell_size = total_span / n_cells
    tolerance = int(cell_size * 0.25)

    result: list[int] = []
    for i in range(n_cells + 1):
        expected = int(i * cell_size)
        if len(peaks) > 0:
            dists = np.abs(peaks - expected)
            min_dist = int(np.min(dists))
            if min_dist < tolerance:
                result.append(int(peaks[np.argmin(dists)]))
            else:
                result.append(expected)
        else:
            result.append(expected)

    return result
