"""Shared grid geometry and cell extraction utilities.

Provides:
- GridGeometry: dataclass holding warped image + grid line positions
- detect_internal_grid: detect 10x10 grid lines for a single 9x9 board
- extract_cells_from_geometry: slice individual cell ROIs from a geometry
- find_best_grid_group: find evenly-spaced subset of peak positions
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.signal import find_peaks


@dataclass
class GridGeometry:
    """Grid geometry after perspective correction."""

    warped: NDArray
    grid_x0: float
    grid_y0: float
    cell_w: float
    cell_h: float
    h_lines: list[int] = field(default_factory=list)
    v_lines: list[int] = field(default_factory=list)


def detect_internal_grid(
    warped_gray: NDArray, warp_size: int
) -> tuple[list[int], list[int]]:
    """Detect the 10 horizontal and 10 vertical internal grid lines of a single 9x9 board."""
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )

    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (warp_size // 4, 1))
    h_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    row_sums = h_mask.sum(axis=1) / 255
    h_peaks, _ = find_peaks(row_sums, height=warp_size * 0.2, distance=warp_size // 15)
    h_lines = _filter_to_n_lines(h_peaks.tolist(), 10, warp_size)

    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, warp_size // 4))
    v_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)
    col_sums = v_mask.sum(axis=0) / 255
    v_peaks, _ = find_peaks(col_sums, height=warp_size * 0.2, distance=warp_size // 15)
    v_lines = _filter_to_n_lines(v_peaks.tolist(), 10, warp_size)

    return h_lines, v_lines


def extract_cells_from_geometry(
    geometry: GridGeometry,
    grid_size: int = 9,
) -> list[list[NDArray]]:
    """Extract cell images from a grid geometry (warped to a single board)."""
    warped = geometry.warped
    h, w = warped.shape[:2]

    cell_w = geometry.cell_w
    cell_h = geometry.cell_h
    x0 = geometry.grid_x0
    y0 = geometry.grid_y0

    margin_ratio = 0.15
    cells: list[list[NDArray]] = []

    for row in range(grid_size):
        row_cells = []
        for col in range(grid_size):
            x1 = int(x0 + col * cell_w)
            y1 = int(y0 + row * cell_h)
            x2 = int(x1 + cell_w)
            y2 = int(y1 + cell_h)

            margin_x = int(cell_w * margin_ratio)
            margin_y = int(cell_h * margin_ratio)

            cy1 = max(0, y1 + margin_y)
            cy2 = min(h, y2 - margin_y)
            cx1 = max(0, x1 + margin_x)
            cx2 = min(w, x2 - margin_x)

            cell = warped[cy1:cy2, cx1:cx2]
            if cell.size == 0:
                cell = np.ones((10, 10, 3), dtype=np.uint8) * 255
            row_cells.append(cell)
        cells.append(row_cells)

    return cells


def find_best_grid_group(positions: list[int], target_count: int) -> list[int] | None:
    """Find the best group of target_count evenly-spaced positions."""
    if len(positions) < target_count:
        return None

    positions_arr = np.array(positions)
    best_group: list[int] | None = None
    best_score = float("inf")

    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            spacing = (positions[j] - positions[i]) / (target_count - 1)
            if spacing < 30:
                continue
            expected = positions[i] + np.arange(target_count) * spacing
            group = []
            used = set()
            for exp in expected:
                dists = np.abs(positions_arr - exp)
                order = np.argsort(dists)
                for idx in order:
                    if idx not in used and dists[idx] < spacing * 0.3:
                        group.append(positions[idx])
                        used.add(idx)
                        break
                else:
                    break
            if len(group) == target_count:
                gaps = np.diff(group)
                score = float(np.std(gaps))
                if score < best_score:
                    best_score = score
                    best_group = group

            if best_score < 5.0:
                return best_group

    return best_group


def _filter_to_n_lines(peaks: list[int], target: int, size: int) -> list[int]:
    """From detected peaks, find the best set of ~target evenly-spaced lines."""
    if len(peaks) <= target:
        return peaks

    expected_gap = size / (target - 1)
    best_group = find_best_grid_group(peaks, target)
    if best_group is not None:
        return best_group

    expected = [int(i * expected_gap) for i in range(target)]
    selected: list[int] = []
    used: set[int] = set()
    for exp in expected:
        best_idx = -1
        best_dist = float("inf")
        for idx, p in enumerate(peaks):
            if idx not in used and abs(p - exp) < best_dist:
                best_dist = abs(p - exp)
                best_idx = idx
        if best_idx >= 0 and best_dist < expected_gap * 0.4:
            selected.append(peaks[best_idx])
            used.add(best_idx)
    return selected if len(selected) >= target - 2 else peaks[:target]
