from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.signal import find_peaks

from puzzle_parsers.cell_extraction import (
    GridGeometry,
    detect_internal_grid,
    extract_cells_from_geometry,
    find_best_grid_group,
)
from puzzle_parsers.grid_utils import order_points


# Standard combo-sudoku layouts (subboard positions in room coordinates)
CROSS_LAYOUT = [
    (2, 0),  # top
    (0, 2),  # left
    (4, 2),  # right
    (2, 4),  # bottom
]

DIAGONAL_LAYOUT = [
    (0, 0),
    (1, 1),
    (2, 2),
    (3, 3),
]


@dataclass
class DetectedSubboard:
    """A single detected subboard with its position and geometry."""

    room_x: int
    room_y: int
    geometry: GridGeometry
    quad: NDArray  # 4 corner points in original image coordinates


def detect_subboards(
    image: NDArray,
    debug_dir: str | None = None,
) -> list[DetectedSubboard]:
    """Detect individual 9x9 subboards using line-ink occupancy analysis.

    Strategy:
    1. Detect all horizontal and vertical lines via morphology
    2. Filter to the largest evenly-spaced grid subset
    3. Build cell occupancy map by verifying line ink at each cell's borders
    4. Find all 9x9 fully-occupied regions → subboards
    5. Compute room coordinates from cell positions
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(gray, (5, 5), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 3,
    )

    # Use w//12 kernel to catch even shorter internal lines within a single board
    min_h_len = max(w // 12, 150)
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (min_h_len, 1))
    h_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)

    min_v_len = max(h // 12, 150)
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_v_len))
    v_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)

    if debug_path:
        combined = cv2.bitwise_or(h_mask, v_mask)
        cv2.imwrite(str(debug_path / "01_border_mask.png"), combined)

    # Extract line segments
    h_segments = _extract_h_segments(h_mask)
    v_segments = _extract_v_segments(v_mask)

    if debug_path:
        vis = image.copy()
        for (y, x1, x2) in h_segments:
            cv2.line(vis, (x1, y), (x2, y), (0, 0, 255), 1)
        for (x, y1, y2) in v_segments:
            cv2.line(vis, (x, y1), (x, y2), (255, 0, 0), 1)
        cv2.imwrite(str(debug_path / "02_line_segments.png"), vis)

    # Find subboards using line-ink occupancy
    subboard_rects = _find_subboard_rects(h_segments, v_segments, h_mask, v_mask, w, h)

    if debug_path:
        vis = image.copy()
        for i, (x1, y1, x2, y2, _r, _c) in enumerate(subboard_rects):
            cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 255, 0), 3)
            cv2.putText(vis, str(i), ((x1+x2)//2, (y1+y2)//2),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 3)
        cv2.imwrite(str(debug_path / "02_candidates.png"), vis)

    if len(subboard_rects) < 2:
        return []

    # Compute room coordinates from cell grid indices
    # Each board starts at (row_start, col_start) in the uniform cell grid
    # Room coordinate = offset / 3 (since each room is 3 cells)
    min_row = min(r[4] for r in subboard_rects)
    min_col = min(r[5] for r in subboard_rects)

    # Warp each subboard and detect internal grid
    results: list[DetectedSubboard] = []
    for i, (x1, y1, x2, y2, row_start, col_start) in enumerate(subboard_rects):
        room_x = (col_start - min_col) // 3
        room_y = (row_start - min_row) // 3

        quad = np.float32([[x1, y1], [x2, y1], [x2, y2], [x1, y2]])

        warp_size = 540
        dst = np.float32([[0, 0], [warp_size, 0], [warp_size, warp_size], [0, warp_size]])
        M = cv2.getPerspectiveTransform(quad, dst)
        warped = cv2.warpPerspective(image, M, (warp_size, warp_size))

        cell_w = warp_size / 9.0
        cell_h = warp_size / 9.0
        grid_x0 = 0.0
        grid_y0 = 0.0

        # Try to refine with detected internal lines (small adjustments only)
        warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
        int_h_lines, int_v_lines = _detect_internal_grid(warped_gray, warp_size)

        if int_h_lines and len(int_h_lines) >= 8:
            refined_cell_h = (int_h_lines[-1] - int_h_lines[0]) / (len(int_h_lines) - 1)
            refined_y0 = float(int_h_lines[0]) - refined_cell_h
            if abs(refined_y0) < cell_h * 0.4:
                cell_h = refined_cell_h
                grid_y0 = refined_y0
        if int_v_lines and len(int_v_lines) >= 8:
            refined_cell_w = (int_v_lines[-1] - int_v_lines[0]) / (len(int_v_lines) - 1)
            refined_x0 = float(int_v_lines[0]) - refined_cell_w
            if abs(refined_x0) < cell_w * 0.4:
                cell_w = refined_cell_w
                grid_x0 = refined_x0

        geom = GridGeometry(
            warped=warped, grid_x0=grid_x0, grid_y0=grid_y0,
            cell_w=cell_w, cell_h=cell_h,
            h_lines=int_h_lines, v_lines=int_v_lines,
        )

        results.append(DetectedSubboard(
            room_x=room_x, room_y=room_y, geometry=geom, quad=quad,
        ))

        if debug_path:
            cv2.imwrite(str(debug_path / f"03_subboard_{i}_warped.png"), warped)
            _save_internal_grid_debug(debug_path, i, warped, int_h_lines, int_v_lines)

    if debug_path:
        vis = image.copy()
        for sb in results:
            cv2.polylines(vis, [sb.quad.astype(int)], True, (0, 255, 0), 3)
            cx, cy = sb.quad.mean(axis=0).astype(int)
            label = f"({sb.room_x},{sb.room_y})"
            cv2.putText(vis, label, (cx - 40, cy), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 0, 0), 2)
        cv2.imwrite(str(debug_path / "00_input_annotated.png"), vis)

    return results


def _extract_h_segments(h_mask: NDArray) -> list[tuple[int, int, int]]:
    """Extract horizontal line segments as (y_position, x_start, x_end)."""
    row_sums = h_mask.sum(axis=1) / 255
    peaks, _ = find_peaks(row_sums, height=50, distance=15)

    segments: list[tuple[int, int, int]] = []
    for y in peaks:
        row = h_mask[y, :]
        nz = np.nonzero(row)[0]
        if len(nz) > 0:
            segments.append((int(y), int(nz[0]), int(nz[-1])))
    return segments


def _extract_v_segments(v_mask: NDArray) -> list[tuple[int, int, int]]:
    """Extract vertical line segments as (x_position, y_start, y_end)."""
    col_sums = v_mask.sum(axis=0) / 255
    peaks, _ = find_peaks(col_sums, height=50, distance=15)

    segments: list[tuple[int, int, int]] = []
    for x in peaks:
        col = v_mask[:, x]
        nz = np.nonzero(col)[0]
        if len(nz) > 0:
            segments.append((int(x), int(nz[0]), int(nz[-1])))
    return segments


def _find_subboard_rects(
    h_segments: list[tuple[int, int, int]],
    v_segments: list[tuple[int, int, int]],
    h_mask: NDArray,
    v_mask: NDArray,
    img_w: int,
    img_h: int,
) -> list[tuple[int, int, int, int]]:
    """Find subboard rectangles using line-ink occupancy verification.

    1. Find the uniform cell grid (evenly-spaced h/v lines)
    2. For each cell, verify grid line ink exists at its borders
    3. Find all 9x9 fully-occupied regions
    """
    if len(h_segments) < 10 or len(v_segments) < 10:
        return []

    # Cross-evidence filter: discard h-segments with no v-line ink crossing.
    # Only applied to h-lines because horizontal noise (text underlines, page edges)
    # is common, while v-lines rarely have this issue. Outer border v-lines
    # legitimately have no h-crossings at their position.
    tol = 5
    filtered_h = []
    for y, x1, x2 in h_segments:
        y0 = max(0, y - tol)
        y1_c = min(v_mask.shape[0], y + tol + 1)
        v_ink = v_mask[y0:y1_c, x1:x2].sum() / 255
        if v_ink > 10:
            filtered_h.append((y, x1, x2))

    h_segments = filtered_h if len(filtered_h) >= 10 else h_segments

    if len(h_segments) < 10 or len(v_segments) < 10:
        return []

    # Compute uniform grid spacing
    h_ys = sorted(s[0] for s in h_segments)
    v_xs = sorted(s[0] for s in v_segments)

    gaps_h = np.diff(h_ys)
    gaps_v = np.diff(v_xs)
    med_h = float(np.median(gaps_h))
    med_v = float(np.median(gaps_v))
    cell_h = float(np.median(gaps_h[(gaps_h > med_h * 0.5) & (gaps_h < med_h * 2.0)]))
    cell_w = float(np.median(gaps_v[(gaps_v > med_v * 0.5) & (gaps_v < med_v * 2.0)]))

    # Filter to the largest regular grid subset
    h_ys_filtered = _filter_to_regular_grid(h_ys, cell_h)
    v_xs_filtered = _filter_to_regular_grid(v_xs, cell_w)

    if len(h_ys_filtered) < 10 or len(v_xs_filtered) < 10:
        return []

    # Extend grid at both ends to reach a multiple-of-3 cell count.
    # This handles cases where boundary lines aren't detected.
    avg_gap_h = (h_ys_filtered[-1] - h_ys_filtered[0]) / (len(h_ys_filtered) - 1) if len(h_ys_filtered) > 1 else cell_h
    avg_gap_v = (v_xs_filtered[-1] - v_xs_filtered[0]) / (len(v_xs_filtered) - 1) if len(v_xs_filtered) > 1 else cell_w

    # Extend at front if there's room
    while (len(h_ys_filtered) - 1) % 3 != 0 and h_ys_filtered[0] - avg_gap_h > 0:
        h_ys_filtered.insert(0, max(0, int(h_ys_filtered[0] - avg_gap_h)))
    while (len(v_xs_filtered) - 1) % 3 != 0 and v_xs_filtered[0] - avg_gap_v > 0:
        v_xs_filtered.insert(0, max(0, int(v_xs_filtered[0] - avg_gap_v)))

    # Extend at end if still needed
    while (len(h_ys_filtered) - 1) % 3 != 0 and len(h_ys_filtered) < 30:
        h_ys_filtered.append(min(int(h_ys_filtered[-1] + avg_gap_h), img_h - 1))
    while (len(v_xs_filtered) - 1) % 3 != 0 and len(v_xs_filtered) < 30:
        v_xs_filtered.append(min(int(v_xs_filtered[-1] + avg_gap_v), img_w - 1))

    # Build occupancy maps at two strictness levels
    cell_strict = _build_occupancy_map(h_ys_filtered, v_xs_filtered, h_mask, v_mask, min_score=2)
    cell_relaxed = _build_occupancy_map(h_ys_filtered, v_xs_filtered, h_mask, v_mask, min_score=1)

    # Use relaxed map for candidate generation but strict map for IoU scoring
    rects = _find_9x9_regions(cell_relaxed, cell_strict, h_ys_filtered, v_xs_filtered, min_cells=72)

    rects.sort(key=lambda r: (r[1] + r[0]))
    return rects


def _build_occupancy_map(
    h_ys: list[int],
    v_xs: list[int],
    h_mask: NDArray,
    v_mask: NDArray,
    min_score: int = 2,
) -> NDArray:
    """Build a boolean map of which cells have grid line ink at their borders.

    For each cell, checks 4 borders (top/bottom h-line, left/right v-line).
    A border is confirmed if >40% of its length has ink in the corresponding mask.
    Cell is present if at least `min_score` borders are confirmed.
    """
    n_rows = len(h_ys) - 1
    n_cols = len(v_xs) - 1
    cell_present = np.zeros((n_rows, n_cols), dtype=bool)
    tolerance = 3  # pixels above/below line center to check

    for r in range(n_rows):
        for c in range(n_cols):
            y_top = h_ys[r]
            y_bot = h_ys[r + 1]
            x_left = v_xs[c]
            x_right = v_xs[c + 1]
            cell_w = x_right - x_left
            cell_h = y_bot - y_top

            score = 0

            # Top h-line: check h_mask at y_top across [x_left, x_right]
            yt0 = max(0, y_top - tolerance)
            yt1 = min(h_mask.shape[0], y_top + tolerance + 1)
            top_ink = h_mask[yt0:yt1, x_left:x_right].sum() / 255
            if top_ink > cell_w * 0.4:
                score += 1

            # Bottom h-line
            yb0 = max(0, y_bot - tolerance)
            yb1 = min(h_mask.shape[0], y_bot + tolerance + 1)
            bot_ink = h_mask[yb0:yb1, x_left:x_right].sum() / 255
            if bot_ink > cell_w * 0.4:
                score += 1

            # Left v-line: check v_mask at x_left across [y_top, y_bot]
            xl0 = max(0, x_left - tolerance)
            xl1 = min(v_mask.shape[1], x_left + tolerance + 1)
            left_ink = v_mask[y_top:y_bot, xl0:xl1].sum() / 255
            if left_ink > cell_h * 0.4:
                score += 1

            # Right v-line
            xr0 = max(0, x_right - tolerance)
            xr1 = min(v_mask.shape[1], x_right + tolerance + 1)
            right_ink = v_mask[y_top:y_bot, xr0:xr1].sum() / 255
            if right_ink > cell_h * 0.4:
                score += 1

            cell_present[r, c] = score >= min_score

    return cell_present


def _filter_to_regular_grid(positions: list[int], expected_gap: float) -> list[int]:
    """Filter positions to keep only the largest evenly-spaced subset."""
    if len(positions) < 3:
        return positions

    # Try to find the largest group of evenly-spaced lines
    # Start from the full set and work down
    for target in range(len(positions), 9, -1):
        result = _find_best_grid_group(positions, target)
        if result is not None:
            # Verify spacing is close to expected_gap
            avg_gap = (result[-1] - result[0]) / (len(result) - 1)
            if abs(avg_gap - expected_gap) < expected_gap * 0.4:
                return result

    return positions


def _find_9x9_regions(
    cell_candidates: NDArray,
    cell_scoring: NDArray,
    h_ys: list[int],
    v_xs: list[int],
    min_cells: int = 72,
) -> list[tuple[int, int, int, int, int, int]]:
    """Find all 9x9 contiguous regions in the cell presence map.

    Args:
        cell_candidates: relaxed occupancy map for generating board candidates
        cell_scoring: strict occupancy map for IoU scoring
        h_ys: grid line y positions
        v_xs: grid line x positions
        min_cells: minimum occupied cells in the relaxed map to be a candidate

    Returns list of (x1, y1, x2, y2, row_start, col_start).
    """
    from itertools import combinations
    from collections import defaultdict

    n_rows, n_cols = cell_candidates.shape

    sig_candidates: dict[tuple[int, int], list[tuple[int, int, int]]] = defaultdict(list)
    for r in range(n_rows - 8):
        for c in range(n_cols - 8):
            count = int(cell_candidates[r:r+9, c:c+9].sum())
            if count >= min_cells:
                sig_candidates[(r % 3, c % 3)].append((r, c, count))

    if not sig_candidates:
        return []

    best_rects: list[tuple[int, int, int, int, int, int]] = []
    best_score = 0.0

    for sig, candidates in sig_candidates.items():
        candidates.sort(key=lambda t: -t[2])
        filtered: list[tuple[int, int, int]] = []
        for r, c, count in candidates:
            too_close = any(abs(r - fr) < 3 and abs(c - fc) < 3 for fr, fc, _ in filtered)
            if not too_close:
                filtered.append((r, c, count))

        if len(filtered) < 2:
            continue

        max_boards = min(6, len(filtered))
        sig_best: list[tuple[int, int]] = []
        sig_best_score = 0.0

        for n in range(2, max_boards + 1):
            for combo in combinations(range(len(filtered)), n):
                union = np.zeros_like(cell_scoring)
                for idx in combo:
                    r, c, _ = filtered[idx]
                    union[r:r+9, c:c+9] = True
                # IoU against the STRICT occupancy map
                intersection = int((union & cell_scoring).sum())
                union_area = int((union | cell_scoring).sum())
                score = intersection / union_area if union_area > 0 else 0.0
                if score > sig_best_score:
                    sig_best_score = score
                    sig_best = [(filtered[idx][0], filtered[idx][1]) for idx in combo]
            if sig_best_score > 0.95:
                break

        if sig_best_score > best_score:
            best_score = sig_best_score
            best_rects = [
                (v_xs[c], h_ys[r], v_xs[c + 9], h_ys[r + 9], r, c)
                for r, c in sig_best
            ]

    return best_rects


def _deduplicate_rects_with_indices(
    rects: list[tuple[int, int, int, int, int, int]]
) -> list[tuple[int, int, int, int, int, int]]:
    """Remove rectangles that significantly overlap, keeping cell indices."""
    if not rects:
        return rects

    kept: list[tuple[int, int, int, int, int, int]] = []
    for r in rects:
        is_dup = False
        for k in kept:
            ix1 = max(r[0], k[0])
            iy1 = max(r[1], k[1])
            ix2 = min(r[2], k[2])
            iy2 = min(r[3], k[3])
            if ix1 < ix2 and iy1 < iy2:
                inter = (ix2 - ix1) * (iy2 - iy1)
                area_r = (r[2] - r[0]) * (r[3] - r[1])
                area_k = (k[2] - k[0]) * (k[3] - k[1])
                iou = inter / min(area_r, area_k)
                if iou > 0.7:
                    is_dup = True
                    break
        if not is_dup:
            kept.append(r)
    return kept


_detect_internal_grid = detect_internal_grid


def _save_internal_grid_debug(
    debug_path: Path, idx: int, warped: NDArray, h_lines: list[int], v_lines: list[int]
) -> None:
    vis = warped.copy()
    for y in h_lines:
        cv2.line(vis, (0, y), (vis.shape[1], y), (0, 180, 0), 1)
    for x in v_lines:
        cv2.line(vis, (x, 0), (x, vis.shape[0]), (180, 0, 0), 1)
    cv2.imwrite(str(debug_path / f"04_subboard_{idx}_gridlines.png"), vis)


def detect_grid_geometry(
    image: NDArray,
    layout: list[tuple[int, int]] | None = None,
    debug_dir: str | None = None,
) -> GridGeometry:
    """Detect grid geometry: find border, warp to remove perspective, locate grid."""
    if layout is None:
        layout = CROSS_LAYOUT

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # Step 1: Find the outer border of the puzzle
    border_pts = _find_puzzle_border(gray)

    if debug_dir:
        _save_debug(debug_dir, "01_border", image, border_pts)

    # Step 2: Warp to remove perspective, preserving aspect ratio
    max_room_x = max(pos[0] for pos in layout) + 3
    max_room_y = max(pos[1] for pos in layout) + 3
    total_cells_x = max_room_x * 3
    total_cells_y = max_room_y * 3

    # Compute width/height of the detected border to preserve aspect ratio
    src_w = float(np.linalg.norm(border_pts[1] - border_pts[0]))
    src_h = float(np.linalg.norm(border_pts[3] - border_pts[0]))
    aspect = src_w / src_h if src_h > 0 else 1.0

    warp_h = 2800
    warp_w = int(warp_h * aspect)
    dst_pts = np.float32([[0, 0], [warp_w, 0], [warp_w, warp_h], [0, warp_h]])
    M = cv2.getPerspectiveTransform(border_pts, dst_pts)
    warped = cv2.warpPerspective(image, M, (warp_w, warp_h))

    if debug_dir:
        cv2.imwrite(str(Path(debug_dir) / "02_warped.png"), cv2.resize(warped, None, fx=0.5, fy=0.5))

    # Step 3: Detect grid lines in the warped image
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines, v_lines_top = _detect_lines_in_warped(warped_gray, warp_w)

    if debug_dir:
        _save_grid_debug(debug_dir, "03_grid_lines", warped, h_lines, v_lines or v_lines_top, layout)

    # Step 4: Compute grid origin and cell size from detected lines
    if v_lines and len(v_lines) >= 21:
        cell_w = (v_lines[-1] - v_lines[0]) / (len(v_lines) - 1)
        # If first line is near the image edge, it IS the left border
        if v_lines[0] < cell_w * 0.5:
            grid_x0 = float(v_lines[0])
        else:
            grid_x0 = v_lines[0] - cell_w
    elif v_lines_top and len(v_lines_top) == 10:
        cell_w = (v_lines_top[-1] - v_lines_top[0]) / 9.0
        top_room_x = layout[0][0]
        grid_x0 = v_lines_top[0] - top_room_x * 3 * cell_w
    else:
        cell_w = warp_w / total_cells_x
        grid_x0 = 0.0

    target_h_lines = total_cells_y + 1  # 22 for a 21-row grid
    if h_lines and len(h_lines) > target_h_lines:
        # Too many h_lines detected (e.g. page header/footer artifacts).
        # Keep only the first target_h_lines — we prepended from the top,
        # so excess lines are at the bottom (from non-grid features).
        h_lines = h_lines[:target_h_lines]

    if h_lines and len(h_lines) >= 2:
        cell_h = (h_lines[-1] - h_lines[0]) / (len(h_lines) - 1)
        grid_y0 = float(h_lines[0])
    else:
        cell_h = cell_w
        grid_y0 = 0.0

    return GridGeometry(
        warped=warped, grid_x0=grid_x0, grid_y0=grid_y0, cell_w=cell_w, cell_h=cell_h,
        h_lines=h_lines, v_lines=v_lines or [],
    )


def _find_puzzle_border(gray: NDArray) -> NDArray:
    """Find the 4 corner points of the puzzle's bounding quadrilateral.

    Strategy:
    1. Find horizontal grid lines via morphology
    2. In the middle band (where all 21 columns exist), scan intensity profiles
       to find evenly-spaced vertical grid line crossings
    3. Extend the spacing outward to locate the leftmost/rightmost grid lines
    4. Fit left/right border lines through these points across multiple y-positions
    5. Fit top/bottom from the first/last detected horizontal lines
    6. Intersect the 4 lines to get the trapezoid corners
    """
    h, w = gray.shape

    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(gray, (5, 5), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 3,
    )

    # Step 1: Detect horizontal grid lines
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (w // 5, 1))
    h_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    row_sums = h_mask.sum(axis=1) / 255
    h_peaks, _ = find_peaks(row_sums, height=50, distance=30)

    if len(h_peaks) < 4:
        return _find_border_fallback(gray)

    top_y = float(h_peaks[0])
    bot_y = float(h_peaks[-1])

    # Step 2: Find left/right borders from grid line crossings in the middle band
    left_pts, right_pts = _find_lr_borders_from_crossings(gray, h_peaks)

    if len(left_pts) < 3 or len(right_pts) < 3:
        return _find_border_fallback(gray)

    left_arr = np.array(left_pts)
    right_arr = np.array(right_pts)
    sl, il = np.polyfit(left_arr[:, 1], left_arr[:, 0], 1)
    sr, ir = np.polyfit(right_arr[:, 1], right_arr[:, 0], 1)

    # Step 3: Fit top/bottom lines
    top_pts = _scan_line_y_positions(binary, top_y, w)
    bot_pts = _scan_line_y_positions(binary, bot_y, w)

    if len(top_pts) >= 3 and len(bot_pts) >= 3:
        st, it_ = np.polyfit(top_pts[:, 0], top_pts[:, 1], 1)
        sb, ib = np.polyfit(bot_pts[:, 0], bot_pts[:, 1], 1)
    else:
        st, it_, sb, ib = 0.0, top_y, 0.0, bot_y

    # Step 4: Intersect to get corners
    tl = _intersect_hv(st, it_, sl, il)
    tr = _intersect_hv(st, it_, sr, ir)
    bl = _intersect_hv(sb, ib, sl, il)
    br = _intersect_hv(sb, ib, sr, ir)

    pts = np.float32([tl, tr, br, bl])

    if (pts[:, 0].min() < -w * 0.3 or pts[:, 0].max() > w * 1.3 or
            pts[:, 1].min() < -h * 0.3 or pts[:, 1].max() > h * 1.3):
        return _find_border_fallback(gray)

    return order_points(pts)


def _find_lr_borders_from_crossings(
    gray: NDArray, h_peaks: NDArray
) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    """Find left/right border positions by detecting evenly-spaced grid crossings."""
    h, w = gray.shape
    mid_y = int((h_peaks[0] + h_peaks[-1]) / 2)
    scan_start = max(int(h_peaks[0]) + 100, mid_y - int(h * 0.2))
    scan_end = min(int(h_peaks[-1]) - 100, mid_y + int(h * 0.2))

    left_pts: list[tuple[float, float]] = []
    right_pts: list[tuple[float, float]] = []

    for yi in range(scan_start, scan_end, 30):
        strip = gray[max(0, yi - 2): yi + 3, :].mean(axis=0)
        inverted = 255.0 - strip
        peaks, props = find_peaks(inverted, height=50, distance=30, prominence=15)
        if len(peaks) < 10:
            continue

        # Find a 10-line evenly-spaced group to determine cell_w
        best = _find_best_grid_group(peaks.tolist(), 10)
        if best is None:
            continue

        cell_w = (best[-1] - best[0]) / 9.0
        prominences = props["prominences"]
        # Minimum prominence for a real grid line: use median of the best group
        best_indices = [i for i, p in enumerate(peaks) if p in best]
        min_prom = float(np.median(prominences[best_indices])) * 0.5

        # Extend left from best[0]
        grid_x0 = float(best[0])
        while True:
            expected = grid_x0 - cell_w
            if expected < 0:
                break
            dists = np.abs(peaks.astype(float) - expected)
            idx = int(dists.argmin())
            if dists[idx] < cell_w * 0.25 and prominences[idx] >= min_prom:
                grid_x0 = float(peaks[idx])
            else:
                break

        # Extend right from best[-1]
        grid_xend = float(best[-1])
        while True:
            expected = grid_xend + cell_w
            if expected > w:
                break
            dists = np.abs(peaks.astype(float) - expected)
            idx = int(dists.argmin())
            if dists[idx] < cell_w * 0.25 and prominences[idx] >= min_prom:
                grid_xend = float(peaks[idx])
            else:
                break

        n_cells = round((grid_xend - grid_x0) / cell_w)
        if n_cells >= 20:
            left_pts.append((grid_x0, float(yi)))
            right_pts.append((grid_xend, float(yi)))

    return left_pts, right_pts


def _scan_line_y_positions(
    binary: NDArray, approx_y: float, w: int
) -> NDArray:
    """Scan column profiles near a horizontal line to find its exact y at multiple x positions."""
    pts = []
    yi = int(approx_y)
    for x in range(w // 10, w - w // 10, w // 20):
        col = binary[max(0, yi - 30): yi + 30, max(0, x - 2): x + 3].max(axis=1)
        nz = np.nonzero(col)[0]
        if len(nz) > 0:
            actual_y = (yi - 30) + nz[len(nz) // 2]
            pts.append((float(x), float(actual_y)))
    return np.array(pts) if pts else np.empty((0, 2))


def _intersect_hv(
    s_h: float, i_h: float, s_v: float, i_v: float
) -> tuple[float, float]:
    """Intersect y = s_h*x + i_h with x = s_v*y + i_v."""
    denom = 1.0 - s_h * s_v
    if abs(denom) < 1e-9:
        return (i_v, i_h)
    y = (s_h * i_v + i_h) / denom
    x = s_v * y + i_v
    return (x, y)


def _find_border_fallback(gray: NDArray) -> NDArray:
    """Fallback: use largest contour's minAreaRect."""
    h, w = gray.shape
    _, thresh = cv2.threshold(gray, 140, 255, cv2.THRESH_BINARY_INV)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    eroded = cv2.erode(thresh, kernel, iterations=3)
    contours, _ = cv2.findContours(eroded, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    largest = max(contours, key=cv2.contourArea)
    rect = cv2.minAreaRect(largest)
    box = cv2.boxPoints(rect)
    return order_points(np.float32(box))




def _detect_lines_in_warped(
    warped_gray: NDArray, warp_size: int
) -> tuple[list[int], list[int] | None]:
    """Detect horizontal and vertical grid lines in the warped image."""
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (5, 5), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 3,
    )

    # Horizontal lines — use a wider kernel to only pick up full-width lines
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (warp_size // 20, 1))
    h_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    row_sums = h_mask.sum(axis=1) / 255
    h_peaks, _ = find_peaks(row_sums, height=40, distance=20)
    h_lines = _filter_grid_lines(h_peaks.tolist())

    # If the top border line was missed (e.g. puzzle fills the image and the
    # border is at the very edge), prepend it. Only do this if the first
    # detected line is very close to one gap from y=0 (the image edge).
    if len(h_lines) >= 2:
        avg_gap = (h_lines[-1] - h_lines[0]) / (len(h_lines) - 1)
        expected_border = h_lines[0] - avg_gap
        if abs(expected_border) < avg_gap * 0.15:
            h_lines.insert(0, max(0, int(expected_border)))
        # Similarly for the bottom border
        expected_bottom = h_lines[-1] + avg_gap
        if expected_bottom <= warped_gray.shape[0] + avg_gap * 0.3:
            extrapolated = min(warped_gray.shape[0] - 1, int(h_lines[-1] + avg_gap))
            h_lines.append(extrapolated)

    # Vertical lines: morphological detection in the middle band
    # where all 21 columns exist
    v_lines: list[int] | None = None
    if len(h_lines) >= 12:
        mid_y0 = h_lines[7]
        mid_y1 = h_lines[11]
        mid_crop = binary[mid_y0:mid_y1, :]
        crop_h = mid_y1 - mid_y0
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, crop_h // 3))
        v_mask = cv2.morphologyEx(mid_crop, cv2.MORPH_OPEN, v_kernel)
        col_sums = v_mask.sum(axis=0) / 255
        peaks, _ = find_peaks(col_sums, height=crop_h * 0.15, distance=20)
        v_filtered = _filter_grid_lines(peaks.tolist())
        if len(v_filtered) >= 21:
            v_lines = v_filtered

    # Fallback: scan at top board y-position for a 10-group
    v_lines_top: list[int] | None = None
    if v_lines is None and len(h_lines) > 3:
        scan_y = h_lines[3]
        row_slice = warped_gray[scan_y - 3 : scan_y + 3, :].mean(axis=0)
        inverted = 255.0 - row_slice
        peaks, _ = find_peaks(inverted, height=50, distance=40, prominence=15)
        v_lines_top = _find_best_grid_group(peaks.tolist(), 10)

    return h_lines, v_lines, v_lines_top


def _merge_close_peaks(lines: list[int], min_gap: int = 60) -> list[int]:
    """Merge peaks that are closer than min_gap (thick border double-detections)."""
    if not lines:
        return lines
    merged: list[int] = []
    group: list[int] = [lines[0]]
    for i in range(1, len(lines)):
        if lines[i] - group[-1] < min_gap:
            group.append(lines[i])
        else:
            merged.append(int(np.mean(group)))
            group = [lines[i]]
    merged.append(int(np.mean(group)))
    return merged


def _filter_grid_lines(lines: list[int]) -> list[int]:
    """Merge double-peaks, then find the longest run of consistently-spaced lines."""
    lines = _merge_close_peaks(lines)
    if len(lines) < 3:
        return lines

    best_run: list[int] = []

    for start in range(len(lines)):
        run = [lines[start]]
        for i in range(start + 1, len(lines)):
            gap = lines[i] - run[-1]
            if len(run) >= 2:
                avg_gap = (run[-1] - run[0]) / (len(run) - 1)
                if gap > avg_gap * 1.5:
                    break
            elif gap > 200:
                break
            run.append(lines[i])

        if len(run) > len(best_run):
            best_run = run

    return best_run


_find_best_grid_group = find_best_grid_group


def extract_cells_for_subboard(
    image: NDArray,
    geometry: GridGeometry,
    room_x: int,
    room_y: int,
    grid_size: int = 9,
    room_size: int = 3,
) -> list[list[NDArray]]:
    """Extract cell images for a subboard using global grid geometry."""
    warped = geometry.warped
    h, w = warped.shape[:2]

    # Determine row positions from global h_lines
    row_start = room_y * room_size
    local_y0, local_cell_h = _get_h_positions_from_global(
        geometry.h_lines, row_start, grid_size, geometry.cell_h, geometry.grid_y0
    )

    # Determine column positions from global v_lines or grid estimate
    col_start = room_x * room_size
    local_x0, local_cell_w = _get_v_positions_from_global(
        geometry.v_lines, col_start, grid_size, geometry.cell_w, geometry.grid_x0
    )

    margin_ratio = 0.15
    cells: list[list[NDArray]] = []

    for row in range(grid_size):
        row_cells = []
        for col in range(grid_size):
            x1 = int(local_x0 + col * local_cell_w)
            y1 = int(local_y0 + row * local_cell_h)
            x2 = int(x1 + local_cell_w)
            y2 = int(y1 + local_cell_h)

            margin_x = int(local_cell_w * margin_ratio)
            margin_y = int(local_cell_h * margin_ratio)

            cy1 = max(0, y1 + margin_y)
            cy2 = min(h, y2 - margin_y)
            cx1 = max(0, x1 + margin_x)
            cx2 = min(w, x2 - margin_x)

            cell = warped[cy1:cy2, cx1:cx2]
            if cell.size == 0:
                cell = np.ones((10, 10, 3), dtype=np.uint8) * 255
            row_cells.append(cell)
        cells.append(row_cells)

    return cells


def _get_h_positions_from_global(
    h_lines: list[int],
    row_start: int,
    grid_size: int,
    est_cell_h: float,
    grid_y0: float,
) -> tuple[float, float]:
    """Get y0 and cell_h for a subboard from the global h_lines array."""
    needed = grid_size + 1

    if len(h_lines) >= row_start + needed:
        sub_lines = h_lines[row_start: row_start + needed]
        cell_h = (sub_lines[-1] - sub_lines[0]) / grid_size
        return float(sub_lines[0]), cell_h

    available = h_lines[row_start:] if row_start < len(h_lines) else []
    if len(available) >= 2:
        cell_h = (available[-1] - available[0]) / (len(available) - 1)
        return float(available[0]), cell_h

    y0 = grid_y0 + row_start * est_cell_h
    return y0, est_cell_h


def _get_v_positions_from_global(
    v_lines: list[int],
    col_start: int,
    grid_size: int,
    est_cell_w: float,
    grid_x0: float,
) -> tuple[float, float]:
    """Get x0 and cell_w for a subboard from the global v_lines array.

    v_lines may contain 22 boundary lines (including left/right borders)
    or 21 interior-only lines, depending on what was detected. We determine
    which case by checking if v_lines[0] is near the image edge.
    """
    if not v_lines:
        return grid_x0 + col_start * est_cell_w, est_cell_w

    cell_w = (v_lines[-1] - v_lines[0]) / (len(v_lines) - 1)
    # If first line is near edge, v_lines includes borders: v_lines[i] = left edge of col i
    includes_borders = v_lines[0] < cell_w * 0.5

    if includes_borders:
        # v_lines[col_start] = left border of subboard
        # v_lines[col_start + grid_size] = right border of subboard
        left_idx = col_start
        right_idx = col_start + grid_size
    else:
        # v_lines are interior only: v_lines[i] = line between col i and col i+1
        # Left border of subboard = v_lines[col_start-1] or extrapolated
        left_idx = col_start - 1
        right_idx = col_start + grid_size - 1

    if left_idx >= 0 and right_idx < len(v_lines):
        x0 = float(v_lines[left_idx])
        cell_w = (v_lines[right_idx] - v_lines[left_idx]) / grid_size
        return x0, cell_w
    elif left_idx < 0 and right_idx < len(v_lines):
        # Leftmost board — extrapolate left border
        cell_w = (v_lines[right_idx] - v_lines[0]) / (right_idx) if right_idx > 0 else est_cell_w
        x0 = v_lines[0] - cell_w if not includes_borders else 0.0
        return x0, cell_w
    elif left_idx >= 0 and left_idx < len(v_lines):
        # Rightmost goes off array — use available spacing
        x0 = float(v_lines[left_idx])
        return x0, cell_w

    return grid_x0 + col_start * est_cell_w, est_cell_w






# --- Debug helpers ---


def _save_debug(debug_dir: str, name: str, image: NDArray, border_pts: NDArray) -> None:
    path = Path(debug_dir)
    path.mkdir(parents=True, exist_ok=True)
    vis = cv2.resize(image.copy(), None, fx=0.5, fy=0.5)
    pts_scaled = (border_pts * 0.5).astype(int)
    cv2.polylines(vis, [pts_scaled], True, (0, 255, 0), 2)
    for pt in pts_scaled:
        cv2.circle(vis, tuple(pt), 5, (0, 0, 255), -1)
    cv2.imwrite(str(path / f"{name}.png"), vis)


def _save_grid_debug(
    debug_dir: str,
    name: str,
    warped: NDArray,
    h_lines: list[int],
    v_lines_top: list[int] | None,
    layout: list[tuple[int, int]],
) -> None:
    path = Path(debug_dir)
    vis = cv2.resize(warped.copy(), None, fx=0.5, fy=0.5)
    s = 0.5
    for y in h_lines:
        cv2.line(vis, (0, int(y * s)), (vis.shape[1], int(y * s)), (0, 180, 0), 1)
    if v_lines_top:
        for x in v_lines_top:
            cv2.line(vis, (int(x * s), 0), (int(x * s), vis.shape[0]), (255, 0, 0), 1)
    cv2.imwrite(str(path / f"{name}.png"), vis)


def save_cell_debug(
    debug_dir: str,
    geometry: GridGeometry,
    layout: list[tuple[int, int]] | None = None,
) -> None:
    """Save debug images of extracted cells for each subboard."""
    if layout is None:
        layout = CROSS_LAYOUT
    path = Path(debug_dir)
    path.mkdir(parents=True, exist_ok=True)

    for room_x, room_y in layout:
        cells = extract_cells_for_subboard(geometry.warped, geometry, room_x, room_y)
        cell_display = 60
        composite = np.ones((9 * cell_display, 9 * cell_display, 3), dtype=np.uint8) * 255
        for r in range(9):
            for c in range(9):
                cell = cells[r][c]
                resized = cv2.resize(cell, (cell_display, cell_display))
                composite[
                    r * cell_display : (r + 1) * cell_display,
                    c * cell_display : (c + 1) * cell_display,
                ] = resized
        for r in range(10):
            cv2.line(composite, (0, r * cell_display), (9 * cell_display, r * cell_display), (180, 180, 180), 1)
        for c in range(10):
            cv2.line(composite, (c * cell_display, 0), (c * cell_display, 9 * cell_display), (180, 180, 180), 1)
        cv2.imwrite(str(path / f"cells_{room_x}_{room_y}.png"), composite)
