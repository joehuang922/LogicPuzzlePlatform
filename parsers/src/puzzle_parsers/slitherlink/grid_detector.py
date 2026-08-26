"""Grid detection for slitherlink puzzles via dot (intersection) detection.

Pipeline:
1. Threshold to binary, find small circular blobs (the intersection dots)
2. Filter by area and circularity to keep only dots
3. Estimate the (isotropic) lattice pitch from nearest-neighbour spacing
4. Connect each dot to its near neighbours (within ~1.35x pitch) and keep the
   largest connected component -- this is the puzzle board, cleanly separated
   from headers, QR codes and neighbouring puzzles (which sit >=2 cells away)
5. Fit an affine lattice to the component (phase-offset RANSAC seed + iterative
   inlier refinement) so page shear/perspective is absorbed
6. Read the board dimensions off the dominant contiguous block of the per-row
   and per-column dot-occupancy histograms (trims stray bleed-in dots)
7. Emit the dot_grid, snapping each node to a real dot where one exists

The magazine source images are full-page photos that contain multiple puzzles,
headers and QR codes. Because the intersection dots form an extremely regular
square lattice and distinct puzzles are separated by blank space, isolating the
largest connected component and fitting a lattice to it is far more robust than
clustering or windowing the whole-page dot cloud.
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
    image: NDArray, debug_dir: str | None = None,
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

    dot_grid = _fit_lattice_grid(dots, pitch, gray.shape)

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


def _largest_component(dots: NDArray, pitch: float, mult: float = 1.35) -> NDArray:
    """Return the dots of the largest neighbour-connected component.

    Two dots are linked when they lie within ``mult * pitch`` of each other.
    A diagonal lattice neighbour is ~1.41x pitch away, so with mult=1.35 only
    the (up to four) orthogonal neighbours link regardless of page rotation --
    no axis assumption is needed. Distinct puzzles are separated by blank space
    (>=2 cells), so each puzzle forms its own component and the board is simply
    the biggest one; page clutter (titles, QR codes, example diagrams) falls
    into smaller components that are discarded.
    """
    from scipy.spatial import cKDTree

    n = len(dots)
    tree = cKDTree(dots)
    pairs = tree.query_pairs(pitch * mult)

    parent = list(range(n))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for a, b in pairs:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    biggest = max(groups.values(), key=len)
    return dots[biggest]


def _fit_affine_lattice(
    dots: NDArray, pitch: float
) -> tuple[NDArray, NDArray, NDArray, NDArray]:
    """Fit an affine map (col, row, 1) -> (x, y) to the dots.

    1. RANSAC over sub-pitch phase offsets (ox, oy) to seed an integer lattice.
    2. Iteratively refine: reassign each dot to its nearest integer node under
       the current map, keep inliers, least-squares refit. Affine (unlike a
       rigid translation) absorbs the shear/scale of a photographed page, so
       wide boards don't drift off the dots near their far edge.

    Returns (cx, cy, node_rows, node_cols) where cx/cy are the affine
    coefficients and node_rows/node_cols are the integer lattice index of each
    input dot.
    """
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
    # A near-collinear inlier set can make lstsq return finite-but-huge
    # coefficients; the finite/det guards below discard such maps, so suppress
    # the transient overflow warnings the intermediate matmuls would raise.
    cx = np.array([pitch, 0.0, ox])
    cy = np.array([0.0, pitch, oy])
    jr = np.zeros((len(dots), 2))
    with np.errstate(over="ignore", invalid="ignore", divide="ignore"):
        for _ in range(10):
            det = cx[0] * cy[1] - cx[1] * cy[0]
            if not np.isfinite(det) or abs(det) < 1e-6:
                break
            inv = np.array([[cy[1], -cx[1]], [-cy[0], cx[0]]]) / det
            b = np.c_[xs - cx[2], ys - cy[2]]
            jr = np.round(b @ inv.T)
            A = np.c_[jr[:, 0], jr[:, 1], np.ones(len(dots))]
            res = np.hypot(A @ cx - xs, A @ cy - ys)
            inl = res < tol
            if int(inl.sum()) < 6:
                break
            cx_new, *_ = np.linalg.lstsq(A[inl], xs[inl], rcond=None)
            cy_new, *_ = np.linalg.lstsq(A[inl], ys[inl], rcond=None)
            if not (np.all(np.isfinite(cx_new)) and np.all(np.isfinite(cy_new))):
                break
            cx, cy = cx_new, cy_new

    return cx, cy, jr[:, 1].astype(int), jr[:, 0].astype(int)


def _dominant_block(idx: NDArray, frac: float = 0.5) -> tuple[int, int]:
    """Find the longest run of well-populated lattice lines.

    ``idx`` holds the integer row (or column) index of each dot. A real board
    line carries ~one dot per cell; a stray bleed-in row from a neighbouring
    puzzle carries only a few. Thresholding the occupancy histogram at
    ``frac * median`` and taking the longest contiguous run isolates the board
    from such partial rows/columns.

    Returns (start_index, length) in lattice-line units (relative to idx.min()).
    """
    base = int(idx.min())
    prof = np.bincount(idx - base)
    populated = prof[prof > 0]
    median = float(np.median(populated)) if len(populated) else 0.0
    thr = max(2.0, frac * median)
    full = prof >= thr

    best = (0, 0, 0)  # (length, lo, hi)
    i, n = 0, len(full)
    while i < n:
        if full[i]:
            j = i
            while j + 1 < n and full[j + 1]:
                j += 1
            if j - i + 1 > best[0]:
                best = (j - i + 1, i, j)
            i = j + 1
        else:
            i += 1

    return best[1], best[0]


def _fit_lattice_grid(
    dots: NDArray, pitch: float, img_shape: tuple[int, ...],
) -> NDArray:
    """Isolate the puzzle board and build its dot_grid.

    Keeps the largest neighbour-connected component (the board), fits an affine
    lattice to it, trims stray bleed-in rows/columns via the occupancy
    histogram, then emits the grid -- snapping each node to its real dot when
    present and falling back to the affine-predicted position otherwise.
    """
    if len(dots) < 10 or pitch <= 0:
        h, w = img_shape[:2]
        return _synthetic_grid(w, h, 11, 11)

    comp = _largest_component(dots, pitch)
    if len(comp) < 10:
        h, w = img_shape[:2]
        return _synthetic_grid(w, h, 11, 11)

    cx, cy, node_rows, node_cols = _fit_affine_lattice(comp, pitch)

    # Trim stray rows/columns and recover the board's node-index window.
    r_base = int(node_rows.min())
    c_base = int(node_cols.min())
    r_off, n_dot_rows = _dominant_block(node_rows)
    c_off, n_dot_cols = _dominant_block(node_cols)

    if n_dot_rows < 2 or n_dot_cols < 2:
        h, w = img_shape[:2]
        return _synthetic_grid(w, h, 11, 11)

    r0 = r_base + r_off
    c0 = c_base + c_off

    # Map (node_row, node_col) -> real dot coordinate for the board window.
    node_to_dot: dict[tuple[int, int], NDArray] = {}
    for k in range(len(comp)):
        node_to_dot[(int(node_rows[k]), int(node_cols[k]))] = comp[k]

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
