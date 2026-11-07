"""Nurimaze geometry and walls on the curved-page photos.

The 45x31 giant (board-nurimaze-45x31-photo.jpg) is a phone photo of a curved
magazine page: without flattening its grid lines drift half a cell and thick
walls land on the wrong cell edges. flatten_board straightens it; its margin
must not pick up the page edge (45x31 samples) or the divider rule under the
board (17x17 photo) as an extra grid line. Every sample keeps its size at full
and Android upload size (longest side 2000px).
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest

from puzzle_parsers.grid_utils import classify_border_thickness
from puzzle_parsers.nurimaze.grid_detector import detect_nurimaze_grid

DOCS_DIR = Path(__file__).parents[2] / "docs" / "nurimaze"
SAMPLES = [
    ("board-nurimaze.jpg", 10, 10),
    ("board-nurimaze-17x17-photo.jpg", 17, 17),
    ("board-nurimaze-big.jpg", 45, 31),
    ("board-nurimaze-45x31-photo.jpg", 45, 31),
]


def _android(img: np.ndarray) -> np.ndarray:
    s = 2000 / max(img.shape[:2])
    return cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else img


@pytest.fixture(scope="module")
def images():
    return {name: cv2.imread(str(DOCS_DIR / name)) for name, _, _ in SAMPLES}


@pytest.mark.parametrize("android", [False, True], ids=["full", "android"])
@pytest.mark.parametrize("name, rows, cols", SAMPLES)
def test_grid_size(images, name, rows, cols, android):
    img = images[name]
    geom = detect_nurimaze_grid(_android(img) if android else img)
    assert (geom.rows, geom.cols) == (rows, cols)


@pytest.mark.parametrize("android", [False, True], ids=["full", "android"])
def test_giant_photo_keeps_its_thick_walls(images, android):
    """Thick walls near the top that a straight grid and Otsu's cut both lost.

    Their widths (5.4-5.8 px at full size) sit in the thick class (5-11 px,
    thin 2-4 px), but Otsu cut at 6.1 px inside it; the density valley cuts at
    ~5 px and closes rooms better, so it wins. h[r][c] is the wall below cell
    (r, c); the solver found the board impossible without them. h[3][20]
    (5.21 px) is the closest call: the valley's smoothing must stay narrow
    enough to keep it thick.
    """
    img = images["board-nurimaze-45x31-photo.jpg"]
    geom = detect_nurimaze_grid(_android(img) if android else img)
    h, _ = classify_border_thickness(cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY), geom)
    assert [h[2][13], h[2][14], h[0][14], h[4][10], h[3][20]] == [1, 1, 1, 1, 1]
