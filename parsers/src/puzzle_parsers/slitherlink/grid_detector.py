"""Grid detection for slitherlink puzzles via dot (intersection) detection.

Pipeline:
1. Threshold to binary, find small circular blobs (the intersection dots)
2. Filter by area and circularity to keep only dots
3. Estimate the (isotropic) lattice pitch from nearest-neighbour spacing
4. RANSAC over sub-pitch phase offsets to snap dots onto an integer lattice
5. Slide an (rows+1) x (cols+1) window over the lattice to isolate the puzzle
   from surrounding page clutter (titles, QR codes, neighbouring puzzles)
6. Emit the dot_grid, snapping each node to a real dot where one exists

The magazine source images are full-page photos that contain multiple puzzles,
headers and QR codes. Because the intersection dots form an extremely regular
square lattice, fitting that lattice and windowing it is far more robust than
clustering the raw dot cloud (which would span the whole page).
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray


@dataclass
class SlitherlinkGeometry:
    image: NDArray
    rows: int
    cols: int
    dot_grid: NDArray  # (rows+1, cols+1, 2) array of dot center coordinates
    cell_h: float
    cell_w: float


def detect_slitherlink_grid(
    image: NDArray, expected_rows: int | None = None, expected_cols: int | None = None,
    debug_dir: str | None = None,
) -> SlitherlinkGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    dots = _detect_dots(gray)

    if debug_path:
        vis = image.copy()
        for (cx, cy) in dots:
            cv2.circle(vis, (int(cx), int(cy)), 5, (0, 0, 255), 2)
        cv2.imwrite(str(debug_path / "01_dots_raw.png"), vis)

    pitch = _estimate_pitch(dots)

    if expected_rows is None or expected_cols is None:
        det_rows, det_cols = _auto_detect_dimensions(dots, pitch)
        if expected_rows is None:
            expected_rows = det_rows
        if expected_cols is None:
            expected_cols = det_cols

    dot_grid = _fit_lattice_grid(
        dots, pitch, expected_rows + 1, expected_cols + 1, gray.shape
    )

    if debug_path:
        vis = image.copy()
        for r in range(dot_grid.shape[0]):
            for c in range(dot_grid.shape[1]):
                cx, cy = dot_grid[r, c]
                cv2.circle(vis, (int(cx), int(cy)), 4, (0, 255, 0), -1)
                cv2.putText(vis, f"{r},{c}", (int(cx) + 5, int(cy) - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.3, (255, 0, 0), 1)
        cv2.imwrite(str(debug_path / "02_dot_grid.png"), vis)

    n_dot_rows = dot_grid.shape[0]
    n_dot_cols = dot_grid.shape[1]
    rows = n_dot_rows - 1
    cols = n_dot_cols - 1

    cell_h = float(np.mean(dot_grid[1:, :, 1] - dot_grid[:-1, :, 1]))
    cell_w = float(np.mean(dot_grid[:, 1:, 0] - dot_grid[:, :-1, 0]))

    return SlitherlinkGeometry(
        image=image,
        rows=rows,
        cols=cols,
        dot_grid=dot_grid,
        cell_h=cell_h,
        cell_w=cell_w,
    )


def _estimate_pitch(dots: NDArray) -> float:
    """Estimate the isotropic lattice pitch from nearest-neighbour spacing.

    The intersection dots form a square lattice, so the median nearest-neighbour
    distance is a robust estimate of the cell pitch even when many dots are
    missing (obscured by digits) or spurious (from titles/QR codes).
    """
    if len(dots) < 4:
        return 0.0
    from scipy.spatial import cKDTree

    tree = cKDTree(dots)
    dist, _ = tree.query(dots, k=2)
    nn = dist[:, 1]
    nn = nn[nn > 1.0]
    if len(nn) == 0:
        return 0.0
    return float(np.median(nn))


def _auto_detect_dimensions(dots: NDArray, pitch: float) -> tuple[int, int]:
    """Infer grid cell dimensions (rows, cols) from detected dots and pitch."""
    if len(dots) < 4 or pitch <= 0:
        return 10, 10
    xs, ys = dots[:, 0], dots[:, 1]
    est_cols = max(2, round((xs.max() - xs.min()) / pitch))
    est_rows = max(2, round((ys.max() - ys.min()) / pitch))
    return est_rows, est_cols


def _fit_lattice_grid(
    dots: NDArray, pitch: float,
    n_dot_rows: int, n_dot_cols: int,
    img_shape: tuple[int, ...],
) -> NDArray:
    """Fit an affine lattice to the dot cloud and window out the puzzle.

    1. RANSAC over sub-pitch phase offsets (ox, oy) to seed an integer lattice.
    2. Iteratively refine an affine map (col, row) -> (x, y): reassign each dot
       to its nearest integer node under the current map, then least-squares
       refit. Affine (unlike a rigid translation) absorbs the shear/scale of a
       photographed page, so wide boards don't drift off the dots near their
       far edge.
    3. Slide an (n_dot_rows x n_dot_cols) window over the occupied nodes and
       pick the position covering the most dots — this isolates the target
       puzzle from other page content.
    4. Build the dot_grid, snapping each node to its real dot when present and
       falling back to the affine-predicted position otherwise.
    """
    if len(dots) == 0 or pitch <= 0:
        h, w = img_shape[:2]
        return _synthetic_grid(w, h, n_dot_rows, n_dot_cols)

    xs, ys = dots[:, 0], dots[:, 1]
    tol = pitch * 0.30

    # --- 1. Seed integer lattice via phase-offset RANSAC ---
    best = None  # (inlier_count, ox, oy)
    steps = 24
    for ox in np.linspace(0, pitch, steps, endpoint=False):
        jx = np.round((xs - ox) / pitch)
        inl_x = np.abs(xs - (ox + jx * pitch)) < tol
        for oy in np.linspace(0, pitch, steps, endpoint=False):
            jy = np.round((ys - oy) / pitch)
            inl = inl_x & (np.abs(ys - (oy + jy * pitch)) < tol)
            cnt = int(inl.sum())
            if best is None or cnt > best[0]:
                best = (cnt, float(ox), float(oy))
    _, ox, oy = best

    # --- 2. Iterative affine refinement ---
    # cx maps (col, row, 1) -> x, cy maps (col, row, 1) -> y
    cx = np.array([pitch, 0.0, ox])
    cy = np.array([0.0, pitch, oy])
    jr = np.zeros((len(dots), 2))
    inl = np.ones(len(dots), dtype=bool)
    for _ in range(8):
        det = cx[0] * cy[1] - cx[1] * cy[0]
        if abs(det) < 1e-6:
            break
        # invert the linear part to recover fractional (col, row) per dot
        inv = np.array([[cy[1], -cx[1]], [-cy[0], cx[0]]]) / det
        b = np.c_[xs - cx[2], ys - cy[2]]
        frac = b @ inv.T
        jr = np.round(frac)
        A = np.c_[jr[:, 0], jr[:, 1], np.ones(len(dots))]
        res = np.hypot(A @ cx - xs, A @ cy - ys)
        inl = res < tol
        if int(inl.sum()) < 6:
            break
        cx, *_ = np.linalg.lstsq(A[inl], xs[inl], rcond=None)
        cy, *_ = np.linalg.lstsq(A[inl], ys[inl], rcond=None)

    A = np.c_[jr[:, 0], jr[:, 1], np.ones(len(dots))]
    res = np.hypot(A @ cx - xs, A @ cy - ys)
    inl = res < tol

    if int(inl.sum()) < n_dot_rows * n_dot_cols * 0.3:
        h, w = img_shape[:2]
        return _synthetic_grid(w, h, n_dot_rows, n_dot_cols)

    jci = jr[inl, 0].astype(int)  # column indices
    jri = jr[inl, 1].astype(int)  # row indices
    dxi = dots[inl]

    # Map (node_row, node_col) -> real dot coordinate
    node_to_dot: dict[tuple[int, int], NDArray] = {}
    for k in range(len(jci)):
        node_to_dot[(int(jri[k]), int(jci[k]))] = dxi[k]

    # --- 3. Slide an (n_dot_rows x n_dot_cols) window to cover the most dots ---
    r_lo, r_hi = int(jri.min()), int(jri.max())
    c_lo, c_hi = int(jci.min()), int(jci.max())
    node_set = set(node_to_dot.keys())

    r0_range = range(r_lo, max(r_lo, r_hi - n_dot_rows + 1) + 1)
    c0_range = range(c_lo, max(c_lo, c_hi - n_dot_cols + 1) + 1)

    best_win = None  # (count, r0, c0)
    for r0 in r0_range:
        for c0 in c0_range:
            count = sum(
                1 for (ny, nx) in node_set
                if r0 <= ny < r0 + n_dot_rows and c0 <= nx < c0 + n_dot_cols
            )
            if best_win is None or count > best_win[0]:
                best_win = (count, r0, c0)

    _, r0, c0 = best_win

    # --- 4. Build the dot grid, snapping to real dots where present ---
    grid = np.zeros((n_dot_rows, n_dot_cols, 2), dtype=np.float64)
    for r in range(n_dot_rows):
        for c in range(n_dot_cols):
            node = (r0 + r, c0 + c)
            if node in node_to_dot:
                grid[r, c] = node_to_dot[node]
            else:
                col, row = c0 + c, r0 + r
                grid[r, c] = [
                    cx[0] * col + cx[1] * row + cx[2],
                    cy[0] * col + cy[1] * row + cy[2],
                ]

    return grid


def _detect_dots(gray: NDArray) -> NDArray:
    """Detect dot blobs and return their centers as (N, 2) array of (x, y).

    Strategy: dots are highly circular and cluster tightly around one area value.
    First find all round blobs (circularity > 0.7), compute their median area,
    then keep only those within a tight band around that median.
    """
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    # First pass: collect all highly circular blobs with their areas
    round_blobs: list[tuple[float, float, float]] = []  # (cx, cy, area)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 5:
            continue
        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue
        circularity = 4 * np.pi * area / (perimeter * perimeter)
        if circularity < 0.7:
            continue
        M = cv2.moments(cnt)
        if M["m00"] == 0:
            continue
        cx = M["m10"] / M["m00"]
        cy = M["m01"] / M["m00"]
        round_blobs.append((cx, cy, area))

    if len(round_blobs) < 10:
        return np.empty((0, 2), dtype=np.float64)

    # Second pass: find the dot-sized cluster via median area of round blobs
    areas = np.array([b[2] for b in round_blobs])
    median_area = float(np.median(areas))

    # Dots cluster tightly — keep blobs within 0.5x to 2x the median
    centers = []
    for cx, cy, area in round_blobs:
        if median_area * 0.5 <= area <= median_area * 2.0:
            centers.append((cx, cy))

    return np.array(centers, dtype=np.float64) if centers else np.empty((0, 2), dtype=np.float64)


def _synthetic_grid(
    width: int, height: int, n_rows: int, n_cols: int
) -> NDArray:
    """Generate a uniform synthetic grid as fallback."""
    margin_x = width * 0.05
    margin_y = height * 0.05
    xs = np.linspace(margin_x, width - margin_x, n_cols)
    ys = np.linspace(margin_y, height - margin_y, n_rows)
    grid = np.zeros((n_rows, n_cols, 2), dtype=np.float64)
    for r in range(n_rows):
        for c in range(n_cols):
            grid[r, c] = [xs[c], ys[r]]
    return grid
