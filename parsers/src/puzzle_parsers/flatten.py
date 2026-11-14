"""Flatten a board photographed on a curved page.

A phone photo of a thick magazine bows the page near the spine, and a big scan
can lean or bow a little too. A four-corner warp removes perspective but not a
bend: grid lines stay curved, so one line projected across the board smears
into several peaks, cells drift up to a quarter cell off any straight grid, and
the straight border quad cuts through a bowed edge row. ``flatten_board``
traces every grid line through narrow strips (a bowed line is nearly straight
across a few cells) and remaps the board so each traced line becomes straight
and evenly spaced. A flat board comes back unchanged.

``rectify_board`` calls it on every board, so every parser that finds its
board with ``rectify_board`` gets a curved page straightened:

    board = rectify_board(image)          # four-corner warp, then flatten_board
    h_lines, v_lines = find_grid_lines(gray(board.warped))

Tracing reads only line-like ink, so it copes with dashed or solid rulings,
clue circles, digits and black cells. It counts lines on its own, so it checks
its trace before using it: the outer lines must reach the border quad that
``rectify_board`` found and every gap must be about a cell (``_fits_border``).
A board that fails that check (a title band inside the border, halftone
shading, a heavy frame) comes back as the plain four-corner warp.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import TARGET_CELL_PX, RectifiedBoard, estimate_cell_pitch

# Tracing runs at exactly this many px per cell, so every size below is fixed.
_WORK_PX = TARGET_CELL_PX
# Margin, in cells, kept around the border quad so a bowed edge row isn't cut.
_MARGIN_CELLS = 0.75
# Strips are about this many cells long along the line direction, plus a
# narrower strip at each end: the page curls most at its corners, and a
# regular strip's centre sits ~4 cells in, too far to follow the border there.
_STRIP_CELLS = 8
_EDGE_STRIP_CELLS = 2
# Fraction of strips a traced line must appear in to count as a grid line. A
# line of text beside the board covers only part of it; a border line merged
# with a black-cell column or a page edge can drop out of a strip or two.
_MIN_LINE_SUPPORT = 0.5
# Below this misfit (traced lines vs. an even straight grid, in cells) a board
# is left as it is. At 0.10 cell (masyu's 45x31 scan) the straight grid
# already let a black circle's rim poke into the cell above.
_MIN_MISFIT_CELLS = 0.05
# A traced outer line this far (in cells) outside the border quad at both of
# the board's corners is not the border (see _drop_outside).
_OUTSIDE_CELLS = 0.35
# A trace is kept only if its outer lines lie this close (in cells) to the
# border quad and every gap is within this range of a cell (see _fits_border).
_BORDER_FIT_CELLS = 0.5
_GAP_RANGE = (0.6, 1.45)
# A gap within this many cells of 2 or 3 cells is a line (or two) the trace
# missed, and is filled in. The outermost gap gets the looser tolerance when
# the two gaps inside it are clean single cells: a curled page edge
# foreshortens its edge cells. On a big kakuro photo the line between the
# all-shaded first column and the next barely thresholds, and border-to-second
# line measured 1.64 cells, so the trace failed _fits_border. An edge gap next
# to an unreliable stretch of trace (a 17x17 hitori photo: 3.17, 0.86, 1.71)
# stays at the strict tolerance. Both are under 0.5, so never a 1.5.
_MISSED_GAP_TOL = 0.25
_MISSED_EDGE_GAP_TOL = 0.4
# A weaker run of a line's group (see _strip_positions) takes over from the
# strongest only with at least this fraction of its ink. On the curled edge of
# a big kakuro photo a stray run with 0.1 of the border's ink took the border's
# place, because the faint line next to the border was missing from the strip.
_MIN_ALT_RUN_INK = 0.25
# Ink thicker than this across the line direction is a black cell or a filled
# disc, not a ruling; only its rim (which sits on the cell's lines) is kept.
_THIN_CELLS = 0.2
# Adaptive-threshold offsets (grey levels below the local mean) to trace at,
# in order. 3 keeps faint rulings (a big kakuro photo's line beside an
# all-black column). A halftone grey shade (a printed dot screen, the 50x64
# double choco scan) survives 3 as speckle that bridges into fat bands along
# the line mask, so mid-board lines drift or drop and the trace fails
# _fits_border; 8 drops the dots but keeps the dashed rulings. The second
# offset is tried only when the first trace fails, so a board that traces at
# 3 is unchanged.
_BINARY_OFFSETS = (3, 8)
# A page bends neighbouring lines together, so a traced point that strays
# more than this (in cells) from its neighbours' bend is a slip: ink between
# two lines (a digit, leftover shading) pulled the trace. On the 50x64 double
# choco scan two lines pinched 0.22 cell toward each other at one strip, and
# the remap bent a line into the cells beside it, read as a column of "1"s.
# Clean traces agree with their neighbours to ~0.06 cell. The neighbours are
# the _BEND_NEIGHBOURS lines on each side.
_BEND_OUTLIER_CELLS = 0.15
_BEND_NEIGHBOURS = 3


def flatten_board(
    image: NDArray,
    board: RectifiedBoard,
    *,
    line_image: NDArray | None = None,
    debug_dir: str | Path | None = None,
) -> RectifiedBoard:
    """Return ``board`` remapped so its grid lines are straight and even.

    ``image`` is the source photo ``board`` was found in. ``line_image`` is a
    grayscale image, same size as ``image``, to trace the lines in instead
    (picto link traces an ink mask of its coloured rulings). Returns ``board``
    itself when it is already flat or its lines can't be traced.
    """
    gray = board.warped if board.warped.ndim == 2 else cv2.cvtColor(board.warped, cv2.COLOR_BGR2GRAY)
    pitch0 = estimate_cell_pitch(gray)
    if not pitch0:
        return board
    nh, nw = board.native.shape[:2]
    to_work = (board.warped.shape[1] / nw) * (_WORK_PX / pitch0)  # native px -> work px
    to_rect = cv2.getPerspectiveTransform(
        np.float32(board.quad), np.float32([[0, 0], [nw, 0], [nw, nh], [0, nh]])
    )
    margin = _MARGIN_CELLS * _WORK_PX
    src = line_image if line_image is not None else image
    work = _warp_with_margin(src, to_rect, to_work, margin, (nw, nh))
    if work.ndim == 3:
        work = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    h_edges = (margin, margin + nh * to_work)
    v_edges = (margin, margin + nw * to_work)
    for offset in _BINARY_OFFSETS:
        traced = _trace_grid(work, offset, h_edges, v_edges)
        if traced is not None:
            break
    else:
        return board
    h_tracks, xc, v_tracks, yc, pitch = traced
    h_tracks = _fix_bend_outliers(h_tracks, pitch)
    v_tracks = _fix_bend_outliers(v_tracks, pitch)
    if max(_misfit(h_tracks), _misfit(v_tracks)) < _MIN_MISFIT_CELLS * pitch:
        return board

    if debug_dir:
        vis = cv2.cvtColor(work, cv2.COLOR_GRAY2BGR)
        for t in h_tracks:
            cv2.polylines(vis, [np.int32(np.stack([xc, t], axis=1))], False, (0, 0, 255), 2)
        for t in v_tracks:
            cv2.polylines(vis, [np.int32(np.stack([t, yc], axis=1))], False, (255, 0, 0), 2)
        Path(debug_dir).mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(Path(debug_dir) / "01_flatten_mesh.png"), vis)

    # Remap the source at native resolution (readers stay on native pixels):
    # the traced lines, scaled back from work px, on a native-scale margin warp.
    k = 1.0 / to_work
    big = _warp_with_margin(image, to_rect, 1.0, margin * k, (nw, nh))
    native = _remap_to_grid(big, h_tracks * k, xc * k, v_tracks * k, yc * k, pitch * k)
    s = _WORK_PX / (pitch * k)
    warped = native if 0.9 <= s <= 1.1 else cv2.resize(
        native, None, fx=s, fy=s, interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC
    )
    return RectifiedBoard(warped=warped, quad=board.quad, native=native)


def _trace_grid(
    work: NDArray, offset: int, h_edges: tuple[float, float], v_edges: tuple[float, float]
) -> tuple[NDArray, NDArray, NDArray, NDArray, float] | None:
    """Trace both axes' lines on ``work`` binarised at ``offset``.

    Returns ``(h_tracks, xc, v_tracks, yc, pitch)`` when the lines span the
    border quad with about a cell per gap, else ``None``.
    """
    binary = _binary(work, offset)
    _erase_solid(binary, work, _WORK_PX)
    _erase_blobs(binary, _WORK_PX)

    # The pitch estimate can be a few % off, and every threshold is in cells:
    # trace, re-measure the pitch from the traced lines, and retrace if needed.
    pitch = _WORK_PX
    for _ in range(2):
        h_traced = _trace_lines(binary, 0, pitch)
        v_traced = _trace_lines(binary, 1, pitch)
        if h_traced is None or v_traced is None:
            return None
        (h_tracks, xc), (v_tracks, yc) = h_traced, v_traced
        measured = float(np.median(np.concatenate([
            np.diff(h_tracks.mean(axis=1)), np.diff(v_tracks.mean(axis=1))
        ])))
        if abs(measured - pitch) <= 0.1 * pitch:
            break
        pitch = measured

    h_tracks = _drop_outside(_trim_tracks(_drop_midcell(h_tracks, pitch), pitch), *h_edges, pitch)
    v_tracks = _drop_outside(_trim_tracks(_drop_midcell(v_tracks, pitch), pitch), *v_edges, pitch)
    if len(h_tracks) < 3 or len(v_tracks) < 3:
        return None
    h_tracks = _add_border(h_tracks, *h_edges, pitch)
    v_tracks = _add_border(v_tracks, *v_edges, pitch)
    if not (_fits_border(h_tracks, *h_edges, pitch) and _fits_border(v_tracks, *v_edges, pitch)):
        return None
    return h_tracks, xc, v_tracks, yc, pitch



def _fix_bend_outliers(tracks: NDArray, pitch: float) -> NDArray:
    """Replace traced points that bend away from their neighbouring lines.

    Printed lines are evenly spaced, so an interior line sits midway between
    the lines d away on each side, d = 1.._BEND_NEIGHBOURS: symmetric pairs
    cancel perspective's gradual change of spacing, and a smooth bend moves
    the pair with it. Nothing is learned from the line's own trace, which can
    be wrong in most of its strips (the 16x16 double choco medium-2 sample:
    3 of 5, pulled toward a row of digits). The worst point further than
    ``_BEND_OUTLIER_CELLS`` from the median midpoint takes it, and the rest
    are judged again, so a pinched pair is mended one point at a time. The
    outer lines are left to the border handling.
    """
    tracks = tracks.copy()
    for _ in range(tracks.size):
        pred = _bend_predictions(tracks)
        miss = np.nan_to_num(np.abs(tracks - pred)) / pitch
        k, s = np.unravel_index(int(np.argmax(miss)), miss.shape)
        if miss[k, s] <= _BEND_OUTLIER_CELLS:
            break
        tracks[k, s] = pred[k, s]
    return tracks


def _bend_predictions(tracks: NDArray) -> NDArray:
    """Each interior line's position as the median midpoint of the lines around it."""
    n = len(tracks)
    pred = np.full_like(tracks, np.nan)
    for k in range(1, n - 1):
        reach = min(_BEND_NEIGHBOURS, k, n - 1 - k)
        pred[k] = np.median([(tracks[k - d] + tracks[k + d]) / 2 for d in range(1, reach + 1)], axis=0)
    return pred

def _warp_with_margin(
    image: NDArray, to_rect: NDArray, scale: float, margin: float, size: tuple[int, int]
) -> NDArray:
    """The four-corner warp at ``scale``, with ``margin`` px of the source kept around it."""
    A = np.array([[scale, 0, margin], [0, scale, margin], [0, 0, 1]], dtype=np.float64) @ to_rect
    w = int(round(size[0] * scale + 2 * margin))
    h = int(round(size[1] * scale + 2 * margin))
    white = 255 if image.ndim == 2 else (255, 255, 255)
    return cv2.warpPerspective(image, A, (w, h), borderMode=cv2.BORDER_CONSTANT, borderValue=white)


def _binary(gray: NDArray, offset: int = _BINARY_OFFSETS[0]) -> NDArray:
    return cv2.adaptiveThreshold(
        cv2.GaussianBlur(gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, offset,
    )


def _erase_blobs(binary: NDArray, pitch: float) -> None:
    """Blank every cell-sized ink blob (a clue circle) from ``binary`` in place.

    Circles stacked in neighbouring cells sit close enough to bridge into a run
    along a line and pose as one. A circle is one blob about a cell across;
    dashes are far smaller, and solid rulings join into one board-sized blob.
    """
    _, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    w, h = stats[:, cv2.CC_STAT_WIDTH], stats[:, cv2.CC_STAT_HEIGHT]
    lo, hi = 0.45 * pitch, 1.2 * pitch
    blob = (w >= lo) & (w <= hi) & (h >= lo) & (h <= hi)
    blob[0] = False  # background
    binary[blob[labels]] = 0


def _erase_solid(binary: NDArray, gray: NDArray, pitch: float) -> None:
    """Blank ``binary`` inside solid dark areas (black cells), in place.

    A photo's grain inside a black cell survives the adaptive threshold as
    specks; along a wall band several cells long they bridge into a run that
    poses as a grid line mid-cell (the 45x31 slalom photo). The black cell's
    own edges sit on grid lines and stay: only ink deeper than 0.15 cell
    inside the dark area goes.
    """
    _, dark = cv2.threshold(
        cv2.GaussianBlur(gray, (5, 5), 0), 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )
    k = max(3, int(round(0.3 * pitch)) | 1)
    solid = cv2.erode(dark, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    binary[solid > 0] = 0


def _line_mask(binary: NDArray, axis: int, pitch: float) -> NDArray:
    """Ink that runs along ``axis``'s lines (0 = horizontal) for over a cell."""
    def rect(w: int, h: int) -> NDArray:
        return cv2.getStructuringElement(cv2.MORPH_RECT, (w, h))

    thin = max(3, int(round(_THIN_CELLS * pitch)))
    thick = max(3, int(round(0.05 * pitch)) | 1)
    close = max(5, int(round(0.23 * pitch)))  # bridges the gaps of a dashed line
    run = int(1.2 * pitch)  # longer than any clue glyph or circle arc
    if axis == 0:
        across, thick_k, close_k, open_k = rect(1, thin), rect(1, thick), rect(close, 1), rect(run, 1)
    else:
        across, thick_k, close_k, open_k = rect(thin, 1), rect(thick, 1), rect(1, close), rect(1, run)
    fat = cv2.morphologyEx(binary, cv2.MORPH_OPEN, across)
    mask = cv2.subtract(binary, cv2.erode(fat, rect(5, 5)))
    # Thicken across first, so a line that curls near a corner still holds a
    # straight run a cell long.
    mask = cv2.dilate(mask, thick_k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, close_k)
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, open_k) > 0


def _strip_positions(prof: NDArray, pitch: float) -> list[float]:
    """Line positions in one strip's normalised profile.

    Each on-run of the profile is a candidate; runs closer than half a cell
    are one line. That line starts at its strongest run, then a line with
    several runs takes the one nearest a cell from its neighbouring lines:
    beside the border a page edge or a scanner's spine shadow can out-ink the
    frame itself.
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
    groups: list[list[tuple[float, float]]] = []
    for r in runs:
        if groups and r[0] - groups[-1][-1][0] < pitch * 0.5:
            groups[-1].append(r)
        else:
            groups.append([r])
    lines = [max(g, key=lambda q: q[1])[0] for g in groups]
    for i, g in enumerate(groups):
        if len(g) < 2:
            continue
        want = []
        if i > 0 and lines[i] - lines[i - 1] < 1.6 * pitch:
            want.append(lines[i - 1] + pitch)
        if i + 1 < len(lines) and lines[i + 1] - lines[i] < 1.6 * pitch:
            want.append(lines[i + 1] - pitch)
        if want:
            # Only a run with real ink can stand in: a page edge out-inks the
            # frame, but a speck a tenth of the border's ink is not a line.
            strong = max(q[1] for q in g)
            cands = [q for q in g if q[1] >= _MIN_ALT_RUN_INK * strong]
            target = float(np.mean(want))
            lines[i] = min(cands, key=lambda q: abs(q[0] - target))[0]
    return lines


def _trace_lines(binary: NDArray, axis: int, pitch: float) -> tuple[NDArray, NDArray] | None:
    """Trace the grid lines of one axis through strips.

    ``axis=0`` traces horizontal lines: the image is cut into vertical strips
    and each line's y is found per strip. Returns ``(tracks, centres)``:
    ``tracks[k, s]`` is line k's position in strip s, ``centres[s]`` the
    strip's centre along the line.
    """
    mask = _line_mask(binary, axis, pitch)
    along = mask.shape[1] if axis == 0 else mask.shape[0]
    n_reg = max(3, int(round(along / (_STRIP_CELLS * pitch))))
    edge = int(round(_EDGE_STRIP_CELLS * pitch))
    spans = [(0, edge)]
    spans += [
        (int(round(s * along / n_reg)), int(round((s + 1) * along / n_reg))) for s in range(n_reg)
    ]
    spans += [(along - edge, along)]
    n = len(spans)
    centres = np.array([(a + z) / 2 for a, z in spans])
    strips: list[list[float]] = []
    for a, z in spans:
        proj = (mask[:, a:z].sum(axis=1) if axis == 0 else mask[a:z, :].sum(axis=0)).astype(float)
        strips.append(_strip_positions(proj / proj.max(), pitch) if proj.max() > 0 else [])

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
                prev = [t[q] for q in range(s - step, -1 if step > 0 else n, -step) if not np.isnan(t[q])]
                last.append(prev[0] if prev else np.nan)
            taken: set[int] = set()
            for p in strips[s]:
                best, best_d = -1, pitch * 0.35
                for k, lp in enumerate(last):
                    if k in taken or np.isnan(lp):
                        continue
                    if abs(p - lp) < best_d:
                        best, best_d = k, abs(p - lp)
                if best >= 0:
                    tracks[best][s] = p
                    taken.add(best)
                else:
                    tracks.append([np.nan] * n)
                    tracks[-1][s] = p
                    last.append(np.nan)

    # Keep lines seen in enough strips; fill their gaps along the line.
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

    # Insert lines missed in every strip (a gap of 2-3 cells) by interpolation;
    # drop a line closer than half a cell to the previous one.
    raw = np.diff(arr.mean(axis=1)) / pitch

    def missed_tol(i: int) -> float:
        inner = raw[1:3] if i == 0 else raw[-3:-1] if i == len(raw) - 1 else []
        clean = len(inner) == 2 and all(abs(g - 1) <= _MISSED_GAP_TOL for g in inner)
        return _MISSED_EDGE_GAP_TOL if clean else _MISSED_GAP_TOL

    out = [arr[0]]
    for i, t in enumerate(arr[1:]):
        gap = float(np.mean(t - out[-1]))
        k = int(round(gap / pitch))
        if 2 <= k <= 3 and abs(gap - k * pitch) <= missed_tol(i) * pitch:
            for q in range(1, k):
                out.append(out[-1] + (t - out[-1]) / (k - q + 1))
        if gap >= 0.5 * pitch:
            out.append(t)
    return np.array(out), centres


def _dominant_extent(
    positions: list[float], pitch: float, tol: float = 0.2, max_bridge: int = 3, min_run: int = 3
) -> tuple[float, float]:
    """Return (lo, hi) of the longest run of lines on the one-pitch grid.

    A neighbouring puzzle's title band, grabbed inside the border, sits an
    off-grid gap from the board's first line and is trimmed. A gap of 2-3
    pitches (a line the mask dropped) continues the run. A bowed page can
    leave one uneven gap mid-board (e.g. 1.25 + 0.76 pitches), so runs join
    across a gap of half a cell to a few cells, except a first or last run of
    fewer than ``min_run`` lines (a title band is a stray line or two at the
    edge). Finally an outermost line a sub-pitch gap beyond the run is
    re-attached: perspective foreshortens the far edge row.
    """
    pos = np.array(positions, dtype=float)
    runs: list[list[int]] = [[0]]
    for k, gap in enumerate(np.diff(pos)):
        mult = round(gap / pitch)
        if 1 <= mult <= max_bridge and abs(gap - mult * pitch) <= tol * pitch:
            runs[-1].append(k + 1)
        else:
            runs.append([k + 1])
    last = len(runs) - 1
    merged: list[list[int]] = [runs[0]]
    for i, run in enumerate(runs[1:], start=1):
        prev = merged[-1]
        gap = pos[run[0]] - pos[prev[-1]]
        edge_stray = (prev is runs[0] and len(prev) < min_run) or (i == last and len(run) < min_run)
        if not edge_stray and 0.5 * pitch <= gap <= (max_bridge + 0.5) * pitch:
            prev.extend(run)
        else:
            merged.append(run)
    best = max(merged, key=lambda r: pos[r[-1]] - pos[r[0]])
    lo, hi = best[0], best[-1]
    while lo > 0 and pos[lo] - pos[lo - 1] < pitch * (1 - tol):
        lo -= 1
    while hi < len(pos) - 1 and pos[hi + 1] - pos[hi] < pitch * (1 - tol):
        hi += 1
    return float(pos[lo]), float(pos[hi])


def _trim_tracks(tracks: NDArray, pitch: float) -> NDArray:
    means = tracks.mean(axis=1)
    lo, hi = _dominant_extent(list(means), pitch)
    return tracks[(means >= lo - 1e-6) & (means <= hi + 1e-6)]


def _drop_outside(tracks: NDArray, lo: float, hi: float, pitch: float) -> NDArray:
    """Drop outermost lines that lie off the board at both of its corners.

    ``lo``/``hi`` are the border quad's edges across the lines. The quad is
    fitted to the border's corners, so the real border line meets it at both
    end strips even on a bowed page (the bow is mid-edge). A line the margin
    let in that sits ``_OUTSIDE_CELLS`` beyond the quad at both ends is page
    clutter: a divider rule under the board, the page edge, a neighbouring
    board. ``_dominant_extent`` would re-attach it as a foreshortened edge row
    (the 17x17 nurimaze photo's divider, 0.6 cell below; the 45x31 one's page
    edge, 0.75 cell left).
    """
    off = _OUTSIDE_CELLS * pitch

    def outside(t: NDArray) -> bool:
        ends = t[[0, -1]]
        return bool(np.all(ends < lo - off) or np.all(ends > hi + off))

    a, b = 0, len(tracks)
    while b - a > 3 and outside(tracks[a]):
        a += 1
    while b - a > 3 and outside(tracks[b - 1]):
        b -= 1
    return tracks[a:b]


def _drop_midcell(tracks: NDArray, pitch: float) -> NDArray:
    """Drop a line half a cell from both neighbours that are a cell apart.

    A dashed line through cell centres (a slalom gate, a sinkamino rule)
    traces like a ruling and splits one cell into two half cells.
    """
    keep = [tracks[0]]
    for k in range(1, len(tracks) - 1):
        g1 = float(np.mean(tracks[k] - keep[-1]))
        g2 = float(np.mean(tracks[k + 1] - tracks[k]))
        if 0.3 * pitch <= min(g1, g2) and max(g1, g2) <= 0.7 * pitch and 0.8 * pitch <= g1 + g2 <= 1.2 * pitch:
            continue
        keep.append(tracks[k])
    keep.append(tracks[-1])
    return np.array(keep)


def _add_border(tracks: NDArray, lo: float, hi: float, pitch: float) -> NDArray:
    """Add the border quad's edge as the outer line when tracing missed it.

    A thick border next to a dark page curl or shadow merges into one fat band
    the line mask drops; the traced lines then stop about a cell inside the
    border quad, which ``rectify_board`` already fitted to the border.
    """
    first, last = float(tracks[0].mean()), float(tracks[-1].mean())
    if 0.6 * pitch <= first - lo <= 1.4 * pitch:
        tracks = np.vstack([np.full_like(tracks[0], lo), tracks])
    if 0.6 * pitch <= hi - last <= 1.4 * pitch:
        tracks = np.vstack([tracks, np.full_like(tracks[0], hi)])
    return tracks


def _fits_border(tracks: NDArray, lo: float, hi: float, pitch: float) -> bool:
    """Whether the traced lines span the border quad with about a cell per gap.

    Tracing counts lines on its own; when it loses part of the board (a title
    band, halftone, a heavy frame) its outer lines end cells inside the quad,
    or its gaps stop being a cell. Then the plain four-corner warp is the
    safer board, so ``flatten_board`` is safe on every parser.
    """
    means = tracks.mean(axis=1)
    if abs(means[0] - lo) > _BORDER_FIT_CELLS * pitch or abs(means[-1] - hi) > _BORDER_FIT_CELLS * pitch:
        return False
    gaps = np.diff(means) / pitch
    return bool(np.all((gaps >= _GAP_RANGE[0]) & (gaps <= _GAP_RANGE[1])))


def _misfit(tracks: NDArray) -> float:
    """90th-percentile distance (px) of traced points from an even straight grid.

    Bow, lean and uneven spacing all count: each shifts cells off where a
    straight grid would sample them.
    """
    n = len(tracks) - 1
    first, last = tracks[0].mean(), tracks[-1].mean()
    ideal = first + np.arange(n + 1)[:, None] * (last - first) / n
    return float(np.percentile(np.abs(tracks - ideal), 90))


def _interp_extend(x: NDArray, xp: NDArray, fp: NDArray) -> NDArray:
    """``np.interp`` that continues the end segments past ``xp``'s range.

    Strip centres sit inside the board; holding a line flat beyond them lets a
    bowed border drift into the corner cells.
    """
    y = np.interp(x, xp, fp)
    lo, hi = x < xp[0], x > xp[-1]
    y[lo] = fp[0] + (x[lo] - xp[0]) * (fp[1] - fp[0]) / (xp[1] - xp[0])
    y[hi] = fp[-1] + (x[hi] - xp[-1]) * (fp[-1] - fp[-2]) / (xp[-1] - xp[-2])
    return y


def _remap_to_grid(
    img: NDArray, h_tracks: NDArray, xc: NDArray, v_tracks: NDArray, yc: NDArray, cell_px: float
) -> NDArray:
    """Remap ``img`` so the traced lines land on an even ``cell_px`` grid.

    Output line k sits at ``k * cell_px``, the outer lines on the image edge
    (as a four-corner warp leaves them). A target point at fractional line
    indices maps to the source point between the neighbouring traced lines;
    the lines are near-straight, so one pass (y from the mean vertical-line x,
    then x from that y) is enough.
    """
    rows, cols = len(h_tracks) - 1, len(v_tracks) - 1
    out_h, out_w = int(round(rows * cell_px)) + 1, int(round(cols * cell_px)) + 1

    def split(n_px: int, n_cells: int) -> tuple[NDArray, NDArray]:
        u = np.arange(n_px) / cell_px
        i0 = np.clip(np.floor(u).astype(int), 0, n_cells - 1)
        return i0, u - i0

    j0, fv = split(out_w, cols)
    i0, fu = split(out_h, rows)
    v_mean = v_tracks.mean(axis=1)
    x_approx = (1 - fv) * v_mean[j0] + fv * v_mean[j0 + 1]
    h_at = np.stack([_interp_extend(x_approx, xc, t) for t in h_tracks])
    y_src = (1 - fu)[:, None] * h_at[i0] + fu[:, None] * h_at[i0 + 1]
    x_src = np.empty_like(y_src)
    for c in range(out_w):
        a = _interp_extend(y_src[:, c], yc, v_tracks[j0[c]])
        b = _interp_extend(y_src[:, c], yc, v_tracks[j0[c] + 1])
        x_src[:, c] = (1 - fv[c]) * a + fv[c] * b
    white = 255 if img.ndim == 2 else (255, 255, 255)
    return cv2.remap(
        img, x_src.astype(np.float32), y_src.astype(np.float32),
        interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=white,
    )
