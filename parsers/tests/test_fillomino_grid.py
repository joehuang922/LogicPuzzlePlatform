"""Fillomino grid geometry on a phone photo of a curved magazine page.

``board-fillomino-curved-photo.jpg`` is a 17x17 Nikoli board at the size the
Android client uploads (longest side 2000px). The page bows, so grid lines drift
up to ~11% of a cell off a straight uniform lattice and the lattice fit refuses
both axes; peak counting then mistook the dense clue columns for grid lines and
read 16x17 / 17x16. The autocorrelation pitch fallback must keep it 17x17.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import pytest

from puzzle_parsers.fillomino.grid_detector import detect_fillomino_grid

DOCS_DIR = Path(__file__).parents[2] / "docs" / "fillomino"


@pytest.mark.parametrize(
    "name, rows, cols",
    [
        ("board-fillomino-curved-photo.jpg", 17, 17),
        ("board-fillomino.png", 10, 10),
        ("board-fillomino-medium.png", 17, 17),
        ("board-fillomino-big.png", 37, 23),
    ],
)
def test_grid_size(name, rows, cols):
    geom = detect_fillomino_grid(cv2.imread(str(DOCS_DIR / name)))
    assert (geom.rows, geom.cols) == (rows, cols)
