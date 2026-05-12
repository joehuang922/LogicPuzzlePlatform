from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.signal import find_peaks


@dataclass
class GridGeometry:
    """Grid geometry after perspective correction."""

    warped: NDArray  # the perspective-corrected image
    grid_x0: float  # x-origin of the grid in warped image
    grid_y0: float  # y-origin of the grid in warped image
    cell_w: float  # cell width in warped image pixels
    cell_h: float  # cell height in warped image pixels
    h_lines: list[int] = field(default_factory=list)  # detected horizontal grid lines
    v_lines: list[int] = field(default_factory=list)  # detected vertical grid lines (full width)


# Standard combo-sudoku layouts (subboard positions in room coordinates)
CROSS_LAYOUT = [
    (2, 0),  # top
    (0, 2),  # left
    (4, 2),  # right
    (2, 4),  # bottom
]


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

    return _order_points(pts)


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
    return _order_points(np.float32(box))


def _order_points(pts: NDArray) -> NDArray:
    """Order 4 points as: top-left, top-right, bottom-right, bottom-left."""
    # Sort by y first
    sorted_by_y = pts[np.argsort(pts[:, 1])]
    # Top two points (smallest y)
    top = sorted_by_y[:2]
    bottom = sorted_by_y[2:]
    # Sort top by x
    top = top[np.argsort(top[:, 0])]
    # Sort bottom by x
    bottom = bottom[np.argsort(bottom[:, 0])]
    return np.float32([top[0], top[1], bottom[1], bottom[0]])


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


def _find_best_grid_group(positions: list[int], target_count: int) -> list[int] | None:
    """Find the best group of target_count evenly-spaced positions (not necessarily consecutive)."""
    if len(positions) < target_count:
        return None

    positions_arr = np.array(positions)
    best_group: list[int] | None = None
    best_score = float("inf")

    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            spacing = (positions[j] - positions[i]) / (target_count - 1)
            if spacing < 30:
                continue
            # Generate expected positions
            expected = positions[i] + np.arange(target_count) * spacing
            # For each expected position, find the nearest actual peak
            group = []
            used = set()
            for exp in expected:
                dists = np.abs(positions_arr - exp)
                order = np.argsort(dists)
                for idx in order:
                    if idx not in used and dists[idx] < spacing * 0.3:
                        group.append(positions[idx])
                        used.add(idx)
                        break
                else:
                    break
            if len(group) == target_count:
                gaps = np.diff(group)
                score = float(np.std(gaps))
                if score < best_score:
                    best_score = score
                    best_group = group

            if best_score < 5.0:
                return best_group

    return best_group


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
