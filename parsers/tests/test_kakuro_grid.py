"""Kakuro grid lines next to the border land one cell from it.

On the big Nikoli boards the first row and column are all shaded clue cells:
the line between two grey cells is faint, while the clue discs' outlines just
inside it are strong, and the thick border thresholds to two edges. The line
tracker took the disc outlines, 0.75-0.85 cell from the border, cutting the
first column's clues (``board-kakuro-big-3.jpg`` read every row's across clue
half-cropped).
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest

from puzzle_parsers.kakuro.grid_detector import detect_kakuro_grid

DOCS_DIR = Path(__file__).parents[2] / "docs" / "kakuro"
ANDROID_LONG_SIDE = 2000  # bilinear, like the client's createScaledBitmap


@pytest.mark.parametrize(
    "name, rows, cols",
    [
        ("board-kakuro-big.png", 32, 22),
        ("board-kakuro-big-2.jpg", 32, 22),
        ("board-kakuro-big-cropped.png", 32, 22),
        ("board-kakuro-big-3.jpg", 32, 42),
    ],
)
@pytest.mark.parametrize("android", [False, True])
def test_every_cell_is_about_one_pitch(name, rows, cols, android):
    img = cv2.imread(str(DOCS_DIR / name))
    if android:
        scale = ANDROID_LONG_SIDE / max(img.shape[:2])
        if scale < 1:
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_LINEAR)
    geom = detect_kakuro_grid(img)
    assert (geom.rows, geom.cols) == (rows, cols)
    for lines in (geom.h_lines, geom.v_lines):
        gaps = np.diff(lines)
        pitch = (lines[-1] - lines[0]) / (len(lines) - 1)
        # 15%: a thick border's outer edge makes the edge cells a little short.
        assert np.all(np.abs(gaps - pitch) <= 0.15 * pitch), gaps.tolist()
