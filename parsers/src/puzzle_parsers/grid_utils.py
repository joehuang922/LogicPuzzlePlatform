"""Shared grid detection primitives for puzzle parsers.

Provides reusable building blocks for:
- Finding quadrilateral puzzle borders
- Perspective warping to rectify the image
- Preprocessing dashed/dotted grid lines into solid-like masks
- Detecting grid lines via morphological projection
- Classifying internal border thickness (thick/thin for rooms/walls)
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.signal import find_peaks

from puzzle_parsers.board_grid import BoardGrid


# Minimum fraction of a quad's weakest edge that must run along dark ink for
# the quad to be trusted. Title strips and page-gutter seams produce an edge
# floating over whitespace, which scores far below this; a true border scores ~1.
_BORDER_SUPPORT_MIN = 0.5


def ink_intensity(image: NDArray) -> NDArray:
    """Hue-agnostic "ink is dark" grayscale: the per-pixel channel minimum.

    Luminance (``COLOR_BGR2GRAY``) is a weighted channel average, so a faint line
    printed in a *single* colour nearly vanishes: a red ruling keeps its red
    channel near paper-white, which drags the weighted mean back up toward white.
    The grid border and rulings then fall below the detectors' contrast floor even
    though a human reads them easily — the failure mode behind the picto-link
    sample's lost border and collapsed cell count.

    The channel *minimum* is immune to hue. Neutral paper is bright in every
    channel, so ``min`` stays bright; ink of any colour absorbs in at least one
    channel (red ink kills green+blue, blue ink kills red+green, black kills all),
    so ``min`` goes dark. This recovers red/brown/blue/green rulings and plain
    black ink alike. Pass the result anywhere a grayscale (ink-dark) image is
    expected — border detection, warping geometry, and grid-line fitting.

    Accepts a BGR image; returns a single-channel ``uint8`` array. A 2-D input is
    already single-channel and is returned unchanged.
    """
    if image.ndim == 2:
        return image
    return image.min(axis=2)


def find_quadrilateral_border(gray: NDArray) -> NDArray:
    """Find the 4 corners of the puzzle's outer border.

    Returns a (4,2) float32 array ordered as: TL, TR, BR, BL.
    Falls back to full image bounds if no clear border is found.

    Strategy (each candidate is scored by *edge support* — the fraction of its
    weakest edge that runs along dark ink — and the best-supported one wins):
    1. Multi-scale contour detection. Canny edges are morphologically closed at
       several kernel sizes to reconnect scan-degraded ("ink-saving") borders,
       small/scattered components (title text) are dropped by bounding-box
       extent, and each surviving contour is reduced to 4 corners via convex
       hull + collinear-vertex removal. A larger close kernel recovers a badly
       broken border but risks fusing a nearby title into it; edge-support
       scoring rejects the fused result, so we can safely try several.
    2. Dark-pixel projection box — immune to titles (relative threshold) and to
       a single page-gutter seam. Used when no contour candidate is well
       supported, e.g. a title sits close above a dashed board. The box is
       narrowed to the board's interior when that lies well inside it
       (``_interior_within``): the previous puzzle's bottom border is a dark
       full-width row too.
    3. Small-board contours — step 1 again, keeping edge components that span
       30% of an axis and boards down to 8% of the frame. A whole-page photo can
       leave the board under step 1's floors (l_ring board 1: 44% x 31% of the
       frame, 14% of its area) while the projection box swallows the page
       around it. Only tried when nothing above is well supported, so boards
       that steps 1-2 already find are unchanged.
    4. Gradient-based fallback — steepest row/column brightness transitions.
    """
    h, w = gray.shape
    fallback = np.float32([[0, 0], [w, 0], [w, h], [0, h]])

    best: NDArray | None = None
    best_support = -1.0
    for close_k in (1, 3, 5, 7):
        quad = _find_border_via_contours(gray, close_k)
        if quad is None:
            continue
        support = _edge_support(gray, quad)
        if support > best_support:
            best_support = support
            best = quad

    if best is not None and best_support >= _BORDER_SUPPORT_MIN:
        return best

    # No well-supported contour: try the projection box and keep whichever of
    # the two has stronger edge support.
    box = _projection_box_quad(gray)
    box_support = _edge_support(gray, box)
    if best is None or box_support > best_support:
        if box_support >= _BORDER_SUPPORT_MIN:
            return _interior_within(gray, box)
        best, best_support = box, box_support

    for close_k in (1, 3, 5, 7):
        quad = _find_border_via_contours(gray, close_k, min_span=0.3, min_area=0.08)
        if quad is None:
            continue
        support = _edge_support(gray, quad)
        if support >= _BORDER_SUPPORT_MIN and support > best_support:
            best, best_support = quad, support
    if best_support >= _BORDER_SUPPORT_MIN:
        return best

    quad = _find_border_via_gradient(gray)
    if quad is not None and _edge_support(gray, quad) > best_support:
        return quad

    return best if best is not None else fallback


def _find_border_via_contours(
    gray: NDArray, close_k: int = 1, *, min_span: float = 0.5, min_area: float = 0.15
) -> NDArray | None:
    """Try to find the border as a large quadrilateral contour.

    Args:
        close_k: Size of the morphological close kernel applied to the Canny
            edges before contour finding. ``1`` disables closing (clean scans);
            larger values reconnect a scan-broken border at the cost of possibly
            fusing nearby text — the caller guards against that via edge support.
        min_span: Edge components must span this fraction of the width or height.
        min_area: Smallest contour kept, as a fraction of the image area.
    """
    h, w = gray.shape
    img_area = h * w

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    if close_k > 1:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (close_k, close_k))
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

    # Drop small/scattered edge components (title text, clue digits, halftone):
    # only a board border spans most of an axis, so keep components whose
    # bounding box covers > min_span (50%) of the width or height.
    n, labels, stats, _ = cv2.connectedComponentsWithStats(edges, 8)
    keep = np.zeros_like(edges)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_WIDTH] > min_span * w or stats[i, cv2.CC_STAT_HEIGHT] > min_span * h:
            keep[labels == i] = 255
    edges = keep

    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    candidates = sorted(contours, key=cv2.contourArea, reverse=True)
    for contour in candidates[:10]:
        area = cv2.contourArea(contour)
        # Whole-page photos (kept so the author credit at the page foot is
        # captured) leave a small board at ~16% of the frame; a higher floor
        # skips its contour and lets a coarser fallback pick a wrong box.
        if area < img_area * min_area:
            break
        if area > img_area * 0.98:
            continue
        quad = _corners_from_contour(contour)
        if quad is not None:
            return quad

    return None


def _corners_from_contour(
    contour: NDArray, straight_deg: float = 160.0, rect_tol: float = 35.0
) -> NDArray | None:
    """Reduce a contour to its 4 corners via convex hull + collinear removal.

    A scan-degraded or dashed border rarely approximates to exactly 4 vertices —
    ``approxPolyDP`` leaves mid-edge kinks where the traced contour weaves in and
    out of dash gaps. Instead of demanding ``len(approx) == 4``, we take the
    convex hull (removes concave garbage), collapse dense point runs with a low
    epsilon, then iteratively drop the vertex whose interior angle is closest to
    180° (a collinear mid-edge point) until 4 remain. Returns ``None`` if the
    result is not a plausible rectangle.
    """
    hull = cv2.convexHull(contour).reshape(-1, 2).astype(np.float32)
    if len(hull) < 4:
        return None

    peri = cv2.arcLength(hull.reshape(-1, 1, 2), True)
    approx = cv2.approxPolyDP(
        hull.reshape(-1, 1, 2), 0.01 * peri, True
    ).reshape(-1, 2).astype(np.float32)
    poly = approx if len(approx) >= 4 else hull

    while len(poly) > 4:
        angles = _polygon_interior_angles(poly)
        i = int(np.argmax(angles))
        if angles[i] < straight_deg:
            break  # remaining vertices are all real corners
        poly = np.delete(poly, i, axis=0)

    if len(poly) != 4:
        return None
    if np.any(np.abs(_polygon_interior_angles(poly) - 90) > rect_tol):
        return None
    return order_points(poly)


def _polygon_interior_angles(poly: NDArray) -> NDArray:
    """Interior angle (degrees) at each vertex of a polygon."""
    n = len(poly)
    angles = np.empty(n)
    for i in range(n):
        prev = poly[(i - 1) % n]
        cur = poly[i]
        nxt = poly[(i + 1) % n]
        v1 = prev - cur
        v2 = nxt - cur
        cos = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9)
        angles[i] = np.degrees(np.arccos(np.clip(cos, -1.0, 1.0)))
    return angles


def _edge_support(gray: NDArray, quad: NDArray, band_ratio: float = 0.006) -> float:
    """Fraction of the quad's *weakest* edge that runs along dark ink.

    A genuine border tracks a dark line and scores near 1.0; a title-induced top
    edge or page-gutter seam floats over whitespace on at least one edge and
    scores low. Returns the minimum over the four edges.
    """
    h, w = gray.shape
    dark = gray < 128
    band = max(2, int(band_ratio * max(h, w)))
    scores: list[float] = []
    for a, b in ((0, 1), (1, 2), (2, 3), (3, 0)):
        p0 = quad[a]
        p1 = quad[b]
        length = int(np.hypot(p1[0] - p0[0], p1[1] - p0[1]))
        if length < 5:
            scores.append(0.0)
            continue
        n_samples = max(20, length // 3)
        hits = 0
        for t in np.linspace(0, 1, n_samples):
            x = int(p0[0] + t * (p1[0] - p0[0]))
            y = int(p0[1] + t * (p1[1] - p0[1]))
            x0 = max(0, x - band)
            x1 = min(w, x + band + 1)
            y0 = max(0, y - band)
            y1 = min(h, y + band + 1)
            if dark[y0:y1, x0:x1].any():
                hits += 1
        scores.append(hits / n_samples)
    return min(scores) if scores else 0.0


# The board interior replaces a projection box that reaches this far (as a
# fraction of the box's extent) beyond it on some side. A 10x10 kuralin photo:
# the box ran from the previous puzzle's bottom border, 17% above the board's
# top; on boards the box already fits it differs by under 2% (kakuro, where
# the interior's corners come out a little rotated, tentaishow).
_INTERIOR_SHRINK_MIN = 0.05


def _interior_within(gray: NDArray, box: NDArray) -> NDArray:
    """The board inside a projection box, when the box overreaches it.

    The board's inside is one white region bounded by the inner edge of its
    border: dashed lines leave gaps and clues are islands, so it stays one
    region even where the border's outer edge runs into a page rule (which
    stops the Canny contours closing). The largest such region inside ``box``,
    reduced to a quad, replaces the box when it is well supported and the box
    reaches more than ``_INTERIOR_SHRINK_MIN`` beyond it on some side.
    """
    h, w = gray.shape
    ink = (cv2.GaussianBlur(gray, (5, 5), 0) < 128).astype(np.uint8) * 255
    contours, hierarchy = cv2.findContours(ink, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        return box
    (bx0, by0), (bx1, by1) = box.min(axis=0), box.max(axis=0)
    bw, bh = bx1 - bx0, by1 - by0
    tol = 0.01 * max(bw, bh)
    holes = [
        c for c, link in zip(contours, hierarchy[0])
        if link[3] != -1 and cv2.contourArea(c) >= 0.15 * h * w
    ]
    for contour in sorted(holes, key=cv2.contourArea, reverse=True)[:5]:
        quad = _corners_from_contour(contour)
        if quad is None or _edge_support(gray, quad) < _BORDER_SUPPORT_MIN:
            continue
        (qx0, qy0), (qx1, qy1) = quad.min(axis=0), quad.max(axis=0)
        if qx0 < bx0 - tol or qy0 < by0 - tol or qx1 > bx1 + tol or qy1 > by1 + tol:
            continue
        reach = max((qx0 - bx0) / bw, (bx1 - qx1) / bw, (qy0 - by0) / bh, (by1 - qy1) / bh)
        if reach > _INTERIOR_SHRINK_MIN:
            return quad
        return box
    return box


def _projection_box_quad(gray: NDArray) -> NDArray:
    """Axis-aligned board box from dark-pixel projection.

    The board border is the only near-full-width / full-height dark structure,
    so projecting the dark-pixel fraction onto each axis produces sharp spikes at
    the four edges. Taking the outermost rows/cols that clear a relative
    threshold ignores title text and faint interior dividers, and — because the
    threshold is relative — a single page-gutter seam does not shift the box.
    Returns a (4,2) float32 quad ordered TL, TR, BR, BL.
    """
    h, w = gray.shape
    dark = (gray < 128).astype(np.float32)
    row_frac = dark.sum(axis=1) / w
    col_frac = dark.sum(axis=0) / h

    def _outer(frac: NDArray, full: int) -> tuple[int, int]:
        thr = max(0.18, 0.55 * float(frac.max()))
        idx = np.where(frac > thr)[0]
        if len(idx) == 0:
            return 0, full - 1
        return int(idx.min()), int(idx.max())

    y0, y1 = _outer(row_frac, h)
    x0, x1 = _outer(col_frac, w)
    return np.float32([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])



def _find_border_via_gradient(gray: NDArray) -> NDArray | None:
    """Find the border by locating steepest brightness transitions on each edge.

    For each side, scans the outer 15% of the image for the position where
    the row/column mean brightness drops most sharply (top/left) or rises
    most sharply (bottom/right), indicating the outer edge of the border.
    """
    h, w = gray.shape
    row_means = gray.mean(axis=1)
    col_means = gray.mean(axis=0)
    row_grad = np.gradient(row_means)
    col_grad = np.gradient(col_means)

    scan_y = max(10, int(h * 0.15))
    scan_x = max(10, int(w * 0.15))

    top = int(np.argmin(row_grad[:scan_y]))
    bot = int(h - 1 - scan_y + np.argmax(row_grad[h - scan_y:]))
    left = int(np.argmin(col_grad[:scan_x]))
    right = int(w - 1 - scan_x + np.argmax(col_grad[w - scan_x:]))

    if (right - left) < w * 0.5 or (bot - top) < h * 0.5:
        return None

    return np.float32([[left, top], [right, top], [right, bot], [left, bot]])


def order_points(pts: NDArray) -> NDArray:
    """Order 4 points as: top-left, top-right, bottom-right, bottom-left."""
    sorted_by_y = pts[np.argsort(pts[:, 1])]
    top = sorted_by_y[:2]
    bottom = sorted_by_y[2:]
    top = top[np.argsort(top[:, 0])]
    bottom = bottom[np.argsort(bottom[:, 0])]
    return np.float32([top[0], top[1], bottom[1], bottom[0]])


def warp_to_rectangle(
    image: NDArray, border_pts: NDArray,
) -> tuple[NDArray, int, int]:
    """Perspective-warp the image to a rectangle at source resolution.

    Preserves the native pixel density so that grid line detection works
    reliably across all board sizes (from 7×7 to 60×100+).

    Returns (warped_image, width, height).
    """
    src_w = float(np.linalg.norm(border_pts[1] - border_pts[0]))
    src_h = float(np.linalg.norm(border_pts[3] - border_pts[0]))
    aspect = src_w / src_h if src_h > 0 else 1.0

    warp_h = int(src_h)
    warp_w = int(warp_h * aspect)
    dst = np.float32([[0, 0], [warp_w, 0], [warp_w, warp_h], [0, warp_h]])
    M = cv2.getPerspectiveTransform(border_pts, dst)
    warped = cv2.warpPerspective(image, M, (warp_w, warp_h))
    return warped, warp_w, warp_h


# Step 1 sees the same input on web and Android: the border is searched on a
# copy no larger than what the Android client uploads (longest side 2000px).
# At full scan resolution the multi-scale contour search fused a board with
# the bottom rows of the puzzle printed above it (shakashaka-titled read 12x10).
BORDER_SEARCH_MAX_SIDE = 2000
# Margin (fraction of the coarse board size) kept around it for the full-
# resolution corner refinement; small enough to leave a neighbouring puzzle out.
_REFINE_MARGIN = 0.05
# Every rectified board is rescaled to this cell size, so grid detection's
# pixel-sized kernels always run at one density whatever the source. Samples
# span 29-266 px/cell natively; every target in 64-90 parsed all of them, at
# full resolution and after Android's 2000px/JPEG upload, so 72 sits mid-band.
TARGET_CELL_PX = 72.0
MIN_CELL_PX = TARGET_CELL_PX
MAX_CELL_PX = 160.0
# Guards: never upscale a board more than 4x, never produce a side over 4096px
# (a 64-column board lands at 64px/cell instead), and don't resample a board
# already within 10% of the target.
_MAX_UPSCALE = 4.0
_MAX_RECTIFIED_SIDE = 4096
# Cells are square-ish; when the two axes' pitch estimates differ by more than
# this the estimate is untrustworthy (e.g. halftone shading), so keep scale.
_PITCH_AXIS_AGREEMENT = 1.15
# A board with no trustworthy pitch is retried on halved copies down to this
# shorter side: on a 4000px photo of halftone grey (double_choco, ~270 px/cell)
# the threshold turns every halftone dot into ink and drowns the lines; at half
# or quarter size the dots blur out and the lines read again.
_PITCH_MIN_SIDE = 400
# Lattice-fit tooth half-width as a fraction of the normalised cell.
_LATTICE_BAND_FRAC = 0.055


def rectify_board(
    image: NDArray,
    *,
    border_image: NDArray | None = None,
    flatten: bool = True,
    debug_dir: str | Path | None = None,
) -> RectifiedBoard:
    """Find the board, warp it to a rectangle, flatten it and normalise its cell size.

    Returns a :class:`RectifiedBoard`: ``warped`` is the board at a normalised
    cell size, for finding the grid; ``native`` is the same board at source
    resolution, for reading clues (``to_native`` maps a grid found on
    ``warped`` onto it). ``border_image`` is a grayscale image, same size as
    ``image``, to search for the border and trace the lines in instead of
    ``image`` itself (picto link uses an ink mask).

    Every board goes through ``flatten.flatten_board``: a photo of a curved
    page comes out with straight, even lines, and a flat board, or one whose
    lines can't be traced to the border, comes back as the four-corner warp.
    ``flatten=False`` returns the plain warp (tests compare the two).
    """
    gray = border_image
    if gray is None:
        gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    s = BORDER_SEARCH_MAX_SIDE / max(h, w)
    if s < 1:
        # Pick the board on an Android-sized copy, then re-find its corners at
        # full resolution inside that board's box: the coarse corners alone sat
        # up to ~0.12 cell inside a thick border (hitori), shifting every crop.
        small = cv2.resize(gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        coarse = find_quadrilateral_border(small) / s
        (x0, y0), (x1, y1) = coarse.min(axis=0), coarse.max(axis=0)
        mx, my = (x1 - x0) * _REFINE_MARGIN, (y1 - y0) * _REFINE_MARGIN
        cx0, cy0 = int(max(0, x0 - mx)), int(max(0, y0 - my))
        cx1, cy1 = int(min(w, x1 + mx)), int(min(h, y1 + my))
        crop = gray[cy0:cy1, cx0:cx1]
        quad = (find_quadrilateral_border(crop) + np.float32([cx0, cy0])).astype(np.float32)
    else:
        quad = find_quadrilateral_border(gray)
    native, _, _ = warp_to_rectangle(image, quad)
    board = RectifiedBoard(warped=normalize_cell_scale(native), quad=quad, native=native)
    if not flatten:
        return board
    from puzzle_parsers.flatten import flatten_board  # flatten imports this module

    return flatten_board(image, board, line_image=border_image, debug_dir=debug_dir)


@dataclass
class RectifiedBoard:
    """A board found and warped flat, at two resolutions.

    Grid finding runs on ``warped`` (normalised cell size, so pixel-sized
    kernels behave the same for every source). Clue reading stays on
    ``native``: OCR, wall-thickness and fill thresholds were tuned on source
    pixels, and resampling a 39px-cell board to 72px blurred thin walls into
    thick ones (heyawake) and flipped digit reads.
    """

    warped: NDArray
    quad: NDArray
    native: NDArray

    def to_native(self, grid: BoardGrid) -> BoardGrid:
        """Re-express a grid found on ``warped`` on the ``native`` board."""
        nh, nw = self.native.shape[:2]
        wh, ww = self.warped.shape[:2]
        if (nh, nw) == (wh, ww):
            return BoardGrid(warped=self.native, h_lines=grid.h_lines, v_lines=grid.v_lines, quad=grid.quad)
        sy, sx = nh / wh, nw / ww
        return BoardGrid(
            warped=self.native,
            h_lines=[int(round(y * sy)) for y in grid.h_lines],
            v_lines=[int(round(x * sx)) for x in grid.v_lines],
            quad=grid.quad,
        )


def estimate_cell_pitch(warped_gray: NDArray) -> float | None:
    """Cell pitch (px) of a rectified board, or ``None`` if it can't be trusted.

    Reads each axis's ink projection by autocorrelation (phase-free, so drift
    and clue clutter don't matter) and requires the two axes to agree. When
    they don't, retries on halved copies (see ``_PITCH_MIN_SIDE``).
    """
    gray, factor = warped_gray, 1.0
    while True:
        pitch = _pitch_at_scale(gray)
        if pitch is not None:
            return pitch * factor
        if min(gray.shape[:2]) < 2 * _PITCH_MIN_SIDE:
            return None
        gray = cv2.resize(gray, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
        factor *= 2


def _pitch_at_scale(warped_gray: NDArray) -> float | None:
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )
    ink = (binary > 0).astype(np.float32)
    row_proj, col_proj = ink.sum(axis=1), ink.sum(axis=0)
    row_pitch = _projection_pitch(row_proj)
    col_pitch = _projection_pitch(col_proj)
    if not row_pitch or not col_pitch:
        return None
    if max(row_pitch, col_pitch) / min(row_pitch, col_pitch) <= _PITCH_AXIS_AGREEMENT:
        return (row_pitch + col_pitch) / 2
    return _shared_pitch(min(row_pitch, col_pitch), row_proj, col_proj)


# A lag both axes repeat at, each with at least this autocorrelation, is the
# cell pitch even when one axis's strongest repeat is a multiple of it.
_SHARED_PITCH_MIN_AC = 0.3


def _autocorrelation(proj: NDArray) -> NDArray | None:
    p = proj - proj.mean()
    if not np.any(p):
        return None
    ac = np.correlate(p, p, "full")[len(p) - 1 :]
    return ac / ac[0]


def _shared_pitch(pitch: float, row_proj: NDArray, col_proj: NDArray) -> float | None:
    """``pitch`` if both axes repeat at it, else ``None``.

    Called when the axes disagree. A maze of one-cell corridors and one-cell
    walls (the 45x31 slalom at Android size) repeats every two cells along one
    axis more strongly than every cell, so that axis reads twice the pitch.
    The finer reading is the pitch when the other axis also peaks there.
    A finer reading that is a half-cell overtone (a digit centred between the
    lines) fails this: the other axis has a trough at half a cell.
    """
    from scipy.signal import find_peaks

    lags = []
    for ac in (_autocorrelation(row_proj), _autocorrelation(col_proj)):
        if ac is None:
            return None
        lo, hi = int(pitch * 0.9), min(len(ac) - 1, int(np.ceil(pitch * 1.1)))
        peaks, _ = find_peaks(ac[: hi + 2])
        peaks = [int(k) for k in peaks if lo <= k <= hi and ac[k] >= _SHARED_PITCH_MIN_AC]
        if not peaks:
            return None
        lags.append(max(peaks, key=lambda k: ac[k]))
    return float(np.mean(lags))


def normalize_cell_scale(warped: NDArray) -> NDArray:
    """Rescale a rectified board so a cell is ~``TARGET_CELL_PX`` wide."""
    gray = warped if warped.ndim == 2 else cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    pitch = estimate_cell_pitch(gray)
    if pitch is None:
        return warped
    h, w = warped.shape[:2]
    if MIN_CELL_PX <= pitch <= MAX_CELL_PX:
        return warped
    target = MIN_CELL_PX if pitch < MIN_CELL_PX else MAX_CELL_PX
    scale = min(target / pitch, _MAX_UPSCALE, _MAX_RECTIFIED_SIDE / max(h, w))
    if 0.9 <= scale <= 1.1:
        return warped
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
    return cv2.resize(warped, size, interpolation=interp)


def preprocess_dashed_lines(
    warped_gray: NDArray,
    *,
    erode_cross_size: int = 5,
    close_gap_size: int = 40,
) -> NDArray:
    """Convert dashed/dotted grid lines to a solid-like binary mask.

    Pipeline:
    1. Adaptive threshold to binarize
    2. Erode with small directional kernels to remove halftone dots
    3. Close with medium kernels to bridge dash gaps

    The returned mask can be passed as `preprocessed_mask` to detect_grid_lines().

    Args:
        warped_gray: Grayscale warped puzzle image.
        erode_cross_size: Size of the erosion kernel (removes dots smaller than this).
        close_gap_size: Size of the closing kernel (bridges dash gaps up to this length).

    Returns:
        Binary mask (255 = ink) with dashes bridged into continuous lines.
    """
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )

    # Erode in both directions to remove halftone dots
    h_erode_k = cv2.getStructuringElement(cv2.MORPH_RECT, (erode_cross_size, 1))
    v_erode_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, erode_cross_size))
    h_cleaned = cv2.erode(binary, h_erode_k)
    v_cleaned = cv2.erode(binary, v_erode_k)

    # Close in both directions to bridge dash gaps
    h_close_k = cv2.getStructuringElement(cv2.MORPH_RECT, (close_gap_size, 1))
    v_close_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, close_gap_size))
    h_closed = cv2.morphologyEx(h_cleaned, cv2.MORPH_CLOSE, h_close_k)
    v_closed = cv2.morphologyEx(v_cleaned, cv2.MORPH_CLOSE, v_close_k)

    # Combine both directions
    return cv2.bitwise_or(h_closed, v_closed)


def _projection_pitch(proj: NDArray) -> float | None:
    """Grid pitch (px) from the autocorrelation of an ink projection.

    Unlike the lattice fit this ignores phase, so it survives lines that drift
    off a straight uniform grid. Takes the smallest lag nearly as strong as the
    strongest one, so 2x/3x multiples of the pitch can't win; returns ``None``
    when no lag in the plausible 4..64-cell range stands out.
    """
    from scipy.signal import find_peaks

    span = len(proj)
    ac = _autocorrelation(proj)
    if ac is None:
        return None
    lo, hi = max(3, span // 64), span // 4
    peaks, _ = find_peaks(ac[: hi + 1], distance=max(2, lo // 2))
    peaks = [int(k) for k in peaks if k >= lo]
    if not peaks:
        return None
    best = max(ac[k] for k in peaks)
    if best <= 0:
        return None
    return float(next(k for k in peaks if ac[k] >= 0.7 * best))


# How far (fraction of a cell) a line may move to follow the ink once the count
# is known. Large enough for a curved page's drift (~0.1 cell on the fillomino
# photo), small enough that a dense clue column can't capture the line.
_FOLLOW_INK_FRAC = 0.12


def _lattice_candidates_1d(
    proj: NDArray,
    span: int,
    *,
    n_min: int = 4,
    n_max: int = 64,
    band: int | None = None,
    weak_pct: int = 15,
    ratio: float = 2.0,
    floor: float = 0.02,
) -> list[int]:
    """Every cell count whose uniform comb passes the weak-tooth test.

    Because step-2 gives a reliable axis-aligned border, the ``count-1`` interior
    grid lines sit at fixed phase ``i*span/count``. For each candidate count we lay
    that uniform "comb" and require the *weakest* tooth (the ``weak_pct``-percentile
    of per-tooth peak ink) to clearly beat the off-tooth background. The caller
    picks among the counts that pass (``find_grid_lines``: the one nearest the
    autocorrelation pitch). Why the test itself resists octave traps:

    - An overtone (2N) drops half its teeth into empty cell interiors, so its weak
      tooth is near-zero and it fails the test.
    - A sub-harmonic (N/2) passes the test, but so does the true N.

    Unlike peak detection, this reads the *raw* projection, so clue clutter (which
    does not sit on a consistent pitch) cannot inject spurious lines. Returns
    ``[]`` when no count qualifies (e.g. a bowed scan where the ink no longer
    lands at a single uniform phase).
    """
    if band is None:
        # Boards arrive at ~TARGET_CELL_PX per cell (rectify_board), so a fixed
        # band is a fixed fraction of a cell: ~5.5%. The old 2px band was tuned
        # at native scan scale and refused boards once they were upscaled.
        band = max(2, round(TARGET_CELL_PX * _LATTICE_BAND_FRAC))
    m = float(proj.max())
    if m <= 0:
        return []
    proj = proj / m

    passing: list[int] = []
    for n in range(n_min, n_max + 1):
        pitch = span / n
        on = np.zeros(span, dtype=bool)
        teeth: list[float] = []
        for i in range(1, n):
            c = int(round(i * pitch))
            lo = max(0, c - band)
            hi = min(span, c + band + 1)
            on[lo:hi] = True
            teeth.append(float(proj[lo:hi].max()))
        if on.all() or not on.any() or not teeth:
            continue
        off = float(proj[~on].mean())
        if np.percentile(teeth, weak_pct) > off * ratio + floor:
            passing.append(n)
    return passing


def find_grid_lines(
    warped_gray: NDArray, *, size: tuple[int, int] | None = None
) -> tuple[list[int], list[int]]:
    """The shared grid finder: ``(h_lines, v_lines)`` on ``warped_gray``.

    1. Work at exactly ``TARGET_CELL_PX`` per cell (resampled from the
       estimated pitch), so the lattice band is always the same fraction of a
       cell. Readers never see this copy.
    2. Per axis, list every count whose uniform comb passes the lattice test
       and take the one nearest ``span / pitch``. "Largest passing" alone
       picked 2x/3x overtones on boards with a digit centred in every cell
       (hitori 8x8 read 8x16).
    3. No count passes (rows of black cells, a bowed page): count from the
       pitch. One axis still unknown: square cells give it.
    3b. Cells are square, so one axis's cells far larger than the other's
       mean that axis lost lines; it is recounted from the finer axis (see
       ``_square_cell_recount``).
    4. Lines start evenly spaced, then each follows the ink within 12% of a
       cell (a curved page drifts ~0.1 cell).

    ``size=(rows, cols)`` skips counting for fixed-size boards. Falls back to
    peak detection only when nothing above yields a count.
    """
    h, w = warped_gray.shape[:2]
    pitch = estimate_cell_pitch(warped_gray)
    scale = 1.0
    if pitch:
        scale = min(TARGET_CELL_PX / pitch, _MAX_UPSCALE, _MAX_RECTIFIED_SIDE / max(h, w))
        if 0.9 <= scale <= 1.1:
            scale = 1.0
    work = warped_gray if scale == 1.0 else cv2.resize(
        warped_gray, (max(1, round(w * scale)), max(1, round(h * scale))),
        interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC,
    )
    wh, ww = work.shape[:2]
    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(work, (3, 3), 0),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
    )
    ink = (binary > 0).astype(np.float32)
    projs = (ink.sum(axis=1), ink.sum(axis=0))
    work_pitch = pitch * scale if pitch else None

    spans = (wh, ww)
    cands = [_lattice_candidates_1d(proj, span) for proj, span in zip(projs, spans)]
    counts: list[int | None] = []
    for c, span in zip(cands, spans):
        if c:
            counts.append(
                min(c, key=lambda n: abs(n - span / work_pitch)) if work_pitch else max(c)
            )
        else:
            counts.append(max(2, round(span / work_pitch)) if work_pitch else None)
    if size is None:
        counts = _square_cell_recount(counts, cands, spans, projs)
    rows, cols = size if size else (counts[0], counts[1])
    if rows is None and cols is not None:
        rows = max(2, round(wh / (ww / cols)))
    elif cols is None and rows is not None:
        cols = max(2, round(ww / (wh / rows)))
    if rows is None or cols is None:
        return detect_grid_lines(warped_gray, w, h)

    h_work = _track_ink(projs[0], _border_follow_ink(projs[0], uniform_grid(wh, rows)))
    v_work = _track_ink(projs[1], _border_follow_ink(projs[1], uniform_grid(ww, cols)))
    sy, sx = h / wh, w / ww
    h_lines = [int(round(y * sy)) for y in h_work]
    v_lines = [int(round(x * sx)) for x in v_work]
    return h_lines, v_lines


# Two axes whose cells differ by more than this are not both right: missing
# lines only ever make cells look larger, so the finer axis wins. Below it a
# gently warped scan keeps each axis's own count (cells a few % off square).
_SQUARE_CELL_TOL = 0.15


def _square_cell_recount(
    counts: list[int | None],
    cands: list[list[int]],
    spans: tuple[int, int],
    projs: tuple[NDArray, NDArray],
) -> list[int | None]:
    """Recount an axis whose cells come out far larger than the other axis's.

    When only the bold every-5 separators pass the lattice test on one axis
    (a soft or downscaled nonogram: 25x5), its only passing count is a
    sub-multiple and implies cells 5x the other axis's. Recount that axis at
    its own autocorrelation pitch when that agrees with the finer axis's
    cells (a scan's cells can be a few % off square: nonogram-medium is 75 x
    73 px, and the other axis's size rounds 24.6 columns down), else at the
    finer axis's cell size: the passing count nearest it, else span over it.
    Boards whose axes agree are untouched.
    """
    if counts[0] is None or counts[1] is None:
        return counts
    cells = [spans[i] / counts[i] for i in (0, 1)]
    if max(cells) <= min(cells) * (1 + _SQUARE_CELL_TOL):
        return counts
    coarse = int(cells[1] > cells[0])
    cell = min(cells)
    own = _projection_pitch(projs[coarse])
    if own and abs(own - cell) <= _SQUARE_CELL_TOL * cell:
        cell = own
    target = spans[coarse] / cell
    near = [n for n in cands[coarse] if abs(n - target) <= _SQUARE_CELL_TOL * target]
    out = list(counts)
    out[coarse] = min(near, key=lambda n: abs(n - target)) if near else max(2, round(target))
    return out


def _track_ink(proj: NDArray, lines: list[int]) -> list[int]:
    """Place the interior lines by tracking the ink from each border inward.

    Each line is searched within ``_FOLLOW_INK_FRAC`` of a cell around
    *the previous line plus one pitch*, not around its evenly spaced slot, so a
    bowed page whose middle rows sit ~0.25 cell off an even grid (picto link
    big) is followed one small step at a time. A top-down and a bottom-up pass
    anchor both borders; each line keeps whichever pass found more ink.
    """
    n = len(lines) - 1
    if n < 2:
        return lines
    pitch = (lines[-1] - lines[0]) / n
    tol = max(1, int(round(pitch * _FOLLOW_INK_FRAC)))
    smooth = np.convolve(proj, np.ones(3) / 3, "same")
    size = len(smooth)

    def peak_near(expected: float, step: float = 0.0) -> int:
        lo = max(0, int(round(expected)) - tol)
        hi = min(size, int(round(expected)) + tol + 1)
        if hi <= lo:
            return int(round(expected))
        score = smooth[lo:hi].copy()
        if step:
            ahead = np.arange(lo, hi) + int(round(step))
            score += smooth[np.clip(ahead, 0, size - 1)]
        return lo + int(np.argmax(score))

    # The first step off each border also scores the line one cell further
    # in: a thick border thresholds to two edges, so the pass starts from the
    # outer one and its window reaches a row of clue-disc outlines (kakuro),
    # which out-ink the faint line between two shaded cells.
    down = [lines[0]]
    for i in range(1, n):
        down.append(peak_near(down[-1] + pitch, pitch if i == 1 and n > 2 else 0.0))
    up = [lines[-1]]
    for i in range(1, n):
        up.append(peak_near(up[-1] - pitch, -pitch if i == 1 and n > 2 else 0.0))
    up = up[::-1]

    inner = [d if smooth[d] >= smooth[u] else u for d, u in zip(down[1:], up)]

    # A pass never checks its last step against the far border. On a kakuro
    # whose first column is all shaded clue cells the line between two grey
    # cells is faint, and the bottom-up pass took the clue discs' outlines
    # 0.78 cell from the border, halving the column's clues. So the line next
    # to each border keeps the pass anchored on that border when the other
    # pass's pick is off a cell from it.
    def off(gap: float) -> bool:
        return abs(gap - pitch) > tol

    if off(inner[0] - lines[0]) and not off(down[1] - lines[0]):
        inner[0] = down[1]
    if off(lines[-1] - inner[-1]) and not off(lines[-1] - up[-1]):
        inner[-1] = up[-1]
    return [lines[0], *inner, lines[-1]]


def _border_follow_ink(proj: NDArray, lines: list[int]) -> list[int]:
    """Move the two outer lines onto the border's ink, searching inward only.

    The warp puts the board's outer edge at the image edge, but the thick
    border line's centre sits a few px inside it; detectors that sample walls
    or crop edge cells want the centre (peak detection used to find it).
    """
    if len(lines) < 3:
        return lines
    pitch = (lines[-1] - lines[0]) / (len(lines) - 1)
    tol = max(1, int(round(pitch * _FOLLOW_INK_FRAC)))
    smooth = np.convolve(proj, np.ones(3) / 3, "same")
    n = len(smooth)
    first = int(np.argmax(smooth[: tol + 1]))
    last = n - 1 - tol + int(np.argmax(smooth[n - 1 - tol:]))
    return [first, *lines[1:-1], last]


def uniform_grid(span: int, count: int) -> list[int]:
    """Synthesise ``count+1`` perfectly uniform line positions across ``span``.

    Once the count is known and the border is rectified, the square-cell fact makes
    the individual detected peak positions redundant (and, on degraded scans,
    actively harmful — they jitter off the true grid). Emitting an exactly uniform
    grid ``line[i] = round(i*span/count)`` discards that jitter entirely.
    """
    return [int(round(i * span / count)) for i in range(count + 1)]


def detect_grid_lines(
    warped_gray: NDArray, warp_w: int, warp_h: int,
    *,
    preprocessed_mask: NDArray | None = None,
) -> tuple[list[int], list[int]]:
    """Detect all horizontal and vertical grid lines via morphological projection.

    Uses a two-pass approach: first detects lines with a conservative kernel to
    estimate cell size, then re-detects with adaptive parameters tuned to the
    actual cell density.

    Args:
        warped_gray: Grayscale warped puzzle image.
        warp_w: Width of the warped image.
        warp_h: Height of the warped image.
        preprocessed_mask: Optional pre-binarized mask (e.g., from
            preprocess_dashed_lines). If provided, skips internal binarization.
    """
    if preprocessed_mask is not None:
        binary = preprocessed_mask
    else:
        binary = cv2.adaptiveThreshold(
            cv2.GaussianBlur(warped_gray, (3, 3), 0),
            255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 3,
        )

    h_lines = _detect_lines_1d(binary, axis="h", img_len=warp_w, img_span=warp_h)
    v_lines = _detect_lines_1d(binary, axis="v", img_len=warp_h, img_span=warp_w)

    return h_lines, v_lines


def _detect_lines_1d(
    binary: NDArray, axis: str, img_len: int, img_span: int,
) -> list[int]:
    """Detect grid lines along one axis with adaptive parameters.

    Uses progressively shorter morphological kernels until a consistent grid
    emerges. Picks the kernel that yields the most regular spacing (quasi-square
    cells). Then merges double-detections from thick lines.

    Args:
        binary: binarized image (ink=255)
        axis: "h" for horizontal lines, "v" for vertical
        img_len: length along the line direction (width for h, height for v)
        img_span: span perpendicular to lines (height for h, width for v)
    """
    kernel_fractions = [1/4, 1/6, 1/8, 1/12, 1/16, 1/20, 1/30]

    best_result: list[int] = []
    best_regularity = float("inf")

    for frac in kernel_fractions:
        min_line_len = max(20, int(img_len * frac))

        if axis == "h":
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (min_line_len, 1))
            mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            projection = mask.sum(axis=1) / 255
        else:
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_line_len))
            mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            projection = mask.sum(axis=0) / 255

        # Pad with zeros so find_peaks can detect boundary plateaus
        padded = np.concatenate([[0], projection, [0]])
        peaks, _ = find_peaks(
            padded, height=img_len * 0.03, distance=3
        )
        peaks = peaks - 1  # undo padding offset

        if len(peaks) < 3:
            continue

        # Adaptive merge: find the natural gap between double-detection
        # spacings and true cell spacings
        merge_gap = _estimate_merge_gap(peaks.tolist(), img_span)
        merged = merge_close_peaks(peaks.tolist(), min_gap=merge_gap)

        if len(merged) < 3:
            continue

        # Score regularity: coefficient of variation of spacings
        final_spacings = np.diff(merged)
        cv_score = float(np.std(final_spacings) / np.mean(final_spacings))

        # Prefer results with more lines AND good regularity.
        # Among results with similar regularity (cv < 0.15), prefer more lines.
        if cv_score < 0.15 and len(merged) > len(best_result):
            best_result = merged
            best_regularity = cv_score
        elif cv_score < best_regularity and len(merged) >= len(best_result):
            best_result = merged
            best_regularity = cv_score

    if len(best_result) < 2:
        # Absolute fallback: raw projection without morph
        if axis == "h":
            projection = binary.sum(axis=1) / 255
        else:
            projection = binary.sum(axis=0) / 255
        peaks, _ = find_peaks(projection, height=img_len * 0.2, distance=img_span // 20)
        return merge_close_peaks(peaks.tolist(), min_gap=max(3, img_span // 50))

    if best_regularity > 0.15 and len(best_result) >= 3:
        spacings = np.diff(best_result)
        median_sp = float(np.median(spacings))
        re_merged = merge_close_peaks(best_result, min_gap=int(median_sp * 0.6))
        if len(re_merged) >= 3:
            re_cv = float(np.std(np.diff(re_merged)) / np.mean(np.diff(re_merged)))
            if re_cv < best_regularity:
                best_result = re_merged

    best_result = _split_large_gaps(best_result)
    return best_result


def _split_large_gaps(lines: list[int]) -> list[int]:
    """Insert midpoints for gaps that are ~2x the median spacing (missed lines)."""
    if len(lines) < 3:
        return lines
    spacings = np.diff(lines)
    median_sp = float(np.median(spacings))
    if median_sp < 1:
        return lines
    result = [lines[0]]
    for i in range(1, len(lines)):
        gap = lines[i] - lines[i - 1]
        n_cells = round(gap / median_sp)
        if n_cells >= 2:
            for k in range(1, n_cells):
                result.append(lines[i - 1] + int(k * gap / n_cells))
        result.append(lines[i])
    return result


def _estimate_merge_gap(peaks: list[int], img_span: int) -> int:
    """Find the merge gap that separates double-detections from true cell spacings.

    Looks for the largest jump in sorted pairwise spacings — anything below
    that jump is a double-detection, anything above is a real cell boundary.
    """
    if len(peaks) < 3:
        return max(3, img_span // 50)

    spacings = sorted(np.diff(peaks).tolist())
    if not spacings:
        return max(3, img_span // 50)

    # Find the largest relative gap in the sorted spacings
    best_gap_idx = 0
    best_gap_ratio = 0.0
    for i in range(len(spacings) - 1):
        if spacings[i] == 0:
            continue
        ratio = spacings[i + 1] / spacings[i]
        if ratio > best_gap_ratio:
            best_gap_ratio = ratio
            best_gap_idx = i

    # If there's a clear jump (>2x), merge threshold is midway between
    # the last small spacing and the first large one
    if best_gap_ratio > 2.0:
        merge_threshold = (spacings[best_gap_idx] + spacings[best_gap_idx + 1]) // 2
        return max(3, merge_threshold)

    # No clear bimodal split — use a fraction of median spacing
    median_spacing = float(np.median(spacings))
    return max(3, int(median_spacing * 0.4))


def merge_close_peaks(lines: list[int], min_gap: int = 10) -> list[int]:
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


# Wall widths are measured on the dark run that contains the grid line itself,
# seeded at the darkest pixel within this fraction of a cell of the found line.
# The old "longest dark run within +-30% of a cell" measured the bottom stroke
# of a clue digit sitting just above a thin wall (heyawake read 13-16 such
# walls thick per board).
_WALL_SEED_FRAC = 0.12
# Half-width of the cross-line profile scan, as a fraction of a cell.
_WALL_SCAN_FRAC = 0.3
# A wall's width is this percentile of its (up to 7) point widths rather than
# the median: a clue digit sitting on a thin wall covers the middle points
# only (heyawake-titled h6,14 read 4.3, 4.5, 5.1 px off the digit and 9.9-17.4
# px under it).
_WALL_PCT = 40


def classify_border_thickness(
    warped_gray: NDArray, grid: BoardGrid, debug_dir: str | None = None
) -> tuple[list[list[int]], list[list[int]]]:
    """Classify each internal wall of a room board as thick (1) or thin (0).

    1. Measure every wall's width (sub-pixel, on the run through the line).
    2. Split widths into two classes: Otsu on this board's widths, or the
       density valley between Otsu's two classes, whichever leaves fewer thick
       walls dead-ending mid-board (see ``_valley_between_classes``).
    3. Rooms are closed, so a thick wall can't end in the middle of the board:
       where one does, flip the least certain wall at that corner (see
       ``_close_dangling_walls``).

    Returns (h_borders, v_borders):
      h_borders: (rows-1) x cols — border below cell[r][c]
      v_borders: rows x (cols-1) — border right of cell[r][c]
    """
    h_lines, v_lines, rows, cols = grid.h_lines, grid.v_lines, grid.rows, grid.cols
    h_widths, v_widths = _wall_widths(warped_gray, grid)
    widths = [w for row in h_widths for w in row] + [w for row in v_widths for w in row]
    otsu = _find_thickness_threshold(widths)
    # Two candidate cuts; rooms are closed, so keep the one that leaves fewer thick
    # walls dead-ending mid-board (ties keep Otsu).
    best: tuple[int, float, list[list[int]], list[list[int]]] | None = None
    for threshold in (otsu, _valley_between_classes(np.array([w for w in widths if w > 0]), otsu)):
        h_try = [[int(w > threshold) for w in row] for row in h_widths]
        v_try = [[int(w > threshold) for w in row] for row in v_widths]
        dangling = len(_dangling_corners(h_try, v_try))
        if best is None or dangling < best[0]:
            best = (dangling, threshold, h_try, v_try)
    _, threshold, h_borders, v_borders = best
    _close_dangling_walls(h_borders, v_borders, h_widths, v_widths, threshold)

    if debug_dir:
        vis = grid.warped.copy()
        for r in range(rows - 1):
            for c in range(cols):
                if h_borders[r][c]:
                    cv2.line(vis, (v_lines[c], h_lines[r + 1]), (v_lines[c + 1], h_lines[r + 1]), (0, 0, 255), 2)
        for r in range(rows):
            for c in range(cols - 1):
                if v_borders[r][c]:
                    cv2.line(vis, (v_lines[c + 1], h_lines[r]), (v_lines[c + 1], h_lines[r + 1]), (255, 0, 0), 2)
        cv2.imwrite(str(Path(debug_dir) / "04_thick_borders.png"), vis)

    return h_borders, v_borders


def _wall_widths(warped_gray: NDArray, grid: BoardGrid) -> tuple[list[list[float]], list[list[float]]]:
    """Width of every internal wall: (rows-1) x cols below each cell, rows x (cols-1) right of it."""
    h_lines, v_lines, rows, cols = grid.h_lines, grid.v_lines, grid.rows, grid.cols
    scan_h = max(5, int(grid.cell_h * _WALL_SCAN_FRAC))
    scan_w = max(5, int(grid.cell_w * _WALL_SCAN_FRAC))
    seed_h = max(2, int(round(grid.cell_h * _WALL_SEED_FRAC)))
    seed_w = max(2, int(round(grid.cell_w * _WALL_SEED_FRAC)))
    h_widths = [
        [
            _measure_border_width_gray(
                warped_gray, "h", h_lines[r + 1], v_lines[c], v_lines[c + 1], scan_h, seed_h
            )
            for c in range(cols)
        ]
        for r in range(rows - 1)
    ]
    v_widths = [
        [
            _measure_border_width_gray(
                warped_gray, "v", v_lines[c + 1], h_lines[r], h_lines[r + 1], scan_w, seed_w
            )
            for c in range(cols - 1)
        ]
        for r in range(rows)
    ]
    return h_widths, v_widths


# A run wider than this many cells can't be a ruling: it is shading (the grey
# disc behind a skeleton board) or the line crossing the wall at its end.
_MAX_LINE_CELLS = 0.2
# A wall is a line when at least this share of its sample points see one.
_MIN_LINE_SAMPLES = 0.5


def classify_border_lines(
    warped_gray: NDArray, grid: BoardGrid
) -> tuple[list[list[int]], list[list[int]]]:
    """Classify every wall of the lattice, outer ones included: no line (0), thin (1) or thick (2).

    For boards whose lattice squares aren't all cells (skeleton puzzle): a thin
    line joins two cells, a thick one is the outline between a cell and a
    non-cell (or the board's edge), and two non-cells have no line. Each wall is
    sampled as in ``_measure_border_width_gray``, but a point that sees no
    ruling-width run counts against the wall instead of being skipped: next to a
    non-cell the end points catch the crossing outline, and on its own that read
    as a line. Thick vs thin is Otsu over the walls that are lines.

    Returns (h, v): h is (rows+1) x cols, the wall above cell[r][c] (row ``rows``
    is the bottom edge); v is rows x (cols+1), the wall left of cell[r][c].
    """
    h_lines, v_lines, rows, cols = grid.h_lines, grid.v_lines, grid.rows, grid.cols
    scan_h = max(5, int(grid.cell_h * _WALL_SCAN_FRAC))
    scan_w = max(5, int(grid.cell_w * _WALL_SCAN_FRAC))
    seed_h = max(2, int(round(grid.cell_h * _WALL_SEED_FRAC)))
    seed_w = max(2, int(round(grid.cell_w * _WALL_SEED_FRAC)))
    cap = _MAX_LINE_CELLS * min(grid.cell_w, grid.cell_h)

    def width(samples: list[float | None]) -> float:
        ruled = [x for x in samples if x is not None and x < cap]
        if not samples or len(ruled) < _MIN_LINE_SAMPLES * len(samples):
            return 0.0
        return float(np.percentile(ruled, _WALL_PCT))

    h_widths = [
        [
            width(_wall_width_samples(
                warped_gray, "h", h_lines[r], v_lines[c], v_lines[c + 1], scan_h, seed_h,
            ))
            for c in range(cols)
        ]
        for r in range(rows + 1)
    ]
    v_widths = [
        [
            width(_wall_width_samples(
                warped_gray, "v", v_lines[c], h_lines[r], h_lines[r + 1], scan_w, seed_w,
            ))
            for c in range(cols + 1)
        ]
        for r in range(rows)
    ]
    threshold = _find_thickness_threshold([w for row in h_widths + v_widths for w in row])

    def cls(w: float) -> int:
        if w <= 0:
            return 0
        return 2 if w > threshold else 1

    return [[cls(w) for w in row] for row in h_widths], [[cls(w) for w in row] for row in v_widths]


def _dangling_corners(h: list[list[int]], v: list[list[int]]) -> list[tuple[int, int]]:
    """Interior grid corners where exactly one thick wall meets (a dead end).

    Corner (r, c) joins h[r][c], h[r][c+1] (left/right) and v[r][c], v[r+1][c]
    (above/below).
    """
    rows, cols = len(v), len(h[0]) if h else 0
    return [
        (r, c)
        for r in range(rows - 1)
        for c in range(cols - 1)
        if h[r][c] + h[r][c + 1] + v[r][c] + v[r + 1][c] == 1
    ]


def _close_dangling_walls(
    h: list[list[int]],
    v: list[list[int]],
    h_widths: list[list[float]],
    v_widths: list[list[float]],
    threshold: float,
) -> None:
    """Repair dead-end thick walls in place.

    Some walls measure between the two classes (norinori-medium: 28 of 600
    walls fall between the thin and thick clusters, and its real split lies
    between 3.44 and 3.78 px). At every dead end, the candidates are the four
    walls meeting there; flip the one whose width is closest to the threshold,
    as long as the flip lowers the number of dead ends. Repeat until none are
    left or no flip helps.
    """
    walls = {"h": (h, h_widths), "v": (v, v_widths)}
    count = len(_dangling_corners(h, v))
    for _ in range(4 * count):
        if count == 0:
            return
        options: list[tuple[float, str, int, int]] = []
        for r, c in _dangling_corners(h, v):
            for kind, wr, wc in (("h", r, c), ("h", r, c + 1), ("v", r, c), ("v", r + 1, c)):
                options.append((abs(walls[kind][1][wr][wc] - threshold), kind, wr, wc))
        for _, kind, wr, wc in sorted(set(options)):
            grid = walls[kind][0]
            grid[wr][wc] ^= 1
            after = len(_dangling_corners(h, v))
            if after < count:
                count = after
                break
            grid[wr][wc] ^= 1
        else:
            return


def _measure_border_width_gray(
    gray: NDArray,
    axis: str,
    line_pos: int,
    start: int,
    end: int,
    scan_range: int,
    seed_range: int,
) -> float:
    """Width (px, sub-pixel) of the wall at ``line_pos`` between ``start``/``end``.

    At up to 7 points along the wall, take the cross-line profile (minimum over
    3 px along the wall, which bridges dashes), seed at the darkest pixel within
    ``seed_range`` of the line, and measure the run darker than halfway between
    that pixel and the local paper, with linear interpolation at both edges.
    The points are combined with ``_WALL_PCT``.
    Whole-pixel runs left thick and thin a value or two apart and Otsu's split
    jumped between them (norinori-medium flipped ~157 walls between settings).
    Returns 0.0 when no point has contrast.
    """
    samples = [x for x in _wall_width_samples(gray, axis, line_pos, start, end, scan_range, seed_range) if x is not None]
    return float(np.percentile(samples, _WALL_PCT)) if samples else 0.0


def _wall_width_samples(
    gray: NDArray,
    axis: str,
    line_pos: int,
    start: int,
    end: int,
    scan_range: int,
    seed_range: int,
) -> list[float | None]:
    """The per-point widths behind ``_measure_border_width_gray``; None where a point has no line."""
    h, w = gray.shape
    num_samples = max(3, min(7, (end - start) // 10))
    samples: list[float | None] = []

    for i in range(num_samples):
        pos = start + (end - start) * (i + 1) // (num_samples + 1)
        if axis == "h":
            lo = max(0, line_pos - scan_range)
            strip = gray[lo:min(h, line_pos + scan_range), max(0, pos - 1): pos + 2].min(axis=1)
        else:
            lo = max(0, line_pos - scan_range)
            strip = gray[max(0, pos - 1): pos + 2, lo:min(w, line_pos + scan_range)].min(axis=0)
        strip = strip.astype(float)
        if strip.size == 0:
            samples.append(None)
            continue
        paper = float(strip.max())
        if paper - float(strip.min()) < 20:
            samples.append(None)
            continue
        centre = line_pos - lo
        s0, s1 = max(0, centre - seed_range), min(len(strip), centre + seed_range + 1)
        if s1 <= s0:
            samples.append(None)
            continue
        seed = s0 + int(np.argmin(strip[s0:s1]))
        thresh = strip[seed] + (paper - strip[seed]) * 0.5
        if strip[seed] >= thresh:
            samples.append(None)
            continue
        a = seed
        while a > 0 and strip[a - 1] < thresh:
            a -= 1
        b = seed
        while b < len(strip) - 1 and strip[b + 1] < thresh:
            b += 1
        width = float(b - a + 1)
        # Each edge pixel outside the run contributes the fraction of it that
        # lies below the threshold (linear interpolation), minus half a pixel.
        if a > 0:
            width += min(1.0, max(0.0, (thresh - strip[a]) / max(1e-6, strip[a - 1] - strip[a]))) - 0.5
        if b < len(strip) - 1:
            width += min(1.0, max(0.0, (thresh - strip[b]) / max(1e-6, strip[b + 1] - strip[b]))) - 0.5
        samples.append(width)

    return samples


# Smoothing for the thick/thin width histogram, as a fraction of the gap between
# the two class means (see _valley_between_classes). Wider smoothing drifts the
# valley toward the thick class: at 0.12 the 45x31 nurimaze photo's 5.21 px wall
# fell under a 5.29 px cut and the solver proved the board impossible.
_VALLEY_BANDWIDTH = 0.08


def _find_thickness_threshold(widths: list[float]) -> float:
    """Find threshold to separate thick from thin borders using Otsu's method.

    Finds the threshold that minimizes within-class variance of the width
    distribution — the optimal bimodal split regardless of which class is
    larger. Works for nurimaze where thick borders are typically the majority.
    """
    if not widths:
        return 3.0

    arr = np.array(widths)
    arr = arr[arr > 0]

    if len(arr) < 2:
        return 3.0

    unique_vals = np.unique(arr)
    if len(unique_vals) < 2:
        return float(unique_vals[0]) + 1.0

    n = len(arr)
    best_thresh = float(unique_vals[len(unique_vals) // 2])
    best_var = float("inf")

    for i in range(len(unique_vals) - 1):
        t = (unique_vals[i] + unique_vals[i + 1]) / 2
        c0 = arr[arr <= t]
        c1 = arr[arr > t]
        if len(c0) == 0 or len(c1) == 0:
            continue
        w0 = len(c0) / n
        w1 = len(c1) / n
        var = w0 * c0.var() + w1 * c1.var()
        if var < best_var:
            best_var = var
            best_thresh = t

    return best_thresh


def _valley_between_classes(arr: NDArray, otsu: float) -> float:
    """Move Otsu's cut to the emptiest point between the two class means.

    Otsu minimises within-class variance, so a wide, heavy class pulls the cut
    into itself: on the 45x31 nurimaze photo thick walls measure 5-11 px and
    thin ones 2-4 px, with only 8 of ~2,700 walls in the 4-5 px gap, yet Otsu
    cut at 6.1 px and called a hundred thick walls thin. The density valley
    between the class means is where the classes actually part. It is only a
    candidate: on a noisy scan with a wide, sparse gap (norinori-medium) any
    point of the gap is a valley and Otsu's cut is the right one, so
    ``classify_border_thickness`` keeps whichever closes rooms better. The histogram
    is smoothed with a bandwidth relative to the class separation, so the cut
    doesn't depend on the photo's resolution; a flat-bottomed valley takes its
    middle.
    """
    lo_cls, hi_cls = arr[arr <= otsu], arr[arr > otsu]
    if len(lo_cls) == 0 or len(hi_cls) == 0:
        return otsu
    m0, m1 = float(lo_cls.mean()), float(hi_cls.mean())
    if m1 - m0 <= 0:
        return otsu
    bw = max(0.15, _VALLEY_BANDWIDTH * (m1 - m0))
    xs = np.linspace(m0, m1, 200)
    density = np.exp(-0.5 * ((xs[:, None] - arr[None, :]) / bw) ** 2).sum(axis=1)
    lowest = density.min()
    flat = xs[density <= lowest * 1.0001 + 1e-9]
    return float((flat[0] + flat[-1]) / 2)
