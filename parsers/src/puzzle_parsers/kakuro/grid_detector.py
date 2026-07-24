"""Kakuro grid detection — uses Hough-based grid detection for border finding.

Kakuro puzzles have systematic columns/rows of black cells that defeat the
standard contour-based border detection. Instead, we detect the regular grid
of lines via Hough transform and derive the border from the outermost lines.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import (
    _cluster_positions,
    _extend_border,
    _find_grid_chain,
    _median_single_spacing,
    detect_grid_lines,
    find_quadrilateral_border,
    warp_to_rectangle,
)


@dataclass
class KakuroGeometry:
    warped: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


def detect_kakuro_grid(
    img: NDArray, debug_dir: str | None = None
) -> KakuroGeometry:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    quad = _find_border_via_hough_grid(gray)
    if quad is None:
        quad = find_quadrilateral_border(gray)

    warped, warp_w, warp_h = warp_to_rectangle(img, quad)
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    h_lines, v_lines = detect_grid_lines(warped_gray, warp_w, warp_h)

    rows = len(h_lines) - 1
    cols = len(v_lines) - 1

    cell_h = (h_lines[-1] - h_lines[0]) / rows if rows > 0 else 0
    cell_w = (v_lines[-1] - v_lines[0]) / cols if cols > 0 else 0

    return KakuroGeometry(
        warped=warped,
        rows=rows,
        cols=cols,
        h_lines=h_lines,
        v_lines=v_lines,
        cell_h=cell_h,
        cell_w=cell_w,
    )


def _find_border_via_hough_grid(gray: NDArray) -> NDArray | None:
    """Find the border by detecting the regular grid via Hough lines.

    Sweeps Hough threshold from high to low, looking for horizontal and
    vertical lines that form a regular grid with near-square cells (within
    8% tolerance). The outermost grid lines define the border, then we
    extend outward where dark content continues.
    """
    h, w = gray.shape
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    diag = np.sqrt(h * h + w * w)

    best_result = None
    best_score = 0

    for thresh in range(int(diag * 0.4), max(50, int(diag * 0.05)), -20):
        hough = cv2.HoughLines(edges, 1, np.pi / 180, threshold=thresh)
        if hough is None:
            continue
        if hough.shape[0] > 1000 or hough.shape[0] < 10:
            continue

        h_raw: list[float] = []
        v_raw: list[float] = []
        for i in range(hough.shape[0]):
            rho, theta = float(hough[i, 0, 0]), float(hough[i, 0, 1])
            angle_deg = np.degrees(theta)
            if abs(angle_deg - 90) < 5:
                h_raw.append(
                    (rho - (w / 2) * np.cos(theta)) / np.sin(theta)
                )
            elif angle_deg < 5 or angle_deg > 175:
                if theta > np.pi / 2:
                    rho, theta = -rho, theta - np.pi
                v_raw.append(
                    (rho - (h / 2) * np.sin(theta)) / np.cos(theta)
                )

        h_cl = _cluster_positions(h_raw)
        v_cl = _cluster_positions(v_raw)
        if len(h_cl) < 5 or len(v_cl) < 5:
            continue

        cell_h = _median_single_spacing(h_cl)
        cell_w = _median_single_spacing(v_cl)
        if min(cell_h, cell_w) < 5:
            continue

        ratio = max(cell_h, cell_w) / min(cell_h, cell_w)
        if ratio > 1.08:
            h_sp = np.diff(h_cl)
            v_sp = np.diff(v_cl)
            h_s = h_sp[h_sp < np.median(h_sp) * 1.5]
            v_s = v_sp[v_sp < np.median(v_sp) * 1.5]
            h_cv = float(np.std(h_s) / np.mean(h_s)) if len(h_s) >= 3 else 999
            v_cv = float(np.std(v_s) / np.mean(v_s)) if len(v_s) >= 3 else 999
            cell_size = cell_w if v_cv < h_cv else cell_h
        else:
            cell_size = (cell_h + cell_w) / 2

        h_grid = _find_grid_chain(h_cl, cell_size)
        v_grid = _find_grid_chain(v_cl, cell_size)

        if len(h_grid) < 5 or len(v_grid) < 5:
            continue

        score = len(h_grid) + len(v_grid)
        if score > best_score:
            best_score = score
            best_result = (h_grid, v_grid, cell_size)

    if best_result is None:
        return None

    h_grid, v_grid, cell_size = best_result
    top, bot = min(h_grid), max(h_grid)
    left, right = min(v_grid), max(v_grid)

    top, bot, left, right = _extend_border(
        gray, top, bot, left, right, cell_size
    )

    return np.float32([[left, top], [right, top], [right, bot], [left, bot]])
