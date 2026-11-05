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
    ],
)
def test_grid_size(name, rows, cols, android):
    img = cv2.imread(str(DOCS_DIR / name))
    geom = detect_nonogram_grid(_android(img) if android else img)
    assert (geom.rows, geom.cols) == (rows, cols)
