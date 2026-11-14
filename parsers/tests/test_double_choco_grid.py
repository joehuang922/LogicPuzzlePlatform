"""The 50x64 double choco photo reads 50x64 at every upload size.

Its grey cells are a halftone dot screen and the page curls at the bottom
right, so the board is found through flatten's second, halftone-robust trace.
At some sizes the first trace kept a stray column line: one cell split into
two gaps that each passed the gap range, and the board was remapped 65 wide
(the Android upload of this photo read 50x65 with the middle clues a column
off). These are the sizes that misread before the cell-count check.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import pytest

from puzzle_parsers.double_choco.grid_detector import detect_double_choco_grid

IMAGE = Path(__file__).parents[2] / "docs" / "double-choco" / "board-double-choco-giant.jpg"


@pytest.mark.parametrize(
    "long_side, jpeg",
    [(1550, True), (1600, False), (1925, True), (2075, False), (2650, True), (3175, False), (2000, True)],
)
def test_giant_photo_reads_full_size(long_side, jpeg):
    """As ImageInput.kt sends it: bilinear downscale, then JPEG at quality 85."""
    img = cv2.imread(str(IMAGE))
    h, w = img.shape[:2]
    ratio = long_side / max(h, w)  # ImageInput.scaleToMax truncates each side
    img = cv2.resize(img, (int(w * ratio), int(h * ratio)), interpolation=cv2.INTER_LINEAR)
    if jpeg:
        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    geom = detect_double_choco_grid(img)
    assert (geom.rows, geom.cols) == (50, 64)
