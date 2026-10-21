"""Picto Link grid detection — thin orchestrator over shared grid_utils.

Picto Link boards are a plain rectangular grid of square cells with no regions.
The sample images use *solid* grid rulings, so we detect the real line peaks and
then :func:`reconcile_square_lines` them under the square-cell assumption.

We deliberately do *not* use the perfectly-uniform synthesiser
(``detect_uniform_grid``) here. A photographed magazine page bows, and the 4-corner
warp only removes perspective — it cannot straighten a curved page. The synthesiser
emits lines at an exactly even phase (``round(i*span/count)``) and discards the real
peak positions, so on a bowed board its lines drift away from the actual rulings,
worst in the centre (measured ~20% of a cell on the 25×25 sample). At the parser's
0.15 cell-ROI margin that drift drags a ruling bar into the digit window — turning a
``3`` into a ``5`` or clipping a digit — and corrupts OCR. ``reconcile_square_lines``
instead *snaps* each line to the nearest real peak, so the grid follows the bow;
this cut the sample's centre drift to 0 and its parity errors by more than half.
See [[grid-parser-robustness]].

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
    detect_grid_lines,
    find_quadrilateral_border,
    ink_intensity,
    reconcile_square_lines,
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
    h_lines, v_lines = detect_grid_lines(warped_ink, warp_w, warp_h)
    h_lines, v_lines = reconcile_square_lines(h_lines, v_lines, warp_h, warp_w)

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
