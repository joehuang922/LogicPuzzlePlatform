"""Grid detection for masyu puzzles using shared grid_utils.

Pipeline:
1. Find quadrilateral border and warp to rectangle.
2. Normalise the warped board to a canonical cell size. The downstream line
   detection has pixel-absolute parameters (morphology kernels, gap filters)
   that were tuned at one resolution; feeding boards at other densities -- a
   phone photo the Android client downscaled to 2000px, or a magazine's
   tightly-packed giant board printed at ~25px/cell -- drops it out of that band
   and collapses rows. We estimate the cell pitch (robust even when line
   detection is noisy: a median of inter-line gaps survives garbage that would
   wreck a line *count*) and rescale so the pitch lands at a fixed target, so
   10x10, 17x17 and 45x31 boards all enter detection at the same cell scale.
3. Extract the full-span grid lines with a long directional opening. Masyu's
   dense circle-clues are heavy solid ink that dominate a raw ink projection and
   defeat count-by-projection; a morphological opening keeps only ink that runs
   most of the board's width/height, isolating the faint dashed grid lines from
   the clues.
4. Cluster the line positions per axis, estimate a shared (square-cell) pitch,
   and take the longest run of lines spaced ~one pitch apart. The run trims any
   neighbouring puzzle's title band that the border grabbed above the board
   (multi-puzzle magazine pages have no blank gutter between a board and the
   next puzzle's number box).
5. Emit a uniform grid over that run's extent.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import (
    _cluster_positions,
    _median_single_spacing,
    find_quadrilateral_border,
    warp_to_rectangle,
)


@dataclass
class MasyuGeometry:
    warped: NDArray
    warped_gray: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


# Cell size the line detection is tuned for; a warped board is rescaled so its
# estimated pitch lands here. Chosen at the low end of the proven-good band
# (~145-250px/cell across the sample boards) so full-res scans mostly downscale
# and downscaled phone photos only upscale ~1.4-2x, never wildly.
_TARGET_CELL_PITCH = 180.0
# Below this measured pitch the dashes blur into sub-cell noise and the estimate
# is no longer trustworthy; leave such boards at native scale rather than
# amplifying a bad number. (Genuine scans resolve well above this.)
_MIN_RELIABLE_PITCH = 20.0
# Cap the upscale so a mis-estimated tiny pitch can't blow the board up to a
# memory-eating size; 4x covers the real low-res cases (e.g. a 2000px phone
# photo of a 17x17).
_MAX_UPSCALE = 4.0


def _estimate_cell_pitch(warped_gray: NDArray, warp_w: int, warp_h: int) -> float:
    """Estimate the grid's cell pitch (px) robustly, before line detection.

    Line *counting* is fragile on off-scale boards, but the *pitch* is not: it is
    the median gap between detected lines, and a median shrugs off the spurious
    and merged lines that wreck a count. We gather inter-line gaps on both axes,
    then iteratively refine the median within a [0.62, 1.4]x window so that
    double-gaps (a missed line) and sub-cell noise don't drag it. Returns 0 when
    too few lines are found to say anything.
    """
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )
    gaps: list[float] = []
    for axis, span in ((0, warp_h), (1, warp_w)):
        raw = _line_positions(binary, axis, warp_w, warp_h)
        if len(raw) < 2:
            continue
        clustered = _cluster_positions(raw, min_gap=max(4.0, span * 0.012))
        gaps.extend(np.diff(clustered).tolist())

    g = np.array([x for x in gaps if x > 2.0], dtype=float)
    if len(g) < 2:
        return 0.0

    pitch = float(np.median(g))
    for _ in range(6):  # refine: reject harmonics and sub-cell noise, re-median
        window = g[(g > pitch * 0.62) & (g < pitch * 1.4)]
        if len(window) < 2:
            break
        updated = float(np.median(window))
        if abs(updated - pitch) <= 0.5:
            pitch = updated
            break
        pitch = updated
    return pitch


def _normalize_cell_scale(
    warped: NDArray, warp_w: int, warp_h: int
) -> tuple[NDArray, int, int, float | None]:
    """Rescale the warped board so its cell pitch matches ``_TARGET_CELL_PITCH``.

    Returns the (possibly unchanged) image, its new dimensions, and the cell
    pitch at the returned scale -- ``None`` when the pitch couldn't be trusted.
    A no-op when the pitch can't be estimated, is already in-band, or is too
    coarse to trust.
    """
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    pitch = _estimate_cell_pitch(warped_gray, warp_w, warp_h)
    if pitch < _MIN_RELIABLE_PITCH:
        return warped, warp_w, warp_h, None

    scale = _TARGET_CELL_PITCH / pitch
    if 0.9 <= scale <= 1.1:  # already the right density; don't resample for nothing
        return warped, warp_w, warp_h, pitch
    scale = min(scale, _MAX_UPSCALE)

    new_w = max(1, int(round(warp_w * scale)))
    new_h = max(1, int(round(warp_h * scale)))
    interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
    resized = cv2.resize(warped, (new_w, new_h), interpolation=interp)
    return resized, new_w, new_h, pitch * scale


def detect_masyu_grid(
    image: NDArray,
    debug_dir: str | None = None,
) -> MasyuGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Step 1: Find border and warp
    border_pts = find_quadrilateral_border(gray)
    warped, warp_w, warp_h = warp_to_rectangle(image, border_pts)

    # Step 2: Normalise to a canonical cell size so the pixel-absolute line
    # detection below always runs at the density it was tuned for.
    raw_w, raw_h = warp_w, warp_h
    warped, warp_w, warp_h, est_pitch = _normalize_cell_scale(warped, warp_w, warp_h)

    # A photo of a curved page (a thick magazine near its spine) bows the grid,
    # which a four-corner warp can't straighten. Flatten it on a mesh of the
    # detected lines instead; flat boards return None and take the path below.
    flat = None
    if est_pitch:
        flat = _flatten_curved_board(
            image, border_pts, (raw_w, raw_h), warp_w / raw_w, est_pitch,
            debug_path=debug_path,
        )
    if flat is not None:
        warped, h_lines, v_lines = flat
        warp_h, warp_w = warped.shape[:2]
        warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
        if debug_path:
            cv2.imwrite(str(debug_path / "01_warped.png"), warped)
    else:
        warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

        if debug_path:
            cv2.imwrite(str(debug_path / "01_warped.png"), warped)

        # Step 3-5: Detect the grid lines from the full-span dashed lines only.
        h_lines, v_lines = _detect_grid_lines(
            warped_gray, warp_w, warp_h, est_pitch=est_pitch
        )

    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 0, 255), 2)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (255, 0, 0), 2)
        cv2.imwrite(str(debug_path / "03_grid_lines.png"), vis)

    rows = len(h_lines) - 1
    cols = len(v_lines) - 1

    cell_h = (h_lines[-1] - h_lines[0]) / rows if rows > 0 else 50.0
    cell_w = (v_lines[-1] - v_lines[0]) / cols if cols > 0 else 50.0

    return MasyuGeometry(
        warped=warped,
        warped_gray=warped_gray,
        rows=rows,
        cols=cols,
        h_lines=h_lines,
        v_lines=v_lines,
        cell_h=cell_h,
        cell_w=cell_w,
    )


def _line_positions(binary: NDArray, axis: int, warp_w: int, warp_h: int) -> list[float]:
    """Return the centre positions of full-span grid lines along one axis.

    ``axis=0`` finds horizontal lines (projected onto the y-axis), ``axis=1``
    vertical lines. A morphological close bridges the dashes into continuous
    lines, then a long directional opening (kernel ~1/8 of the board span) keeps
    only ink that spans most of the board -- discarding the circle clues, which
    are at most ~0.4 cell wide.
    """
    if axis == 0:
        close_k = cv2.getStructuringElement(cv2.MORPH_RECT, (41, 1))
        open_k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(10, warp_w // 8), 1))
        proj_axis = 1
    else:
        close_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 41))
        open_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(10, warp_h // 8)))
        proj_axis = 0

    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, close_k)
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, open_k)
    proj = (opened > 0).sum(axis=proj_axis).astype(float)
    if proj.max() <= 0:
        return []

    prof = proj / proj.max()
    on = prof > 0.22
    lines: list[float] = []
    i, n = 0, len(on)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]:
                j += 1
            lines.append((i + j) / 2)
            i = j
        else:
            i += 1
    return lines


def _dominant_extent(
    clusters: list[float],
    pitch: float,
    tol: float = 0.2,
    max_bridge: int = 3,
    min_run: int = 3,
) -> tuple[float, float]:
    """Return (lo, hi) of the longest run of clusters on the one-pitch grid.

    A neighbouring puzzle's title band, grabbed above the board by the border
    detector, sits an off-grid gap away from the board's first line, so it falls
    outside the run and is trimmed. But on a dense board the opened mask does
    occasionally drop an interior line, leaving a gap of ~2x (or 3x) the pitch;
    that is still *on* the grid and must not split the run, or the larger
    fragment wins and the rest of the board is thrown away. So a gap continues
    the run when it is within ``tol`` of any integer multiple of the pitch (up
    to ``max_bridge`` -- bridging the missing lines).

    After the run is chosen, an *outermost* cluster sitting a sub-pitch gap
    beyond it is re-attached: on a perspective warp the board's far edge row is
    foreshortened to less than a cell, so its border line lands <1 pitch from
    the first interior line. That is the real edge, not a title band (those are
    always a *larger*-than-cell gap away), and dropping it costs a whole row.
    """
    pos = np.array(clusters, dtype=float)
    gaps = np.diff(pos)
    runs: list[list[int]] = [[0]]
    for k, gap in enumerate(gaps):
        mult = round(gap / pitch)
        on_grid = 1 <= mult <= max_bridge and abs(gap - mult * pitch) <= tol * pitch
        if on_grid:
            runs[-1].append(k + 1)
        else:
            runs.append([k + 1])

    # A photo of a curved page bows the grid lines, so a line's projected
    # centre can land a quarter cell off and leave one uneven gap (e.g. 1.25 +
    # 0.76 pitches) in the middle of the board. That splits the board into two
    # long runs (two such gaps can sit only a couple of lines apart). A title
    # band is different: one or two stray lines at the *edge*. So join runs
    # across an uneven gap about a cell to a few cells wide, except that a
    # first or last run shorter than ``min_run`` lines stays separate.
    last = len(runs) - 1
    merged: list[list[int]] = [runs[0]]
    for i, run in enumerate(runs[1:], start=1):
        prev = merged[-1]
        gap = pos[run[0]] - pos[prev[-1]]
        edge_stray = (prev is runs[0] and len(prev) < min_run) or (
            i == last and len(run) < min_run
        )
        if not edge_stray and 0.5 * pitch <= gap <= (max_bridge + 0.5) * pitch:
            prev.extend(run)
        else:
            merged.append(run)
    runs = merged

    best = max(runs, key=lambda r: pos[r[-1]] - pos[r[0]])
    lo, hi = best[0], best[-1]
    while lo > 0 and (pos[lo] - pos[lo - 1]) < pitch * (1 - tol):
        lo -= 1
    while hi < len(pos) - 1 and (pos[hi + 1] - pos[hi]) < pitch * (1 - tol):
        hi += 1
    return float(pos[lo]), float(pos[hi])


def _detect_grid_lines(
    warped_gray: NDArray,
    warp_w: int,
    warp_h: int,
    est_pitch: float | None = None,
) -> tuple[list[int], list[int]]:
    """Detect uniform grid lines from the faint dashed lines of a masyu board.

    Extracts full-span lines per axis, clusters them, derives one shared pitch
    (the board is square-celled, so both axes share it), trims to the dominant
    run, and emits a uniform grid over that extent.
    """
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )

    h_raw = _line_positions(binary, 0, warp_w, warp_h)
    v_raw = _line_positions(binary, 1, warp_w, warp_h)
    if len(h_raw) < 2 or len(v_raw) < 2:
        return _fallback_grid(warp_w, warp_h)

    # Rough pitch from the larger inter-line gaps sets the clustering distance;
    # the true (square-cell) pitch is the smaller of the two axes' spacings.
    combined = np.diff(sorted(h_raw + v_raw))
    combined = combined[combined > 20]
    pitch0 = float(np.median(combined)) if len(combined) else 50.0

    # A bowed line (photo of a curved page) projects as a main peak plus
    # fragments 0.2-0.3 cell away. Those fragments also drag ``pitch0`` far
    # below the real pitch, so a distance based on it leaves them as separate
    # "lines". When the pre-scale estimate is trustworthy, merge anything
    # within half a cell instead: real lines are a whole cell apart.
    merge_gap = est_pitch * 0.5 if est_pitch else pitch0 * 0.4
    h_cl = _cluster_positions(h_raw, min_gap=merge_gap)
    v_cl = _cluster_positions(v_raw, min_gap=merge_gap)
    if len(h_cl) < 2 or len(v_cl) < 2:
        return _fallback_grid(warp_w, warp_h)

    spacings = [s for s in (_median_single_spacing(h_cl), _median_single_spacing(v_cl)) if s > 0]
    if not spacings:
        return _fallback_grid(warp_w, warp_h)
    pitch = float(np.median(spacings))

    top, bot = _dominant_extent(h_cl, pitch)
    left, right = _dominant_extent(v_cl, pitch)

    rows = max(1, round((bot - top) / pitch))
    cols = max(1, round((right - left) / pitch))

    h_lines = [int(round(top + i * (bot - top) / rows)) for i in range(rows + 1)]
    v_lines = [int(round(left + j * (right - left) / cols)) for j in range(cols + 1)]
    return h_lines, v_lines


def _fallback_grid(warp_w: int, warp_h: int) -> tuple[list[int], list[int]]:
    """Uniform 10x10 grid spanning the warp when line detection fails."""
    n = 10
    h_lines = [int(round(i * warp_h / n)) for i in range(n + 1)]
    v_lines = [int(round(j * warp_w / n)) for j in range(n + 1)]
    return h_lines, v_lines


# --- Curved-page boards -------------------------------------------------------
#
# A phone photo of a thick magazine bows the page near the spine. The grid
# lines curve, so a four-corner warp leaves them bent: one line projected
# across the whole board smears into several peaks, cells drift a quarter cell
# off the evenly spaced grid, and the straight border quad cuts through the
# bowed edge rows. Instead we trace each line through narrow strips (a bowed
# line is nearly straight across ~8 cells), then remap the image so every
# traced line becomes straight and evenly spaced. Circle reading downstream
# then sees an ordinary flat board.

# Margin, in cells, kept around the border quad so a bowed edge row isn't cut.
_CURVE_MARGIN_CELLS = 0.75
# Strips are about this many cells long along the line direction.
_STRIP_CELLS = 8
# Fraction of strips a traced line must appear in to count as a grid line.
_MIN_LINE_SUPPORT = 0.75
# Length, in cells, of the extra strip at each end of the lines.
_EDGE_STRIP_CELLS = 2
# Below this misfit (traced lines vs. an even straight grid, in cells) a board
# is flat enough for the plain path.
_MIN_MISFIT_CELLS = 0.12
# Cell size of the flattened output image.
_FLAT_CELL_PX = 64


def _flatten_curved_board(
    image: NDArray,
    border_pts: NDArray,
    raw_size: tuple[int, int],
    scale: float,
    pitch: float,
    debug_path: Path | None = None,
) -> tuple[NDArray, list[int], list[int]] | None:
    """Flatten a bowed board on a mesh of traced grid lines.

    ``raw_size`` is the plain four-corner warp's size, ``scale`` the factor that
    brought it to ``pitch`` px per cell. Returns ``(flat_image, h_lines,
    v_lines)`` with evenly spaced lines, or ``None`` when the board is flat
    (or the lines can't be traced) so the caller keeps the plain path.
    """
    raw_w, raw_h = raw_size
    dst = np.float32([[0, 0], [raw_w, 0], [raw_w, raw_h], [0, raw_h]])
    M = cv2.getPerspectiveTransform(np.float32(border_pts), dst)
    m = _CURVE_MARGIN_CELLS * pitch
    A = np.array([[scale, 0, m], [0, scale, m], [0, 0, 1]], dtype=np.float64) @ M
    W = int(round(raw_w * scale + 2 * m))
    H = int(round(raw_h * scale + 2 * m))
    big = cv2.warpPerspective(
        image, A, (W, H), borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255)
    )
    gray = cv2.cvtColor(big, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )

    # The pre-scale pitch estimate can be well off (25% on a dense scan), and
    # every threshold below is in cells. Trace, re-measure the pitch from the
    # traced lines' spacing, and trace again if the estimate was off.
    for _ in range(2):
        lines = binary.copy()
        _erase_circles(lines, pitch)
        h_traced = _trace_lines(lines, 0, pitch)  # horizontal lines, y per x-strip
        v_traced = _trace_lines(lines, 1, pitch)  # vertical lines, x per y-strip
        if h_traced is None or v_traced is None:
            return None
        h_tracks, xc = h_traced
        v_tracks, yc = v_traced
        gaps = np.concatenate([
            np.diff(h_tracks.mean(axis=1)), np.diff(v_tracks.mean(axis=1))
        ])
        measured = float(np.median(gaps))
        if abs(measured - pitch) <= 0.1 * pitch:
            break
        pitch = measured

    # Trim stray lines beyond the board (a neighbouring title band) exactly as
    # the plain path does, on each track's mean position.
    h_tracks = _trim_tracks(h_tracks, pitch)
    v_tracks = _trim_tracks(v_tracks, pitch)
    rows, cols = len(h_tracks) - 1, len(v_tracks) - 1
    if rows < 2 or cols < 2:
        return None

    misfit = max(_misfit(h_tracks), _misfit(v_tracks))
    print(f"  [masyu] traced lines sit {misfit / pitch:.2f} cells off an even grid")
    if misfit < _MIN_MISFIT_CELLS * pitch:
        return None

    if debug_path:
        vis = big.copy()
        for t in h_tracks:
            pts = np.int32(np.stack([xc, t], axis=1))
            cv2.polylines(vis, [pts], False, (0, 0, 255), 4)
        for t in v_tracks:
            pts = np.int32(np.stack([t, yc], axis=1))
            cv2.polylines(vis, [pts], False, (255, 0, 0), 4)
        cv2.imwrite(str(debug_path / "02_mesh.png"), vis)

    flat = _remap_to_grid(big, h_tracks, xc, v_tracks, yc, _FLAT_CELL_PX)
    p = _FLAT_CELL_PX
    return flat, [i * p for i in range(rows + 1)], [j * p for j in range(cols + 1)]


def _erase_circles(binary: NDArray, pitch: float) -> None:
    """Blank every circle-sized ink blob from ``binary`` in place.

    Line tracing keeps ink that runs ~1.2 cells along a line. Circles stacked
    in neighbouring cells sit close enough to bridge into such a run and pose
    as a grid line, so remove them first: a clue circle is one blob about a
    cell across (a ring may pick up a touching dash), while dashes are far
    smaller and the border and text are a different shape.
    """
    _, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    w, h = stats[:, cv2.CC_STAT_WIDTH], stats[:, cv2.CC_STAT_HEIGHT]
    lo, hi = 0.45 * pitch, 1.2 * pitch
    circle = (w >= lo) & (w <= hi) & (h >= lo) & (h <= hi)
    circle[0] = False  # background
    binary[circle[labels]] = 0


def _strip_positions(prof: NDArray, pitch: float) -> list[float]:
    """Line positions in one strip's normalised profile.

    Each on-run of the profile is a candidate; runs closer than half a cell
    are one line, placed at its *strongest* run (most ink). The margin around
    the board can bring in a faint edge just beside the border -- a scanner's
    spine shadow -- and averaging the two would put the border a quarter cell
    off, enough for the extent trim to drop it.
    """
    on = prof > 0.3
    runs: list[tuple[float, float]] = []  # (centre, ink mass)
    i, n = 0, len(on)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]:
                j += 1
            runs.append(((i + j) / 2, float(prof[i:j].sum())))
            i = j
        else:
            i += 1
    lines: list[float] = []
    group: list[tuple[float, float]] = []
    for r in runs:
        if group and r[0] - group[-1][0] >= pitch * 0.5:
            lines.append(max(group, key=lambda g: g[1])[0])
            group = []
        group.append(r)
    if group:
        lines.append(max(group, key=lambda g: g[1])[0])
    return lines


def _trace_lines(
    binary: NDArray, axis: int, pitch: float
) -> tuple[NDArray, NDArray] | None:
    """Trace the grid lines of one axis through strips.

    ``axis=0`` traces horizontal lines: the image is cut into vertical strips
    and each line's y is found per strip. ``axis=1`` traces vertical lines.
    Returns ``(tracks, centres)``: ``tracks[k, s]`` is line k's position in
    strip s, ``centres[s]`` the strip's centre along the line direction.
    """
    H, W = binary.shape
    # Keep only ink that runs along the line direction for longer than a clue
    # circle (~0.7 cell). Lines are thickened across first so a line that
    # curls near a corner (rising ~0.2 cell over two cells) still holds a
    # straight run that long; a longer run requirement erases those corners.
    run = int(1.2 * pitch)
    thick = 9
    if axis == 0:
        thick_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, thick))
        close_k = cv2.getStructuringElement(cv2.MORPH_RECT, (41, 1))
        open_k = cv2.getStructuringElement(cv2.MORPH_RECT, (run, 1))
        along = W
    else:
        thick_k = cv2.getStructuringElement(cv2.MORPH_RECT, (thick, 1))
        close_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 41))
        open_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, run))
        along = H
    mask = cv2.dilate(binary, thick_k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, close_k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, open_k) > 0

    # Regular strips ~8 cells long, plus a narrow strip at each end: the page
    # curls most at its corners, and a regular strip's centre sits ~4 cells in,
    # too far to follow the border there.
    n_reg = max(3, int(round(along / (_STRIP_CELLS * pitch))))
    edge = int(round(_EDGE_STRIP_CELLS * pitch))
    spans = [(0, edge)]
    spans += [
        (int(round(s * along / n_reg)), int(round((s + 1) * along / n_reg)))
        for s in range(n_reg)
    ]
    spans += [(along - edge, along)]
    n = len(spans)
    centres = np.array([(a + z) / 2 for a, z in spans])
    strips: list[list[float]] = []
    for a, z in spans:
        proj = mask[:, a:z].sum(axis=1) if axis == 0 else mask[a:z, :].sum(axis=0)
        proj = proj.astype(float)
        if proj.max() <= 0:
            strips.append([])
            continue
        strips.append(_strip_positions(proj / proj.max(), pitch))

    # Follow lines outward from the middle strip: a line moves well under half
    # a cell between neighbouring strips, so the nearest position continues it.
    ref = n // 2
    tracks: list[list[float]] = [[np.nan] * n for _ in strips[ref]]
    for k, p in enumerate(strips[ref]):
        tracks[k][ref] = p
    for order in (range(ref + 1, n), range(ref - 1, -1, -1)):
        step = 1 if order.step > 0 else -1
        for s in order:
            last = []
            for t in tracks:
                prev = [t[q] for q in range(s - step, -1 if step > 0 else n, -step)
                        if not np.isnan(t[q])]
                last.append(prev[0] if prev else np.nan)
            taken: set[int] = set()
            for p in strips[s]:
                best, best_d = -1, pitch * 0.35
                for k, lp in enumerate(last):
                    if k in taken or np.isnan(lp):
                        continue
                    d = abs(p - lp)
                    if d < best_d:
                        best, best_d = k, d
                if best >= 0:
                    tracks[best][s] = p
                    taken.add(best)
                else:
                    new = [np.nan] * n
                    new[s] = p
                    tracks.append(new)
                    last.append(np.nan)

    # A grid line crosses the whole board; a line of text in the margin (a
    # neighbouring title or caption) passes the run filter but covers only part
    # of it. Keep lines seen in most strips; fill the gaps by interpolating
    # along the line (constant past its ends).
    arr = np.array(tracks, dtype=float)
    support = (~np.isnan(arr)).sum(axis=1)
    arr = arr[support >= max(2, int(np.ceil(_MIN_LINE_SUPPORT * n)))]
    if len(arr) < 3:
        return None
    s_idx = np.arange(n)
    for k in range(len(arr)):
        known = ~np.isnan(arr[k])
        arr[k] = np.interp(s_idx, s_idx[known], arr[k][known])
    arr = arr[np.argsort(arr.mean(axis=1))]

    # Insert lines missed in every strip (a gap of ~2-3 cells) by interpolation.
    out = [arr[0]]
    for t in arr[1:]:
        gap = float(np.mean(t - out[-1]))
        k = int(round(gap / pitch))
        if 2 <= k <= 3 and abs(gap - k * pitch) <= 0.25 * pitch:
            for q in range(1, k):
                out.append(out[-1] + (t - out[-1]) * (1 / (k - q + 1)))
        if gap >= 0.5 * pitch:
            out.append(t)
    return np.array(out), centres


def _misfit(tracks: NDArray) -> float:
    """How far traced lines sit from an evenly spaced straight grid (px).

    The plain path assumes every line is straight, axis-aligned and evenly
    spaced between the outer two. This measures the 90th percentile of each
    traced point's distance from that assumption -- bow, slant and uneven
    spacing all count, since any of them shifts cells off where the plain path
    would sample.
    """
    first, last = tracks[0].mean(), tracks[-1].mean()
    n = len(tracks) - 1
    ideal = first + np.arange(n + 1)[:, None] * (last - first) / n
    return float(np.percentile(np.abs(tracks - ideal), 90))


def _trim_tracks(tracks: NDArray, pitch: float) -> NDArray:
    means = tracks.mean(axis=1)
    lo, hi = _dominant_extent(list(means), pitch)
    keep = (means >= lo - 1e-6) & (means <= hi + 1e-6)
    return tracks[keep]


def _interp_extend(x: NDArray, xp: NDArray, fp: NDArray) -> NDArray:
    """``np.interp`` that continues the end segments past ``xp``'s range.

    Strip centres sit half a strip (~4 cells) in from the board edges; holding
    a line flat beyond them lets a bowed border drift into the corner cells.
    """
    y = np.interp(x, xp, fp)
    lo, hi = x < xp[0], x > xp[-1]
    y[lo] = fp[0] + (x[lo] - xp[0]) * (fp[1] - fp[0]) / (xp[1] - xp[0])
    y[hi] = fp[-1] + (x[hi] - xp[-1]) * (fp[-1] - fp[-2]) / (xp[-1] - xp[-2])
    return y


def _remap_to_grid(
    img: NDArray,
    h_tracks: NDArray,
    xc: NDArray,
    v_tracks: NDArray,
    yc: NDArray,
    cell_px: int,
) -> NDArray:
    """Remap ``img`` so the traced lines land on an even ``cell_px`` grid.

    A target point at fractional line indices (u, v) maps to the source point
    between the neighbouring traced lines. Each horizontal line's y depends on
    x and each vertical line's x on y; the lines are near-straight, so one
    pass (y from the mean vertical-line x, then x from that y) is enough.
    """
    rows, cols = len(h_tracks) - 1, len(v_tracks) - 1
    Ht, Wt = rows * cell_px, cols * cell_px

    def split(n_px: int, n_cells: int) -> tuple[NDArray, NDArray]:
        u = (np.arange(n_px) + 0.5) / cell_px
        i0 = np.clip(np.floor(u).astype(int), 0, n_cells - 1)
        return i0, u - i0

    j0, fv = split(Wt, cols)
    i0, fu = split(Ht, rows)

    v_mean = v_tracks.mean(axis=1)
    x_approx = (1 - fv) * v_mean[j0] + fv * v_mean[j0 + 1]
    h_at = np.stack([_interp_extend(x_approx, xc, t) for t in h_tracks])  # (rows+1, Wt)
    y_src = (1 - fu)[:, None] * h_at[i0] + fu[:, None] * h_at[i0 + 1]

    x_src = np.empty_like(y_src)
    for c in range(Wt):
        ys = y_src[:, c]
        a = _interp_extend(ys, yc, v_tracks[j0[c]])
        b = _interp_extend(ys, yc, v_tracks[j0[c] + 1])
        x_src[:, c] = (1 - fv[c]) * a + fv[c] * b

    return cv2.remap(
        img, x_src.astype(np.float32), y_src.astype(np.float32),
        interpolation=cv2.INTER_AREA if cell_px < 100 else cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255),
    )
