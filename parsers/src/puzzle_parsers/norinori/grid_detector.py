"""Norinori grid detection.

Norinori boards are pre-divided into regions by thick borders; the internal
cell divider lines are thin. All lines are solid *by design*, but real scans
degrade the thin dividers into faint, broken segments — so we detect geometry
with ``auto_detect_grid_lines`` (sweeps erode sizes, tolerant of broken lines),
guard against an under-detected axis with square-cell reconciliation, then
classify each internal border by thickness (thick = region boundary), exactly
like LITS.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import (
    auto_detect_grid_lines,
    classify_border_thickness,
    find_quadrilateral_border,
    warp_to_rectangle,
)

# These Nikoli scans carry a title band above the board ("17 ... Easy"), and the
# thin interior dividers are faint/broken. The generic contour detector needs a
# closed border loop; when it can't find one it either returns a degenerate
# full-image quad or its gradient fallback grabs the title strip. So we reconcile
# it against a dark-pixel projection box (immune to the title and faint interior
# lines), trusting the contour quad only when the two agree. This mirrors the
# tentaishow border-first pipeline.


@dataclass
class NorinoriGeometry:
    warped: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


def detect_norinori_grid(
    image: NDArray, debug_dir: str | None = None
) -> NorinoriGeometry:
    """Detect the Norinori grid: find border, warp, locate grid lines."""
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    border_pts, border_src = _detect_border(gray)

    if debug_path:
        vis = image.copy()
        cv2.polylines(vis, [border_pts.astype(int)], True, (0, 255, 0), 3)
        cv2.putText(vis, border_src, (10, 30), cv2.FONT_HERSHEY_SIMPLEX,
                    1.0, (0, 255, 0), 2)
        cv2.imwrite(str(debug_path / "01_border.png"), vis)

    warped, warp_w, warp_h = warp_to_rectangle(image, border_pts)

    if debug_path:
        cv2.imwrite(str(debug_path / "02_warped.png"), warped)

    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = auto_detect_grid_lines(warped_gray, warp_w, warp_h)

    # Guard against an under-detected axis collapsing the row/column count.
    # Cells are square, so the smaller per-axis cell-size estimate is reliable.
    h_lines, v_lines = _reconcile_square_lines(h_lines, v_lines, warp_h, warp_w)

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

    return NorinoriGeometry(
        warped=warped, rows=rows, cols=cols,
        h_lines=h_lines, v_lines=v_lines,
        cell_h=cell_h, cell_w=cell_w,
    )


def _detect_border(gray: NDArray) -> tuple[NDArray, str]:
    """Find the board's outer-border quadrilateral.

    Returns (quad, source) where quad is a (4,2) float32 array (TL, TR, BR, BL)
    suitable for ``warp_to_rectangle``, and source names which detector won.

    We reconcile the generic contour detector against a dark-pixel projection
    box: the contour quad captures a skewed board precisely but needs a closed
    border loop, and on these scans its gradient fallback tends to grab the
    title strip above the board. The projection box is immune to the title and
    the faint interior dividers but assumes an axis-aligned board. We trust the
    contour quad only when it agrees with the box; otherwise we use the box.
    """
    box_quad, box = _projection_box_quad(gray)
    x0, y0, x1, y1 = box
    span = max(x1 - x0, y1 - y0)
    # Tight tolerance: the contour detector sometimes clips the border by a full
    # column when one side abuts the page's halftone shading, and that clip is
    # ~0.05*span. We only defer to the contour quad (for genuine skew) when it
    # agrees closely with the projection box on every corner.
    tol = 0.04 * span

    h, w = gray.shape
    full = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    quad = find_quadrilateral_border(gray)

    degenerate = np.allclose(quad, full, atol=2)
    if not degenerate and np.all(np.abs(quad - box_quad) <= tol):
        return quad, "contour"
    return box_quad, "projection"


def _projection_box_quad(gray: NDArray) -> tuple[NDArray, tuple[int, int, int, int]]:
    """Axis-aligned board box from dark-pixel projection.

    The board border is the only near-full-width / full-height dark line, so
    projecting the dark-pixel fraction onto each axis produces sharp spikes at
    the four border edges. We take the outermost rows/cols whose dark fraction
    clears a relative threshold, so faint interior dividers and title text are
    ignored. Returns (quad, (x0, y0, x1, y1)).
    """
    h, w = gray.shape
    dark = (gray < 128).astype(np.float32)
    row_frac = dark.sum(axis=1) / w
    col_frac = dark.sum(axis=0) / h

    def _outer(frac: NDArray, full: int) -> tuple[int, int]:
        # Relative threshold dominates; the small floor is only a noise guard.
        # A skewed board's border may never reach a high absolute dark-fraction
        # in any single column, so a floor near the per-axis max would leave the
        # threshold unmet and fall back to full width — pulling in the halftone
        # shading strip at the page margin as a phantom row/column.
        thr = max(0.18, 0.55 * float(frac.max()))
        idx = np.where(frac > thr)[0]
        if len(idx) == 0:
            return 0, full - 1
        return int(idx.min()), int(idx.max())

    y0, y1 = _outer(row_frac, h)
    x0, x1 = _outer(col_frac, w)
    quad = np.float32([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    return quad, (x0, y0, x1, y1)


def _reconcile_square_lines(
    h_lines: list[int], v_lines: list[int], warp_h: int, warp_w: int
) -> tuple[list[int], list[int]]:
    """Re-derive both axis line sets assuming square cells.

    A faint/broken axis can be under-detected, which only ever *inflates* that
    axis's estimated cell size (you cannot detect more lines than exist). The
    smaller of the two per-axis cell-size estimates is therefore the reliable
    one; we adopt it as the true cell size, derive both counts from it, and snap
    a uniform grid (preferring detected peaks where they line up).
    """
    h_cell = _cell_size_from_lines(h_lines)
    v_cell = _cell_size_from_lines(v_lines)

    candidates = [c for c in (h_cell, v_cell) if c is not None]
    if not candidates:
        return h_lines, v_lines

    cell = min(candidates)
    n_rows = max(2, round(warp_h / cell))
    n_cols = max(2, round(warp_w / cell))

    new_h = _uniform_grid_snapped(np.asarray(h_lines), warp_h, n_rows)
    new_v = _uniform_grid_snapped(np.asarray(v_lines), warp_w, n_cols)
    return new_h, new_v


def _cell_size_from_lines(lines: list[int]) -> float | None:
    """Estimate cell size (px) from the median spacing of detected lines."""
    if len(lines) < 3:
        return None
    spacings = np.diff(np.asarray(lines))
    med = float(np.median(spacings))
    good = spacings[spacings > med * 0.5]
    if len(good) == 0:
        return None
    return float(np.median(good))


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


def classify_borders(
    warped_gray: NDArray, geom: NorinoriGeometry, debug_dir: str | None = None
) -> tuple[list[list[int]], list[list[int]]]:
    """Classify each internal border as thick (1, region boundary) or thin (0)."""
    debug_path = Path(debug_dir) if debug_dir else None

    h_borders, v_borders = classify_border_thickness(
        warped_gray, geom.h_lines, geom.v_lines, geom.rows, geom.cols
    )

    if debug_path:
        vis = geom.warped.copy()
        rows, cols = geom.rows, geom.cols
        for r in range(rows - 1):
            for c in range(cols):
                if h_borders[r][c] == 1:
                    y = geom.h_lines[r + 1]
                    x1 = geom.v_lines[c]
                    x2 = geom.v_lines[c + 1]
                    cv2.line(vis, (x1, y), (x2, y), (0, 0, 255), 2)
        for r in range(rows):
            for c in range(cols - 1):
                if v_borders[r][c] == 1:
                    x = geom.v_lines[c + 1]
                    y1 = geom.h_lines[r]
                    y2 = geom.h_lines[r + 1]
                    cv2.line(vis, (x, y1), (x, y2), (255, 0, 0), 2)
        cv2.imwrite(str(debug_path / "04_thick_borders.png"), vis)

    return h_borders, v_borders
