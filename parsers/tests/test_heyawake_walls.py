"""Heyawake phone photos whose thin lines print as faint, blurred grey bands.

At half its own depth such a thin line is as wide as a black wall (14 px at
full size, both), so walls read by width alone came out thick along
whole rows, and differently at every upload size. ``classify_border_thickness``
now weighs each wall's width by its darkness (its ink), which blur can't
inflate. The 10x10 board's walls below were checked against the photo.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import pytest

from puzzle_parsers.grid_utils import classify_border_thickness
from puzzle_parsers.heyawake.grid_detector import detect_heyawake_grid

DOCS_DIR = Path(__file__).parents[2] / "docs" / "heyawake"

# h[r]: walls below row r; v[r]: walls right of each cell in row r.
H_10 = [
    "0111000110",
    "0000111111",
    "1111111111",
    "0000000000",
    "0011111110",
    "0000000000",
    "1111111111",
    "1111000000",
    "0001000110",
]
V_10 = [
    "110100101",
    "100100101",
    "100100101",
    "110010101",
    "110010101",
    "110000101",
    "110000101",
    "010101111",
    "101101111",
    "101101101",
]


def _walls(img):
    geom = detect_heyawake_grid(img)
    h, v = classify_border_thickness(cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY), geom)
    return ["".join(map(str, r)) for r in h], ["".join(map(str, r)) for r in v]


def _upload(img, long_side):
    """As ImageInput.kt sends it: bilinear downscale, then JPEG at quality 85."""
    h, w = img.shape[:2]
    ratio = long_side / max(h, w)
    img = cv2.resize(img, (int(w * ratio), int(h * ratio)), interpolation=cv2.INTER_LINEAR)
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


@pytest.mark.parametrize("long_side", [None, 1500, 1900, 2000, 2300])
def test_10x10_photo_walls(long_side):
    img = cv2.imread(str(DOCS_DIR / "board-heyawake-photo-10x10.jpg"))
    assert _walls(img if long_side is None else _upload(img, long_side)) == (H_10, V_10)


@pytest.mark.parametrize("long_side", [1500, 1900, 2000, 2300])
def test_17x17_photo_reads_the_same_walls_at_any_upload_size(long_side):
    img = cv2.imread(str(DOCS_DIR / "board-heyawake-photo-17x17.jpg"))
    full = _walls(img)
    assert sum(r.count("1") for part in full for r in part) == 214
    assert _walls(_upload(img, long_side)) == full
