"""Shared "is this cell filled (black)?" test for grid parsers.

A filled cell is judged by the *fraction* of dark pixels in its crop, not the
mean brightness: a filled cell carrying a white digit (akari walls, shakashaka
blacks) has its mean pulled up to the threshold by the digit, so a mean test
flips on a few pixels of crop shift (shakashaka's edge blacks sat at mean
98-101 against a threshold of 100). The dark fraction stays ~0.5-1.0 for filled
cells, digit or not, and ~0.0 for empty ones.
"""
from __future__ import annotations

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
