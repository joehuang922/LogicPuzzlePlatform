"""Shared cell-fill tests in ``cell_fill``."""
from __future__ import annotations

import cv2
import numpy as np

from puzzle_parsers.cell_fill import is_filled, shaded_cells


def test_is_filled_black_cell_with_white_digit():
    cell = np.full((60, 60), 20, np.uint8)
    cv2.putText(cell, "3", (15, 48), cv2.FONT_HERSHEY_SIMPLEX, 1.6, 255, 5)
    assert is_filled(cell)
    assert not is_filled(np.full((60, 60), 240, np.uint8))


def _board(rows: int, cols: int, grey: set[tuple[int, int]], digits: set[tuple[int, int]]):
    """Crops of light-grey (205) or white (245) paper under lighting that
    falls ~15% from left to right; ``digits`` cells carry a heavy black 6."""
    crops = []
    for r in range(rows):
        row = []
        for c in range(cols):
            paper = 205 if (r, c) in grey else 245
            light = 1.0 - 0.15 * c / (cols - 1)
            # putText draws only on 8-bit images from OpenCV 5.
            cell = np.full((48, 48), paper * light, np.float32).astype(np.uint8)
            if (r, c) in digits:
                cv2.putText(cell, "6", (8, 42), cv2.FONT_HERSHEY_SIMPLEX, 1.5, 0, 6)
            row.append(cell)
        crops.append(row)
    return crops


def test_shaded_cells_ignores_digits_and_lighting():
    rng = np.random.default_rng(0)
    grey = {(int(r), int(c)) for r, c in rng.integers(0, 10, size=(40, 2))}
    digits = {(r, c) for r in range(10) for c in range(10) if (r + 2 * c) % 5 == 0}
    want = [[int((r, c) in grey) for c in range(10)] for r in range(10)]
    assert shaded_cells(_board(10, 10, grey, digits)) == want
    # The cell mean, the old double_choco measure, fails on the same board:
    # a white cell's 6 and the dim right edge both look grey.
    means = np.array([[x.mean() for x in row] for row in _board(10, 10, grey, digits)])
    assert ((means < np.median(means)).astype(int) != np.array(want)).sum() > 5


def test_shaded_cells_reads_grey_lifted_by_glare():
    """Grey under glare reads closer to white paper elsewhere than to the
    rest of the grey (the medium sample's top-left: 225-235 vs 255 white and
    185-200 grey); a lighting plane fitted to clipped white can't see it."""
    rows = cols = 12
    grey = {(r, c) for r in range(rows) for c in range(cols) if (r * 7 + c * 3) % 5 < 2}
    crops = []
    for r in range(rows):
        row = []
        for c in range(cols):
            glare = r < 4 and c < 4
            level = (232 if glare else 196) if (r, c) in grey else 255
            cell = np.full((40, 40), level, np.uint8)
            if (r + c) % 4 == 0:
                cv2.putText(cell, "9", (8, 34), cv2.FONT_HERSHEY_SIMPLEX, 1.1, 0, 4)
            row.append(cell)
        crops.append(row)
    want = [[int((r, c) in grey) for c in range(cols)] for r in range(rows)]
    assert shaded_cells(crops) == want


def test_shaded_cells_uniform_board_is_all_white():
    crops = [[np.full((30, 30), 240, np.uint8)] * 4] * 4
    assert shaded_cells(crops) == [[0] * 4] * 4
