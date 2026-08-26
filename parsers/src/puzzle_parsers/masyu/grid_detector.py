"""Grid detection for masyu puzzles using shared grid_utils.

Pipeline:
1. Find quadrilateral border and warp to rectangle
2. Extract the full-span grid lines with a long directional opening. Masyu's
   dense circle-clues are heavy solid ink that dominate a raw ink projection and
   defeat count-by-projection; a morphological opening keeps only ink that runs
   most of the board's width/height, isolating the faint dashed grid lines from
   the clues.
3. Cluster the line positions per axis, estimate a shared (square-cell) pitch,
   and take the longest run of lines spaced ~one pitch apart. The run trims any
   neighbouring puzzle's title band that the border grabbed above the board
   (multi-puzzle magazine pages have no blank gutter between a board and the
   next puzzle's number box).
4. Emit a uniform grid over that run's extent.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import (
    _cluster_positions,
    _median_single_spacing,
    find_quadrilateral_border,
    warp_to_rectangle,
)


@dataclass
class MasyuGeometry:
    warped: NDArray
    warped_gray: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


def detect_masyu_grid(
    image: NDArray,
    debug_dir: str | None = None,
) -> MasyuGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Step 1: Find border and warp
    border_pts = find_quadrilateral_border(gray)
    warped, warp_w, warp_h = warp_to_rectangle(image, border_pts)
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    if debug_path:
        cv2.imwrite(str(debug_path / "01_warped.png"), warped)

    # Step 2-4: Detect the grid lines from the full-span dashed lines only.
    h_lines, v_lines = _detect_grid_lines(warped_gray, warp_w, warp_h)

    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 0, 255), 2)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (255, 0, 0), 2)
        cv2.imwrite(str(debug_path / "03_grid_lines.png"), vis)

    rows = len(h_lines) - 1
    cols = len(v_lines) - 1

    cell_h = (h_lines[-1] - h_lines[0]) / rows if rows > 0 else 50.0
    cell_w = (v_lines[-1] - v_lines[0]) / cols if cols > 0 else 50.0

    return MasyuGeometry(
        warped=warped,
        warped_gray=warped_gray,
        rows=rows,
        cols=cols,
        h_lines=h_lines,
        v_lines=v_lines,
        cell_h=cell_h,
        cell_w=cell_w,
    )


def _line_positions(binary: NDArray, axis: int, warp_w: int, warp_h: int) -> list[float]:
    """Return the centre positions of full-span grid lines along one axis.

    ``axis=0`` finds horizontal lines (projected onto the y-axis), ``axis=1``
    vertical lines. A morphological close bridges the dashes into continuous
    lines, then a long directional opening (kernel ~1/8 of the board span) keeps
    only ink that spans most of the board -- discarding the circle clues, which
    are at most ~0.4 cell wide.
    """
    if axis == 0:
        close_k = cv2.getStructuringElement(cv2.MORPH_RECT, (41, 1))
        open_k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(10, warp_w // 8), 1))
        proj_axis = 1
    else:
        close_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 41))
        open_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(10, warp_h // 8)))
        proj_axis = 0

    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, close_k)
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, open_k)
    proj = (opened > 0).sum(axis=proj_axis).astype(float)
    if proj.max() <= 0:
        return []

    prof = proj / proj.max()
    on = prof > 0.22
    lines: list[float] = []
    i, n = 0, len(on)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]:
                j += 1
            lines.append((i + j) / 2)
            i = j
        else:
            i += 1
    return lines


def _dominant_extent(clusters: list[float], pitch: float, tol: float = 0.2) -> tuple[float, float]:
    """Return (lo, hi) of the longest run of clusters spaced ~one pitch apart.

    A neighbouring puzzle's title band, grabbed above the board by the border
    detector, sits a larger-than-cell gap away from the board's first line, so
    it falls outside the run and is trimmed. Missing/faint interior lines are
    rare on the opened mask, so a strict single-pitch chain is enough.
    """
    pos = np.array(clusters, dtype=float)
    gaps = np.diff(pos)
    runs: list[list[int]] = [[0]]
    for k, gap in enumerate(gaps):
        if abs(gap - pitch) <= tol * pitch:
            runs[-1].append(k + 1)
        else:
            runs.append([k + 1])
    best = max(runs, key=lambda r: pos[r[-1]] - pos[r[0]])
    return float(pos[best[0]]), float(pos[best[-1]])


def _detect_grid_lines(
    warped_gray: NDArray, warp_w: int, warp_h: int
) -> tuple[list[int], list[int]]:
    """Detect uniform grid lines from the faint dashed lines of a masyu board.

    Extracts full-span lines per axis, clusters them, derives one shared pitch
    (the board is square-celled, so both axes share it), trims to the dominant
    run, and emits a uniform grid over that extent.
    """
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )

    h_raw = _line_positions(binary, 0, warp_w, warp_h)
    v_raw = _line_positions(binary, 1, warp_w, warp_h)
    if len(h_raw) < 2 or len(v_raw) < 2:
        return _fallback_grid(warp_w, warp_h)

    # Rough pitch from the larger inter-line gaps sets the clustering distance;
    # the true (square-cell) pitch is the smaller of the two axes' spacings.
    combined = np.diff(sorted(h_raw + v_raw))
    combined = combined[combined > 20]
    pitch0 = float(np.median(combined)) if len(combined) else 50.0

    h_cl = _cluster_positions(h_raw, min_gap=pitch0 * 0.4)
    v_cl = _cluster_positions(v_raw, min_gap=pitch0 * 0.4)
    if len(h_cl) < 2 or len(v_cl) < 2:
        return _fallback_grid(warp_w, warp_h)

    spacings = [s for s in (_median_single_spacing(h_cl), _median_single_spacing(v_cl)) if s > 0]
    if not spacings:
        return _fallback_grid(warp_w, warp_h)
    pitch = float(np.median(spacings))

    top, bot = _dominant_extent(h_cl, pitch)
    left, right = _dominant_extent(v_cl, pitch)

    rows = max(1, round((bot - top) / pitch))
    cols = max(1, round((right - left) / pitch))

    h_lines = [int(round(top + i * (bot - top) / rows)) for i in range(rows + 1)]
    v_lines = [int(round(left + j * (right - left) / cols)) for j in range(cols + 1)]
    return h_lines, v_lines


def _fallback_grid(warp_w: int, warp_h: int) -> tuple[list[int], list[int]]:
    """Uniform 10x10 grid spanning the warp when line detection fails."""
    n = 10
    h_lines = [int(round(i * warp_h / n)) for i in range(n + 1)]
    v_lines = [int(round(j * warp_w / n)) for j in range(n + 1)]
    return h_lines, v_lines
