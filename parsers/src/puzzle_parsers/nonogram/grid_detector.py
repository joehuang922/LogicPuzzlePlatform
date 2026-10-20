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

from puzzle_parsers.grid_utils import detect_grid_lines, reconcile_square_lines


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

    @property
    def quad(self) -> NDArray:
        """Corners of the whole puzzle (clue areas + playable grid)."""
        x0 = self.row_clue_rect[0]
        y0 = self.col_clue_rect[1]
        gx, gy, gw, gh = self.grid_rect
        x1, y1 = gx + gw, gy + gh
        return np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dtype=np.float32)


def detect_nonogram_grid(
    image: NDArray,
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
        raise ValueError("Could not detect grid separation lines")

    # The first interior vertical line from left = start of playable grid
    grid_x_start = interior_v[0]
    # The first interior horizontal line from top = start of playable grid
    grid_y_start = interior_h[0]

    # Playable grid rectangle (in image coordinates)
    grid_x = outer_x + grid_x_start
    grid_y = outer_y + grid_y_start
    grid_w = outer_w - grid_x_start
    grid_h = outer_h - grid_y_start

    # Determine rows/cols from grid lines within the playable area.
    # Nonogram cells are square, so detect lines on both axes then reconcile:
    # a soft-focus/faint scan can under-detect one axis (e.g. only the bold
    # every-5 separators survive on the horizontal axis -> 5 rows), which
    # inflates that axis's pitch. reconcile_square_lines spots the divergent
    # pitch and re-derives both counts from the reliable (smaller) one. See
    # [[grid-parser-robustness]].
    playable_gray = gray[grid_y : grid_y + grid_h, grid_x : grid_x + grid_w]
    rows, cols = _count_cells_square(playable_gray, grid_w, grid_h)

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


def _count_cells_square(
    playable_gray: NDArray, grid_w: int, grid_h: int,
) -> tuple[int, int]:
    """Count (rows, cols) of the playable grid, assuming square cells.

    Detects grid lines on both axes with the shared, kernel-sweeping
    :func:`detect_grid_lines`, then repairs under-detection via
    :func:`reconcile_square_lines`. On a soft-focus scan the thin interior
    lines can blur below the detection threshold on one axis, leaving only the
    bold every-5 separators — which collapses that axis's count (a 25-row board
    reads as 5). Because missing lines only ever *inflate* an axis's pitch, the
    reconcile step adopts the reliable (smaller) pitch for both axes and
    re-derives both counts. When the two pitches already agree it is a no-op, so
    sharp scans are unaffected. See [[grid-parser-robustness]].
    """
    h_lines, v_lines = detect_grid_lines(playable_gray, grid_w, grid_h)
    h_lines, v_lines = reconcile_square_lines(h_lines, v_lines, grid_h, grid_w)

    rows = len(h_lines) - 1
    cols = len(v_lines) - 1
    if rows < 2 or cols < 2:
        # Degenerate detection: fall back to a square estimate from the aspect
        # ratio and the median cell pitch, rather than returning nonsense.
        return max(2, rows), max(2, cols)
    return rows, cols


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
