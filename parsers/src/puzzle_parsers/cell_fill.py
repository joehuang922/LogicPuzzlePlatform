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
# this percentile of its crop averaged down to _SHADE_PX square: the averaging
# blurs halftone dots out, and a clue digit covers well under 40% of the
# crop, so the digit's ink never moves it (the cell mean read white cells
# holding a large "9" or "6" as grey).
_SHADE_PERCENTILE = 60
_SHADE_PX = 24
_SHADE_ROUNDS = 4


def shaded_cells(crops: list[list[NDArray]]) -> list[list[int]]:
    """1 for each light-grey cell, 0 for white, over a whole board's crops.

    Grey and white paper sit only ~10% apart in brightness, and a photo's
    lighting drifts more than that across the board (219-259 on the small
    double_choco sample). So the split alternates: Otsu on paper levels
    relative to the white-paper lighting, then a plane fitted to the cells
    now called white re-estimates that lighting. Kakuro does not use this:
    its clue cells are dark grey (mean <= ~171 vs >= ~241 for white) and a
    fixed cutoff separates them with a far wider margin.
    """
    f = np.array([
        [np.percentile(cv2.resize(x, (_SHADE_PX, _SHADE_PX), interpolation=cv2.INTER_AREA), _SHADE_PERCENTILE)
         for x in row]
        for row in crops
    ], dtype=float)
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
    return (rel < _otsu_threshold(rel.ravel())).astype(int).tolist()


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
