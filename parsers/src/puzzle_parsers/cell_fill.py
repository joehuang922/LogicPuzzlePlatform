"""Shared "is this cell filled (black)?" test for grid parsers.

A filled cell is judged by the *fraction* of dark pixels in its crop, not the
mean brightness: a filled cell carrying a white digit (akari walls, shakashaka
blacks) has its mean pulled up to the threshold by the digit, so a mean test
flips on a few pixels of crop shift (shakashaka's edge blacks sat at mean
98-101 against a threshold of 100). The dark fraction stays ~0.5-1.0 for filled
cells, digit or not, and ~0.0 for empty ones.
"""
from __future__ import annotations

import cv2
import numpy as np
from numpy.typing import NDArray

# A pixel counts as dark below this grey level.
DARK_PIXEL_VALUE = 100
# A cell is filled when more than this fraction of its crop is dark.
FILLED_DARK_FRACTION = 0.35


def dark_fraction(roi: NDArray) -> float:
    """Fraction of ``roi`` (grayscale) darker than ``DARK_PIXEL_VALUE``."""
    return float(np.mean(roi < DARK_PIXEL_VALUE)) if roi.size else 0.0


def is_filled(roi: NDArray) -> bool:
    """True when the cell crop ``roi`` is a filled (black) cell."""
    return dark_fraction(roi) > FILLED_DARK_FRACTION


# Light-grey shading vs white paper (double_choco). A cell's paper level is
# the median of its crop, averaged down to _SHADE_PX square, after masking
# ink: pixels darker than _INK_RATIO of the crop's bright level (its
# _BRIGHT_PERCENTILE), grown by a pixel to take the digit's anti-aliased rim.
# Averaging blurs halftone dots out, and ink is darker than either paper, so a
# clue digit or a grid line never moves the level. The old 60th percentile of
# the crop let a heavy "9", "6" or "5" pull a white cell grey, worst on a
# phone-sized photo where a digit covers more of a small crop.
_SHADE_PX = 24
_BRIGHT_PERCENTILE = 95
_INK_RATIO = 0.7
# Below this fraction of paper left after masking, the bright level stands in.
_MIN_PAPER_FRACTION = 0.15
_SHADE_ROUNDS = 4
# Glare or a shadow can lift a patch of grey to within a few % of white paper
# elsewhere, and white paper clips at 255, so the white-cell lighting plane
# can't see it (the medium sample's top-left grey staircase read 225-235
# against 255 for white, 185-200 for grey elsewhere). So each cell whose 5x5
# window (_LOCAL_RADIUS; 3 was less stable across crop sizes) holds white
# paper (within _LOCAL_WHITE_REL of the lighting plane) is re-split by Otsu
# on that window's lighting-relative levels; a cell on the light side
# is split again from it while that side is itself two shades at least
# _LOCAL_MIN_SEPARATION apart (glare grey under white), since a window can hold
# grey, glare grey and white at once. The dark side is never re-split: grey
# varies 10%+ across a board and would read as two shades.
_LOCAL_RADIUS = 2
_LOCAL_WHITE_REL = 0.97
_LOCAL_MIN_SEPARATION = 0.04


def paper_level(crop: NDArray) -> float:
    """Paper brightness of a cell crop (grayscale), ignoring digits and lines."""
    x = cv2.resize(crop, (_SHADE_PX, _SHADE_PX), interpolation=cv2.INTER_AREA).astype(float)
    bright = np.percentile(x, _BRIGHT_PERCENTILE)
    ink = cv2.dilate((x < _INK_RATIO * bright).astype(np.uint8), np.ones((3, 3), np.uint8))
    paper = x[ink == 0]
    return float(np.median(paper)) if paper.size >= _MIN_PAPER_FRACTION * x.size else float(bright)


def shaded_cells(crops: list[list[NDArray]]) -> list[list[int]]:
    """1 for each light-grey cell, 0 for white, over a whole board's crops.

    Grey and white paper sit only ~10% apart in brightness, and a photo's
    lighting drifts more than that across the board (219-259 on the small
    double_choco sample). So the split alternates: Otsu on paper levels
    relative to the white-paper lighting, then a plane fitted to the cells
    now called white re-estimates that lighting. A local re-split then
    handles glare the plane can't model (see _LOCAL_RADIUS). Kakuro does not
    use this: its clue cells are dark grey (mean <= ~171 vs >= ~241 for
    white) and a fixed cutoff separates them with a far wider margin.
    """
    f = np.array([[paper_level(x) for x in row] for row in crops], dtype=float)
    if f.size == 0 or f.max() - f.min() < 1:
        return np.zeros(f.shape, dtype=int).tolist()
    rows, cols = f.shape
    y, x = np.mgrid[0:rows, 0:cols]
    plane = np.stack([np.ones(f.size), x.ravel() / cols - 0.5, y.ravel() / rows - 0.5], axis=1)
    rel = f / np.median(f)
    for _ in range(_SHADE_ROUNDS):
        white = rel.ravel() >= _otsu_threshold(rel.ravel())
        if white.sum() < 3:
            break
        coef, *_ = np.linalg.lstsq(plane[white], f.ravel()[white], rcond=None)
        rel = f / (plane @ coef).reshape(f.shape)
    shaded = (rel < _otsu_threshold(rel.ravel())).astype(int)
    return _local_split(rel, shaded).tolist()


def _two_shades(values: NDArray) -> float | None:
    """Otsu split of ``values`` if they form two shades, else ``None``."""
    if np.ptp(values) <= 0:
        return None
    th = _otsu_threshold(values)
    lo, hi = values[values < th], values[values >= th]
    if len(lo) < 2 or len(hi) < 2 or hi.mean() / lo.mean() - 1 < _LOCAL_MIN_SEPARATION:
        return None
    return th


def _local_split(rel: NDArray, shaded: NDArray) -> NDArray:
    """Re-split each cell against the shades in its neighbourhood.

    ``rel`` is the paper level relative to the white-paper lighting plane, so
    a board-wide lighting slope is already gone and only local glare is left.
    """
    out = shaded.copy()
    rows, cols = rel.shape
    k = _LOCAL_RADIUS
    for r in range(rows):
        for c in range(cols):
            w = rel[max(0, r - k):r + k + 1, max(0, c - k):c + k + 1].ravel()
            if w.max() < _LOCAL_WHITE_REL:
                continue
            th = _two_shades(w)
            if th is None:
                continue
            while rel[r, c] >= th:
                light = w[w >= th]
                th2 = _two_shades(light)
                if th2 is None:
                    break
                w, th = light, th2
            out[r, c] = int(rel[r, c] < th)
    return out


def _otsu_threshold(values: NDArray) -> float:
    """Threshold maximising the between-class variance of 1-D ``values``."""
    s = np.sort(values)
    n = len(s)
    csum = np.cumsum(s)
    k = np.arange(1, n)
    mean_lo = csum[:-1] / k
    mean_hi = (csum[-1] - csum[:-1]) / (n - k)
    score = k * (n - k) * (mean_hi - mean_lo) ** 2
    score[s[1:] == s[:-1]] = -1  # split only between distinct values
    i = int(np.argmax(score))
    return float((s[i] + s[i + 1]) / 2)
