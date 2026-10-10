"""Nurikabe grid detection.

Nurikabe boards are a plain rectangular grid of cells with no regions; some
cells hold a printed number clue. All grid lines are solid *by design*, but real
scans degrade the thin dividers into faint, broken segments — so we locate
geometry with ``auto_detect_grid_lines`` (sweeps erode sizes, tolerant of broken
lines) and guard against an under-detected axis with square-cell reconciliation.

These Nikoli scans carry a title band above the board ("1 ... Easy") and a
halftone shading strip at the page margin, which the border detector must not
grab. The shared ``find_quadrilateral_border`` handles this itself (edge-support
scoring rejects a title/gutter-contaminated quad, with a dark-pixel projection
box as fallback), so we call it directly like the other border-first parsers.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import (
    auto_detect_grid_lines,
    find_quadrilateral_border,
    reconcile_square_lines,
    warp_to_rectangle,
)


@dataclass
class NurikabeGeometry:
    warped: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


def detect_nurikabe_grid(
    image: NDArray, debug_dir: str | None = None
) -> NurikabeGeometry:
    """Detect the Nurikabe grid: find border, warp, locate grid lines."""
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
    h_lines, v_lines = auto_detect_grid_lines(warped_gray, warp_w, warp_h)

    # Reconcile the row/column count from the detected pitches: rescue an
    # under-detected axis, but keep per-axis counts on near-square warped boards.
    h_lines, v_lines = reconcile_square_lines(h_lines, v_lines, warp_h, warp_w)

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

    return NurikabeGeometry(
        warped=warped, rows=rows, cols=cols,
        h_lines=h_lines, v_lines=v_lines,
        cell_h=cell_h, cell_w=cell_w,
    )
