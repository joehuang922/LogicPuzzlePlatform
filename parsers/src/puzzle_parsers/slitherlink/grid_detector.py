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

from puzzle_parsers.flatten import _interp_extend


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
    pitch = _estimate_pitch(dots)
    if pitch > 0:
        # Redetect against the local background: dots on a curled page edge
        # (bent away from the camera) print lighter and smaller, and a global
        # Otsu threshold drops whole rows of them.
        local = _detect_dots(gray, pitch=pitch)
        if len(local) >= len(dots):
            dots = local

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

    Keeps the largest neighbour-connected component (the board), numbers its
    dots by walking the lattice (``_walk_lattice``), trims stray bleed-in
    rows/columns via the occupancy histogram, then emits the grid -- each node
    at its real dot when present, otherwise interpolated along its traced dot
    row and column (``_fill_missing``).
    """
    if len(dots) < 10 or pitch <= 0:
        h, w = img_shape[:2]
        return _synthetic_grid(w, h, 11, 11)

    comp = _largest_component(dots, pitch)
    if len(comp) < 10:
        h, w = img_shape[:2]
        return _synthetic_grid(w, h, 11, 11)

    cx, cy, _, _ = _fit_affine_lattice(comp, pitch)
    basis = np.array([[cx[0], cy[0]], [cx[1], cy[1]]])  # col step, row step
    comp, node_rows, node_cols = _walk_lattice(comp, pitch, basis)
    if len(comp) < 10:
        h, w = img_shape[:2]
        return _synthetic_grid(w, h, 11, 11)

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

    grid = np.full((n_dot_rows, n_dot_cols, 2), np.nan)
    rr, cc = node_rows - r0, node_cols - c0
    keep = (rr >= 0) & (rr < n_dot_rows) & (cc >= 0) & (cc < n_dot_cols)
    grid[rr[keep], cc[keep]] = comp[keep]
    return _fill_missing(grid, cx, cy, r0, c0)


# A step to a neighbour must land within this fraction of a lattice step of an
# orthogonal neighbour node to be followed.
_STEP_TOL = 0.3


def _walk_lattice(
    dots: NDArray, pitch: float, basis: NDArray,
) -> tuple[NDArray, NDArray, NDArray]:
    """Number the dots by walking from each dot to its orthogonal neighbours.

    A global affine lattice can't follow a curled page: on a 45x31 board
    photographed with its top corner lifted, the top rows drift off any
    straight lattice, their dots split across several lattice rows, and the
    occupancy trim then drops them. Walking instead measures each step against
    the local lattice vectors carried from the dot it came from, so a row
    keeps one index however much it bends -- the same idea as ``flatten.py``
    tracing a grid line through narrow strips.

    ``basis`` rows are the initial (column step, row step) vectors. Returns the
    dots that were reached with their integer (row, col) indices.
    """
    from collections import deque

    from scipy.spatial import cKDTree

    tree = cKDTree(dots)
    nbrs = tree.query_ball_point(dots, pitch * 1.35)
    centre = np.median(dots, axis=0)
    order = np.argsort(np.hypot(*(dots - centre).T))
    start = next((int(i) for i in order if len(nbrs[i]) >= 5), int(order[0]))

    n = len(dots)
    idx = np.full((n, 2), np.iinfo(np.int64).min, dtype=np.int64)  # (row, col)
    local = np.zeros((n, 2, 2))
    taken: set[tuple[int, int]] = set()
    idx[start] = (0, 0)
    local[start] = basis
    taken.add((0, 0))
    queue = deque([start])
    while queue:
        i = queue.popleft()
        B = local[i]
        try:
            inv = np.linalg.inv(B.T)
        except np.linalg.LinAlgError:
            continue
        for j in nbrs[i]:
            if j == i or idx[j, 0] != np.iinfo(np.int64).min:
                continue
            d = dots[j] - dots[i]
            ab = inv @ d  # (col steps, row steps)
            step = np.round(ab)
            if abs(step).sum() != 1 or np.abs(ab - step).max() > _STEP_TOL:
                continue
            node = (int(idx[i, 0] + step[1]), int(idx[i, 1] + step[0]))
            if node in taken:
                continue
            taken.add(node)
            idx[j] = node
            axis = 0 if step[0] else 1
            nb = B.copy()
            nb[axis] = 0.5 * B[axis] + 0.5 * d * step[axis]
            local[j] = nb
            queue.append(j)

    reached = idx[:, 0] != np.iinfo(np.int64).min
    return dots[reached], idx[reached, 0], idx[reached, 1]


def _fill_missing(
    grid: NDArray, cx: NDArray, cy: NDArray, r0: int, c0: int,
) -> NDArray:
    """Fill nodes with no dot (covered by a digit) from their row and column.

    Each dot row and column is a traced line, as in ``flatten.py``: a missing
    node is interpolated along its row from the row's real dots and along its
    column from the column's, and the two estimates are averaged. A line with
    fewer than two real dots falls back to the affine lattice.
    """
    n_rows, n_cols = grid.shape[:2]
    real = ~np.isnan(grid[:, :, 0])
    along_row = np.full_like(grid, np.nan)
    along_col = np.full_like(grid, np.nan)
    for r in range(n_rows):
        known = np.flatnonzero(real[r])
        if len(known) >= 2:
            c = np.arange(n_cols, dtype=float)
            for k in range(2):
                along_row[r, :, k] = _interp_extend(c, known.astype(float), grid[r, known, k])
    for c in range(n_cols):
        known = np.flatnonzero(real[:, c])
        if len(known) >= 2:
            r = np.arange(n_rows, dtype=float)
            for k in range(2):
                along_col[:, c, k] = _interp_extend(r, known.astype(float), grid[known, c, k])

    out = grid.copy()
    for r in range(n_rows):
        for c in range(n_cols):
            if real[r, c]:
                continue
            ests = [e for e in (along_row[r, c], along_col[r, c]) if not np.isnan(e[0])]
            if ests:
                out[r, c] = np.mean(ests, axis=0)
            else:
                col, row = c0 + c, r0 + r
                out[r, c] = [
                    cx[0] * col + cx[1] * row + cx[2],
                    cy[0] * col + cy[1] * row + cy[2],
                ]
    return out


# Adaptive-threshold offset (gray levels below the local mean) for the second
# dot pass. Every value from 5 to 20 finds all 46x32 dots of a 45x31 photo
# whose curled top rows Otsu loses.
_LOCAL_THRESH_C = 10


def _detect_dots(gray: NDArray, pitch: float | None = None) -> NDArray:
    """Detect dot blobs and return their centers as (N, 2) array of (x, y).

    Strategy: dots are highly circular and cluster tightly around one area value.
    First find all round blobs (circularity > 0.7), compute their median area,
    then keep only those within a tight band around that median.

    Without ``pitch`` the image is thresholded globally (Otsu). With it, each
    pixel is compared to the mean of a pitch-sized window around it, so faint
    dots on a shaded or curled part of the page survive.
    """
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    if pitch is None:
        _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    else:
        block = max(3, int(pitch) | 1)
        binary = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV,
            block, _LOCAL_THRESH_C,
        )

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
