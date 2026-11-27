"""Picto Link board size, at full size and as the Android client uploads.

The hand-over-example photo is a whole page: the how-to-solve panel below the
board, covered by the photographer's hand, is larger than the board and has a
well-inked outline, so the shared border finder took it (a 6x3 "board" of six
clues). ``find_quadrilateral_border`` now skips a box with no grid in it.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import pytest

from puzzle_parsers.picto_link.grid_detector import detect_picto_link_grid

DOCS_DIR = Path(__file__).parents[2] / "docs" / "picto-link"


def _android(img):
    s = 2000 / max(img.shape[:2])
    if s < 1:
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    return cv2.imdecode(cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])[1], 1)


@pytest.mark.parametrize("android", [False, True])
@pytest.mark.parametrize(
    "name, size",
    [("big.jpg", 25), ("medium.jpg", 15), ("hand-over-example.jpg", 15)],
)
def test_grid_size(name, size, android):
    img = cv2.imread(str(DOCS_DIR / name))
    grid = detect_picto_link_grid(_android(img) if android else img)
    assert (len(grid.h_lines) - 1, len(grid.v_lines) - 1) == (size, size)
