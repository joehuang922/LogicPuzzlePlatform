"""Shared lattice fitting for boards whose grid isn't a bordered rectangle.

Used by Picturesque Maze (walls on an unprinted lattice) and Irregular Nonogram (a
staircase figure of board and clue cells). Both locate their figure as the largest block
of ink and hand ``rectify_board`` a frame drawn around it (``figure_frame_image``), then
fit lattice lines with ``comb_pitch`` and ``dp_lines``.
"""
from __future__ import annotations

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.signal import find_peaks

from puzzle_parsers.grid_utils import ink_intensity

# Closing kernel (fraction of the image's long side) that bridges the one-cell
# entrance/exit gaps when locating the maze. Cells measured 0.5-0.9% of the long side.
_LOCATE_CLOSE = 0.012
# Margin (fraction of the long side) between the maze and the frame handed to
# rectify_board. Cells measured 0.5-0.9% of the long side; bows up to ~1 cell.
_FRAME_MARGIN = 0.006
# A step between neighbouring lattice lines may differ from the mean by this
# fraction (a curled page compresses cells near the spine).
_STEP_SLACK = 0.2


def figure_frame_image(image: NDArray) -> NDArray:
    """Grayscale image for ``rectify_board``: the maze's ink with a closed outline."""
    ink = ink_intensity(image)
    long_side = max(ink.shape[:2])
    dark = dark_mask(ink, 31)
    k = max(3, int(long_side * _LOCATE_CLOSE))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
    closed = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, kernel)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(closed, 8)
    if n < 2:
        return ink
    best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    block = (labels == best).astype(np.uint8) * 255
    # Open away thin attachments: a page rule or a caption touching the border.
    block = cv2.morphologyEx(block, cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(block, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return ink
    outline = max(contours, key=cv2.contourArea)
    region = np.zeros_like(block)
    cv2.drawContours(region, [outline], -1, 255, -1)
    out = np.where(region > 0, ink, 255).astype(np.uint8)
    # The board's frame: the block's rotated bounding box grown by a margin, so
    # a border bowing past the four-corner chord (a curled page) stays inside
    # the warp. The lattice is anchored on the printed border later.
    (cx, cy), (bw, bh), angle = cv2.minAreaRect(outline)
    margin = 2 * long_side * _FRAME_MARGIN
    box = cv2.boxPoints(((cx, cy), (bw + margin, bh + margin), angle))
    h, w = ink.shape[:2]
    box[:, 0] = np.clip(box[:, 0], 1, w - 2)
    box[:, 1] = np.clip(box[:, 1], 1, h - 2)
    cv2.polylines(out, [np.round(box).astype(np.int32).reshape(-1, 1, 2)], True, 0, max(2, long_side // 800))
    return out


def dark_mask(gray: NDArray, block: int) -> NDArray:
    return cv2.adaptiveThreshold(
        cv2.GaussianBlur(gray, (3, 3), 0), 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block | 1, 10,
    )


def strokes(dark: NDArray, horizontal: bool, length: int) -> NDArray:
    """Ink runs at least ``length`` px long along one axis (wall strokes)."""
    size = (length, 1) if horizontal else (1, length)
    return cv2.morphologyEx(dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, size))


def comb_pitch(proj: NDArray) -> float | None:
    """First strong autocorrelation peak of a projection, sub-pixel."""
    p = proj.astype(np.float64) - proj.mean()
    if not np.any(p):
        return None
    ac = np.correlate(p, p, "full")[len(p) - 1:]
    ac /= ac[0]
    peaks, _ = find_peaks(ac[: max(8, len(ac) // 4)], height=0.3)
    peaks = [int(k) for k in peaks if k >= 4]
    if not peaks:
        return None
    i = peaks[0]
    a, b, c = ac[i - 1], ac[i], ac[i + 1]
    denom = a - 2 * b + c
    return float(i + (0.5 * (a - c) / denom if denom else 0.0))


def dp_lines(prof: NDArray, first: float, last: float, n: int) -> tuple[NDArray, float]:
    """``n + 1`` line positions from ``first`` to ``last`` with every step within
    ``_STEP_SLACK`` of the mean, placed on the most ink (Viterbi over the profile).
    Returns the positions and the mean ink at the interior lines."""
    a, b = int(round(first)), int(round(last))
    span = b - a
    if span < n * 2:
        return np.linspace(first, last, n + 1), 0.0
    step = span / n
    lo, hi = max(1, int(np.floor(step * (1 - _STEP_SLACK)))), int(np.ceil(step * (1 + _STEP_SLACK)))
    seg = prof[a: b + 1]
    neg = -1e18
    score = np.full(span + 1, neg)
    score[0] = 0.0
    back = np.zeros((n, span + 1), dtype=np.int32)
    for i in range(1, n + 1):
        best = np.full(span + 1, neg)
        arg = np.zeros(span + 1, dtype=np.int32)
        for d in range(lo, hi + 1):
            cand = np.full(span + 1, neg)
            cand[d:] = score[: span + 1 - d]
            better = cand > best
            best[better] = cand[better]
            arg[better] = d
        if i < n:
            best = best + seg
        score, back[i - 1] = best, arg
    if score[span] <= neg / 2:
        return np.linspace(first, last, n + 1), 0.0
    pos = [span]
    for i in range(n, 0, -1):
        pos.append(pos[-1] - back[i - 1][pos[-1]])
    pos = np.array(pos[::-1], dtype=np.float64) + a
    return pos, float(score[span] / max(1, n - 1))
