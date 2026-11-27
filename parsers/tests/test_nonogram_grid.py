"""Nonogram playable-grid size through the shared grid finder.

On these scans the thin interior columns are faint and only the bold every-5
separators pass the lattice test on that axis, so its only passing count is a
sub-multiple (25x5, 35x7). ``find_grid_lines`` recounts an axis whose cells
come out far larger than the other axis's (``_square_cell_recount``); this
replaced nonogram's own ``reconcile_square_lines``. Checked at full size and
as the Android client uploads (longest side 2000px, JPEG q85).
"""
from __future__ import annotations

from pathlib import Path

import cv2
import pytest

from puzzle_parsers.nonogram.grid_detector import detect_nonogram_grid

DOCS_DIR = Path(__file__).parents[2] / "docs" / "nonogram"


def _android(img):
    s = 2000 / max(img.shape[:2])
    if s < 1:
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    return cv2.imdecode(cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])[1], 1)


@pytest.mark.parametrize("android", [False, True])
@pytest.mark.parametrize(
    "name, rows, cols",
    [
        ("board-nonogram.jpg", 10, 10),
        ("board-nonogram-medium.jpg", 25, 25),
        ("board-nonogram-titled.jpg", 25, 25),
        ("board-nonogram-big.jpg", 35, 35),
        # Keystoned photo: no separator line survives until the page is sheared level.
        ("board-nonogram-keystoned.jpg", 30, 30),
        # Wavy page: the whole-width count reads 39 rows; snapped to 5-cell blocks.
        ("board-nonogram-wavy.jpg", 40, 35),
        # Pale red ink: its grid edge vanished under a luminance threshold.
        ("board-nonogram-pale-red.jpg", 40, 35),
        # Curved two-page spread: the grid edges bow more than their width.
        ("board-nonogram-spread.jpg", 60, 50),
        # Landscape photo: at Android size a line-tracking pass ran off the
        # board and find_grid_lines raised IndexError.
        ("board-nonogram-landscape.jpg", 35, 40),
        # Small board: at Android size only the bold lines pass the lattice
        # test (5x5); the count is checked against span / cell pitch.
        ("board-nonogram-small.jpg", 15, 15),
        ("board-nonogram-narrow-clues.jpg", 40, 35),
    ],
)
def test_grid_size(name, rows, cols, android):
    img = cv2.imread(str(DOCS_DIR / name))
    geom = detect_nonogram_grid(_android(img) if android else img)
    assert (geom.rows, geom.cols) == (rows, cols)


@pytest.mark.parametrize("android", [False, True])
@pytest.mark.parametrize(
    "name",
    ["board-nonogram-narrow-clues.jpg", "board-nonogram-spread.jpg", "board-nonogram-big.jpg"],
)
def test_column_strips_cut_on_bold_lines(name, android):
    """Column clues go to the model in 5-column strips; each cut must sit on
    the bold line printed in the clue area, not at the grid's cell width.
    The narrow-clues photo's clue area is 1.6% narrower than its grid (the
    last cut drifted half a cell), the spread's starts half a cell outside it.
    """
    import numpy as np

    from puzzle_parsers.nonogram.parser import _clue_area_sides

    img = cv2.imread(str(DOCS_DIR / name))
    geom = detect_nonogram_grid(_android(img) if android else img)
    x1, x2 = _clue_area_sides(geom.image, geom.col_clue_rect, geom.cell_w)
    _, cy, _, ch = geom.col_clue_rect
    dark = 255.0 - geom.image[cy : cy + ch].min(axis=2).astype(np.float32).mean(axis=0)
    col_w = (x2 - x1) / geom.cols
    win = int(0.4 * col_w)
    for c in range(0, geom.cols + 1, 5):
        cut = x1 + round(c * col_w)
        bold = cut - win + int(np.argmax(dark[cut - win : cut + win + 1]))
        assert abs(cut - bold) <= 0.2 * col_w, (c, cut, bold)

