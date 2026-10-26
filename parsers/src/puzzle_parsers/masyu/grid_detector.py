"""Grid detection for masyu puzzles using shared grid_utils.

Pipeline:
1. Find quadrilateral border and warp to rectangle.
2. Normalise the warped board to a canonical cell size. The downstream line
   detection has pixel-absolute parameters (morphology kernels, gap filters)
   that were tuned at one resolution; feeding boards at other densities -- a
   phone photo the Android client downscaled to 2000px, or a magazine's
   tightly-packed giant board printed at ~25px/cell -- drops it out of that band
   and collapses rows. We estimate the cell pitch (robust even when line
   detection is noisy: a median of inter-line gaps survives garbage that would
   wreck a line *count*) and rescale so the pitch lands at a fixed target, so
   10x10, 17x17 and 45x31 boards all enter detection at the same cell scale.
3. Extract the full-span grid lines with a long directional opening. Masyu's
   dense circle-clues are heavy solid ink that dominate a raw ink projection and
   defeat count-by-projection; a morphological opening keeps only ink that runs
   most of the board's width/height, isolating the faint dashed grid lines from
   the clues.
4. Cluster the line positions per axis, estimate a shared (square-cell) pitch,
   and take the longest run of lines spaced ~one pitch apart. The run trims any
   neighbouring puzzle's title band that the border grabbed above the board
   (multi-puzzle magazine pages have no blank gutter between a board and the
   next puzzle's number box).
5. Emit a uniform grid over that run's extent.
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


# Cell size the line detection is tuned for; a warped board is rescaled so its
# estimated pitch lands here. Chosen at the low end of the proven-good band
# (~145-250px/cell across the sample boards) so full-res scans mostly downscale
# and downscaled phone photos only upscale ~1.4-2x, never wildly.
_TARGET_CELL_PITCH = 180.0
# Below this measured pitch the dashes blur into sub-cell noise and the estimate
# is no longer trustworthy; leave such boards at native scale rather than
# amplifying a bad number. (Genuine scans resolve well above this.)
_MIN_RELIABLE_PITCH = 20.0
# Cap the upscale so a mis-estimated tiny pitch can't blow the board up to a
# memory-eating size; 4x covers the real low-res cases (e.g. a 2000px phone
# photo of a 17x17).
_MAX_UPSCALE = 4.0


def _estimate_cell_pitch(warped_gray: NDArray, warp_w: int, warp_h: int) -> float:
    """Estimate the grid's cell pitch (px) robustly, before line detection.

    Line *counting* is fragile on off-scale boards, but the *pitch* is not: it is
    the median gap between detected lines, and a median shrugs off the spurious
    and merged lines that wreck a count. We gather inter-line gaps on both axes,
    then iteratively refine the median within a [0.62, 1.4]x window so that
    double-gaps (a missed line) and sub-cell noise don't drag it. Returns 0 when
    too few lines are found to say anything.
    """
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )
    gaps: list[float] = []
    for axis, span in ((0, warp_h), (1, warp_w)):
        raw = _line_positions(binary, axis, warp_w, warp_h)
        if len(raw) < 2:
            continue
        clustered = _cluster_positions(raw, min_gap=max(4.0, span * 0.012))
        gaps.extend(np.diff(clustered).tolist())

    g = np.array([x for x in gaps if x > 2.0], dtype=float)
    if len(g) < 2:
        return 0.0

    pitch = float(np.median(g))
    for _ in range(6):  # refine: reject harmonics and sub-cell noise, re-median
        window = g[(g > pitch * 0.62) & (g < pitch * 1.4)]
        if len(window) < 2:
            break
        updated = float(np.median(window))
        if abs(updated - pitch) <= 0.5:
            pitch = updated
            break
        pitch = updated
    return pitch


def _normalize_cell_scale(
    warped: NDArray, warp_w: int, warp_h: int
) -> tuple[NDArray, int, int]:
    """Rescale the warped board so its cell pitch matches ``_TARGET_CELL_PITCH``.

    Returns the (possibly unchanged) image and its new dimensions. A no-op when
    the pitch can't be estimated, is already in-band, or is too coarse to trust.
    """
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    pitch = _estimate_cell_pitch(warped_gray, warp_w, warp_h)
    if pitch < _MIN_RELIABLE_PITCH:
        return warped, warp_w, warp_h

    scale = _TARGET_CELL_PITCH / pitch
    if 0.9 <= scale <= 1.1:  # already the right density; don't resample for nothing
        return warped, warp_w, warp_h
    scale = min(scale, _MAX_UPSCALE)

    new_w = max(1, int(round(warp_w * scale)))
    new_h = max(1, int(round(warp_h * scale)))
    interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
    resized = cv2.resize(warped, (new_w, new_h), interpolation=interp)
    return resized, new_w, new_h


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

    # Step 2: Normalise to a canonical cell size so the pixel-absolute line
    # detection below always runs at the density it was tuned for.
    warped, warp_w, warp_h = _normalize_cell_scale(warped, warp_w, warp_h)
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    if debug_path:
        cv2.imwrite(str(debug_path / "01_warped.png"), warped)

    # Step 3-5: Detect the grid lines from the full-span dashed lines only.
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


def _dominant_extent(
    clusters: list[float], pitch: float, tol: float = 0.2, max_bridge: int = 3
) -> tuple[float, float]:
    """Return (lo, hi) of the longest run of clusters on the one-pitch grid.

    A neighbouring puzzle's title band, grabbed above the board by the border
    detector, sits an off-grid gap away from the board's first line, so it falls
    outside the run and is trimmed. But on a dense board the opened mask does
    occasionally drop an interior line, leaving a gap of ~2x (or 3x) the pitch;
    that is still *on* the grid and must not split the run, or the larger
    fragment wins and the rest of the board is thrown away. So a gap continues
    the run when it is within ``tol`` of any integer multiple of the pitch (up
    to ``max_bridge`` -- bridging the missing lines).

    After the run is chosen, an *outermost* cluster sitting a sub-pitch gap
    beyond it is re-attached: on a perspective warp the board's far edge row is
    foreshortened to less than a cell, so its border line lands <1 pitch from
    the first interior line. That is the real edge, not a title band (those are
    always a *larger*-than-cell gap away), and dropping it costs a whole row.
    """
    pos = np.array(clusters, dtype=float)
    gaps = np.diff(pos)
    runs: list[list[int]] = [[0]]
    for k, gap in enumerate(gaps):
        mult = round(gap / pitch)
        on_grid = 1 <= mult <= max_bridge and abs(gap - mult * pitch) <= tol * pitch
        if on_grid:
            runs[-1].append(k + 1)
        else:
            runs.append([k + 1])
    best = max(runs, key=lambda r: pos[r[-1]] - pos[r[0]])
    lo, hi = best[0], best[-1]
    while lo > 0 and (pos[lo] - pos[lo - 1]) < pitch * (1 - tol):
        lo -= 1
    while hi < len(pos) - 1 and (pos[hi + 1] - pos[hi]) < pitch * (1 - tol):
        hi += 1
    return float(pos[lo]), float(pos[hi])


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
