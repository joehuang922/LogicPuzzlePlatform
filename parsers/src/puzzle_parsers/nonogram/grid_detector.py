"""Grid detection for nonogram puzzles.

Pipeline:
1. Find the outer bounding rectangle of the entire puzzle.
2. Within it, detect thick internal lines (horizontal and vertical) that
   separate the clue regions from the playable grid.
3. The playable grid is the bottom-right rectangle after the separating lines.
4. Row clues are to the left; column clues are above.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray


@dataclass
class NonogramGeometry:
    image: NDArray
    rows: int
    cols: int
    grid_rect: tuple[int, int, int, int]  # x, y, w, h of the playable grid
    row_clue_rect: tuple[int, int, int, int]  # x, y, w, h of row clue region
    col_clue_rect: tuple[int, int, int, int]  # x, y, w, h of col clue region
    cell_w: float
    cell_h: float


def detect_nonogram_grid(
    image: NDArray,
    expected_rows: int | None = None,
    expected_cols: int | None = None,
    debug_dir: str | None = None,
) -> NonogramGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape

    # Threshold to binary (ink is dark on light background)
    _, thresh = cv2.threshold(gray, 128, 255, cv2.THRESH_BINARY_INV)

    # Find the outer bounding rectangle of the puzzle
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    outer_x, outer_y, outer_w, outer_h = cv2.boundingRect(contours[0])

    # Crop to the outer rectangle for further analysis
    roi = thresh[outer_y : outer_y + outer_h, outer_x : outer_x + outer_w]

    # Detect thick horizontal lines using morphology
    # A thick horizontal line has significant horizontal extent
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (outer_w // 4, 1))
    h_lines = cv2.morphologyEx(roi, cv2.MORPH_OPEN, h_kernel)

    # Detect thick vertical lines
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, outer_h // 4))
    v_lines = cv2.morphologyEx(roi, cv2.MORPH_OPEN, v_kernel)

    # Find horizontal line y-positions (project to y axis)
    h_proj = np.sum(h_lines, axis=1)
    h_threshold = outer_w * 0.3 * 255
    h_positions = _find_line_positions(h_proj, h_threshold)

    # Find vertical line x-positions (project to x axis)
    v_proj = np.sum(v_lines, axis=0)
    v_threshold = outer_h * 0.3 * 255
    v_positions = _find_line_positions(v_proj, v_threshold)

    if debug_path:
        vis = image.copy()
        for yy in h_positions:
            cv2.line(vis, (outer_x, outer_y + yy), (outer_x + outer_w, outer_y + yy), (255, 0, 0), 2)
        for xx in v_positions:
            cv2.line(vis, (outer_x + xx, outer_y), (outer_x + xx, outer_y + outer_h), (0, 255, 0), 2)
        cv2.imwrite(str(debug_path / "00_lines.png"), vis)

    # The playable grid corner is defined by:
    # - The leftmost thick vertical line that's NOT the outer border (separates row clues from grid)
    # - The topmost thick horizontal line that's NOT the outer border (separates col clues from grid)
    # Filter out lines that are very close to the outer edges (those are borders)
    margin = min(outer_w, outer_h) * 0.05

    interior_v = [x for x in v_positions if margin < x < outer_w - margin]
    interior_h = [y for y in h_positions if margin < y < outer_h - margin]

    if not interior_v or not interior_h:
        # Fallback: estimate from expected dimensions
        if expected_rows and expected_cols:
            # Assume clue area is proportional
            grid_x_start = int(outer_w * 0.3)
            grid_y_start = int(outer_h * 0.2)
        else:
            raise ValueError("Could not detect grid separation lines and no expected dimensions provided")
    else:
        # The first interior vertical line from left = start of playable grid
        grid_x_start = interior_v[0]
        # The first interior horizontal line from top = start of playable grid
        grid_y_start = interior_h[0]

    # Playable grid rectangle (in image coordinates)
    grid_x = outer_x + grid_x_start
    grid_y = outer_y + grid_y_start
    grid_w = outer_w - grid_x_start
    grid_h = outer_h - grid_y_start

    # Determine rows/cols from grid lines within the playable area
    if expected_rows and expected_cols:
        rows, cols = expected_rows, expected_cols
    else:
        # Count internal lines within the playable grid to infer dimensions
        playable_roi = thresh[grid_y : grid_y + grid_h, grid_x : grid_x + grid_w]

        ph_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (grid_w // 3, 1))
        ph_lines = cv2.morphologyEx(playable_roi, cv2.MORPH_OPEN, ph_kernel)
        ph_proj = np.sum(ph_lines, axis=1)
        ph_positions = _find_line_positions(ph_proj, grid_w * 0.2 * 255)
        rows = max(1, len(ph_positions) - 1)

        pv_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, grid_h // 3))
        pv_lines = cv2.morphologyEx(playable_roi, cv2.MORPH_OPEN, pv_kernel)
        pv_proj = np.sum(pv_lines, axis=0)
        pv_positions = _find_line_positions(pv_proj, grid_h * 0.2 * 255)
        cols = max(1, len(pv_positions) - 1)

    cell_w = grid_w / cols
    cell_h = grid_h / rows

    # Row clue region: left of the playable grid, same vertical span
    row_clue_rect = (outer_x, grid_y, grid_x_start, grid_h)

    # Col clue region: above the playable grid, same horizontal span
    col_clue_rect = (grid_x, outer_y, grid_w, grid_y_start)

    grid_rect = (grid_x, grid_y, grid_w, grid_h)

    if debug_path:
        vis2 = image.copy()
        cv2.rectangle(vis2, (grid_x, grid_y), (grid_x + grid_w, grid_y + grid_h), (0, 255, 0), 2)
        rx, ry, rw, rh = row_clue_rect
        cv2.rectangle(vis2, (rx, ry), (rx + rw, ry + rh), (255, 0, 0), 2)
        cx, cy, cw, ch = col_clue_rect
        cv2.rectangle(vis2, (cx, cy), (cx + cw, cy + ch), (0, 0, 255), 2)
        cv2.imwrite(str(debug_path / "01_grid.png"), vis2)

    return NonogramGeometry(
        image=image,
        rows=rows,
        cols=cols,
        grid_rect=grid_rect,
        row_clue_rect=row_clue_rect,
        col_clue_rect=col_clue_rect,
        cell_w=cell_w,
        cell_h=cell_h,
    )


def _find_line_positions(projection: NDArray, threshold: float) -> list[int]:
    """Find positions where a projection exceeds threshold, merging close peaks."""
    above = projection > threshold
    positions: list[int] = []
    in_peak = False
    peak_start = 0

    for i, val in enumerate(above):
        if val and not in_peak:
            in_peak = True
            peak_start = i
        elif not val and in_peak:
            in_peak = False
            positions.append((peak_start + i) // 2)

    if in_peak:
        positions.append((peak_start + len(projection) - 1) // 2)

    return positions
