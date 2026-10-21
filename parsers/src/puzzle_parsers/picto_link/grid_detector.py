"""Picto Link grid detection — thin orchestrator over shared grid_utils.

Picto Link boards are a plain rectangular grid of square cells with no regions.
The sample images use *solid* grid rulings, so we use the uniform-grid detector
(``detect_uniform_grid``): it lattice-fits the cell count from the ink projection
and synthesises a perfectly uniform grid, which the square-cell fact makes more
reliable than snapping to individually-detected (and jittery) line peaks.

The rulings are printed in a single ink colour (red in the samples, but the
pipeline must not assume any particular hue). We therefore drive every geometry
step off :func:`ink_intensity` — the per-channel minimum — instead of luminance
grayscale, which loses a faint coloured line because the un-absorbed channel
pulls the weighted mean back toward paper-white. See ``ink_intensity`` for why.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import (
    detect_uniform_grid,
    find_quadrilateral_border,
    ink_intensity,
    warp_to_rectangle,
)


@dataclass
class PictoLinkGeometry:
    warped: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


def detect_picto_link_grid(
    image: NDArray, debug_dir: str | None = None
) -> PictoLinkGeometry:
    """Detect the Picto Link grid: find border, warp, fit a uniform grid."""
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    ink = ink_intensity(image)
    border_pts = find_quadrilateral_border(ink)

    if debug_path:
        vis = image.copy()
        cv2.polylines(vis, [border_pts.astype(int)], True, (0, 255, 0), 3)
        cv2.imwrite(str(debug_path / "01_border.png"), vis)

    warped, warp_w, warp_h = warp_to_rectangle(image, border_pts)

    if debug_path:
        cv2.imwrite(str(debug_path / "02_warped.png"), warped)

    warped_ink = ink_intensity(warped)
    h_lines, v_lines = detect_uniform_grid(warped_ink, warp_w, warp_h)

    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 180, 0), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (180, 0, 0), 1)
        cv2.imwrite(str(debug_path / "03_gridlines.png"), vis)

    rows = len(h_lines) - 1
    cols = len(v_lines) - 1
    cell_h = (h_lines[-1] - h_lines[0]) / rows if rows > 0 else 1.0
    cell_w = (v_lines[-1] - v_lines[0]) / cols if cols > 0 else 1.0

    return PictoLinkGeometry(
        warped=warped, rows=rows, cols=cols,
        h_lines=h_lines, v_lines=v_lines,
        cell_h=cell_h, cell_w=cell_w,
    )
