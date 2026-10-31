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
    """Locate the clue regions and playable grid, straightening a tilted photo.

    Lines are found by projecting ink straight down/across the image, so a
    photo tilted even half a cell over the grid's height smears each thin line
    across a cell and only the bold every-5 lines survive. That bites on the
    Android client's uploads (downscaled to 2000px, ~20px cells): a 60x50
    board read as 60x51, another as 61x8. So locate the grid once, find its four corners, warp
    the whole image so the grid is an upright rectangle (the clue areas beside
    it come along), and detect again. The returned geometry's ``image`` is the
    image its coordinates refer to; crop clues from that, not the input.
    """
    first = _detect(image, debug_dir)
    straight = _straighten(image, first.grid_rect)
    if straight is None:
        return first
    return _detect(straight, debug_dir)


# Corners already within this many px of an upright rectangle: leave as is.
_UPRIGHT_PX = 1.5
# Points sampled along each side of the grid border when fitting it.
_BORDER_SAMPLES = 24


def _straighten(image: NDArray, grid_rect: tuple[int, int, int, int]) -> NDArray | None:
    """Warp ``image`` so the playable grid's border is an upright rectangle.

    Returns ``None`` when the grid is already upright or its border can't be
    fitted (keep the first pass rather than warp on a bad quad).
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    quad = _fit_grid_corners(gray, grid_rect)
    if quad is None:
        return None

    tl, tr, br, bl = quad
    left, right = (tl[0] + bl[0]) / 2, (tr[0] + br[0]) / 2
    top, bottom = (tl[1] + tr[1]) / 2, (bl[1] + br[1]) / 2
    upright = np.float32([[left, top], [right, top], [right, bottom], [left, bottom]])
    if np.max(np.abs(quad - upright)) <= _UPRIGHT_PX:
        return None

    h_img, w_img = image.shape[:2]
    M = cv2.getPerspectiveTransform(quad, upright)
    return cv2.warpPerspective(
        image, M, (w_img, h_img),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255),
    )


def _fit_grid_corners(
    gray: NDArray, grid_rect: tuple[int, int, int, int]
) -> NDArray | None:
    """Fit the four thick border lines of the playable grid; return TL, TR, BR, BL.

    The first pass's axis-aligned rect sits on each border line somewhere
    along its length. Sample the darkest band near the rect edge at points
    along each side, fit a straight line through them (dropping strays such as
    a clue digit), and intersect neighbouring sides.
    """
    gx, gy, gw, gh = grid_rect
    h_img, w_img = gray.shape
    dark = 255.0 - gray.astype(np.float32)
    reach = max(12, int(0.035 * max(gw, gh)))  # how far a tilted edge can stray
    half = max(2, int(0.01 * max(gw, gh)))  # half-width of each sample strip

    def side(horizontal: bool, at: int) -> tuple[float, float] | None:
        """Fit ``pos = a * t + b`` for one side; t runs along the side."""
        span = (gx, gx + gw) if horizontal else (gy, gy + gh)
        ts, ps = [], []
        for k in range(_BORDER_SAMPLES):
            # Keep clear of the corners, where the crossing side's ink sits.
            t = int(span[0] + (0.05 + 0.9 * k / (_BORDER_SAMPLES - 1)) * (span[1] - span[0]))
            lo, hi = max(0, at - reach), min((h_img if horizontal else w_img), at + reach)
            if horizontal:
                prof = dark[lo:hi, max(0, t - half):t + half + 1].mean(axis=1)
            else:
                prof = dark[max(0, t - half):t + half + 1, lo:hi].mean(axis=0)
            if prof.size < 3:
                continue
            # Smooth over a line's thickness so the thick border beats a thin line.
            prof = np.convolve(prof, np.ones(5) / 5, mode="same")
            ts.append(t)
            ps.append(lo + float(np.argmax(prof)))
        if len(ts) < _BORDER_SAMPLES // 2:
            return None
        t_arr, p_arr = np.array(ts, float), np.array(ps, float)
        keep = np.ones(len(t_arr), bool)
        for _ in range(3):
            a, b = np.polyfit(t_arr[keep], p_arr[keep], 1)
            res = np.abs(p_arr - (a * t_arr + b))
            new_keep = res <= max(2.0, 2.5 * float(np.median(res[keep])))
            if (new_keep == keep).all() or new_keep.sum() < _BORDER_SAMPLES // 2:
                break
            keep = new_keep
        return float(a), float(b)

    top = side(True, gy)
    bottom = side(True, gy + gh)
    left = side(False, gx)
    right = side(False, gx + gw)
    if None in (top, bottom, left, right):
        return None

    def meet(hl: tuple[float, float], vl: tuple[float, float]) -> tuple[float, float]:
        # y = a1 x + b1 (horizontal side), x = a2 y + b2 (vertical side)
        a1, b1 = hl
        a2, b2 = vl
        y = (a1 * b2 + b1) / (1 - a1 * a2)
        return a2 * y + b2, y

    quad = np.float32([meet(top, left), meet(top, right), meet(bottom, right), meet(bottom, left)])
    rect = np.float32([[gx, gy], [gx + gw, gy], [gx + gw, gy + gh], [gx, gy + gh]])
    if np.any(np.linalg.norm(quad - rect, axis=1) > reach * 1.5):
        return None
    return quad


def _detect(
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
