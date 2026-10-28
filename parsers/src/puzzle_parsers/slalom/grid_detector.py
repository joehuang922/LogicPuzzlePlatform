"""Grid detection for slalom puzzles.

Pipeline:
1. Find quadrilateral border and warp to rectangle
2. Detect grid lines via morphological projection
3. Classify cells as wall (black) or empty (white) using intensity
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import (
    find_quadrilateral_border,
    warp_to_rectangle,
    detect_grid_lines,
)


@dataclass
class SlalomGeometry:
    warped: NDArray
    warped_gray: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


def detect_slalom_grid(
    image: NDArray,
    debug_dir: str | None = None,
) -> SlalomGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    border_pts = find_quadrilateral_border(gray)
    warped, warp_w, warp_h = warp_to_rectangle(image, border_pts)
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    if debug_path:
        cv2.imwrite(str(debug_path / "01_warped.png"), warped)

    h_lines, v_lines = detect_grid_lines(warped_gray, warp_w, warp_h)

    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 0, 255), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (255, 0, 0), 1)
        cv2.imwrite(str(debug_path / "02_grid_lines.png"), vis)

    rows = len(h_lines) - 1
    cols = len(v_lines) - 1

    h_lines = _uniform_lines(h_lines[0], h_lines[-1], rows + 1)
    v_lines = _uniform_lines(v_lines[0], v_lines[-1], cols + 1)

    cell_h = (h_lines[-1] - h_lines[0]) / rows if rows > 0 else 50.0
    cell_w = (v_lines[-1] - v_lines[0]) / cols if cols > 0 else 50.0

    return SlalomGeometry(
        warped=warped,
        warped_gray=warped_gray,
        rows=rows,
        cols=cols,
        h_lines=h_lines,
        v_lines=v_lines,
        cell_h=cell_h,
        cell_w=cell_w,
    )


def classify_walls(
    warped_gray: NDArray,
    geom: SlalomGeometry,
    threshold: float = 0.4,
) -> list[list[int]]:
    """Classify cells as wall (1) or empty (0) based on pixel intensity.

    A cell is a wall if the fraction of dark pixels in its central region
    exceeds the threshold.
    """
    rows, cols = geom.rows, geom.cols
    cells = [[0] * cols for _ in range(rows)]

    for r in range(rows):
        for c in range(cols):
            y1 = geom.h_lines[r]
            y2 = geom.h_lines[r + 1]
            x1 = geom.v_lines[c]
            x2 = geom.v_lines[c + 1]

            h = y2 - y1
            w = x2 - x1
            margin_y = int(h * 0.2)
            margin_x = int(w * 0.2)
            center = warped_gray[y1 + margin_y:y2 - margin_y, x1 + margin_x:x2 - margin_x]

            if center.size == 0:
                continue

            dark_ratio = np.sum(center < 128) / center.size
            if dark_ratio > threshold:
                cells[r][c] = 1

    return cells


def detect_gate_cells(
    warped_gray: NDArray,
    geom: SlalomGeometry,
    cells: list[list[int]],
    dark_threshold: int = 190,
) -> tuple[set[tuple[int, int]], set[tuple[int, int]]]:
    """Find the non-wall cells a dashed gate line runs through.

    Gates are dashed lines through cell centres. For each cell we scan a band
    over the middle half of the cell, along each axis, for a pixel column that
    reads as dashes: several separate dark runs with gaps between them. A solid
    grid line that strays into the band (imperfect grid fit) is one long run,
    so the dash test rejects it; the band's ends are trimmed so the crossing
    grid lines stay out. Tolerates about 10% of a cell of grid misalignment.

    Returns (vertical_cells, horizontal_cells) as sets of (row, col).
    """
    # Flatten lighting (photo shadows) by dividing out the local background.
    k = int(geom.cell_w) | 1
    background = cv2.morphologyEx(
        warped_gray, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
    )
    norm = cv2.divide(warped_gray, background, scale=255)

    vertical: set[tuple[int, int]] = set()
    horizontal: set[tuple[int, int]] = set()
    for r in range(geom.rows):
        for c in range(geom.cols):
            if cells[r][c] == 1:
                continue
            y1, y2 = geom.h_lines[r], geom.h_lines[r + 1]
            x1, x2 = geom.v_lines[c], geom.v_lines[c + 1]
            h, w = y2 - y1, x2 - x1
            v_band = norm[y1 + int(0.12 * h):y2 - int(0.12 * h), x1 + int(0.25 * w):x2 - int(0.25 * w)]
            h_band = norm[y1 + int(0.25 * h):y2 - int(0.25 * h), x1 + int(0.12 * w):x2 - int(0.12 * w)].T
            if _has_dashed_line(v_band, dark_threshold):
                vertical.add((r, c))
            if _has_dashed_line(h_band, dark_threshold):
                horizontal.add((r, c))
    return vertical, horizontal


def _has_dashed_line(band: NDArray, dark_threshold: int) -> bool:
    """Whether some pixel column of ``band`` (axis 0 = along the line) is dashed."""
    length, width = band.shape[:2]
    if length == 0 or width == 0:
        return False
    for x in range(width):
        # Darkest of 3 neighbouring columns, so a slightly tilted line still reads.
        column = band[:, max(0, x - 1):x + 2].min(axis=1) < dark_threshold
        runs = [n for n in _run_lengths(column) if n >= 2]
        if len(runs) < 3:
            continue
        dark_fraction = sum(runs) / length
        if 0.15 <= dark_fraction <= 0.8 and max(runs) < 0.35 * length:
            return True
    return False


def _run_lengths(mask: NDArray) -> list[int]:
    """Lengths of the consecutive True runs in a 1-D boolean array."""
    padded = np.concatenate(([False], mask, [False])).astype(np.int8)
    edges = np.flatnonzero(np.diff(padded))
    return list(edges[1::2] - edges[0::2])


def _uniform_lines(start: int, end: int, count: int) -> list[int]:
    """Generate uniformly spaced lines between start and end."""
    return [int(start + i * (end - start) / (count - 1)) for i in range(count)]
