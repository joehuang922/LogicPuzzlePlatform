"""Tests for the slitherlink grid detector, on both page styles.

Deterministic, no live OCR:

* Dot pages (``board-slitherlink*.jpg``): the dot lattice still reads its size.
* Gakken pages (``board-slitherlink-gakken-*.jpg``): dashed grid lines, no dots,
  no solid border. Q81 sits beside a neighbouring puzzle and a dashed separator,
  Q86 above Q87, Q90 (40x35) on a curved page with a faint top edge. Size is
  pinned at full size and Android size (2000px long side), and tilted 2 degrees.
* Alignment: a stand-in OCR marks a cell as a clue when the centre of its crop
  holds dark ink, and the pattern must match the canon cell for cell. A lattice
  misnumbered by a column in one region (Q86 once read 22 clues shifted) fails.

The 10x10 and 15x20 canons are hand-transcribed; the 40x35 canon is EasyOCR's
read, identical at full size and 2000px, its by-value montage checked by eye.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from puzzle_parsers.recognition import OcrBackend
from puzzle_parsers.slitherlink.grid_detector import (
    _dot_lattice,
    detect_slitherlink_grid,
)
from puzzle_parsers.slitherlink.parser import SlitherlinkParser

DOCS_DIR = Path(__file__).parents[2] / "docs" / "slitherlink"

DOT_SAMPLES = [
    ("board-slitherlink.jpg", 10, 10),
    ("board-slitherlink-medium-1.jpg", 15, 25),
    ("board-slitherlink-medium-2.jpg", 15, 25),
]
GAKKEN_SAMPLES = [
    ("board-slitherlink-gakken-10x10", 10, 10),
    ("board-slitherlink-gakken-15x20", 15, 20),
    ("board-slitherlink-gakken-40x35", 40, 35),
]


def _load(filename: str, long_side: int | None = None, tilt: float = 0.0) -> np.ndarray:
    image = cv2.imread(str(DOCS_DIR / filename))
    assert image is not None, f"missing sample image: {filename}"
    if long_side is not None:
        s = long_side / max(image.shape[:2])
        image = cv2.resize(image, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    if tilt:
        h, w = image.shape[:2]
        m = cv2.getRotationMatrix2D((w / 2, h / 2), tilt, 1.0)
        image = cv2.warpAffine(image, m, (w, h), borderValue=(255, 255, 255))
    return image


@pytest.mark.parametrize("long_side", [None, 2000])
@pytest.mark.parametrize("filename,rows,cols", DOT_SAMPLES)
def test_dot_pages_read_their_size(filename, rows, cols, long_side):
    geom = detect_slitherlink_grid(_load(filename, long_side))
    assert (geom.rows, geom.cols) == (rows, cols)


@pytest.mark.parametrize("long_side,tilt", [(None, 0.0), (2000, 0.0), (2000, -2.0), (2000, 2.0)])
@pytest.mark.parametrize("name,rows,cols", GAKKEN_SAMPLES)
def test_dashed_pages_read_their_size(name, rows, cols, long_side, tilt):
    geom = detect_slitherlink_grid(_load(f"{name}.jpg", long_side, tilt))
    assert (geom.rows, geom.cols) == (rows, cols)


@pytest.mark.parametrize("name,rows,cols", GAKKEN_SAMPLES)
def test_dashed_pages_are_not_read_as_dots(name, rows, cols):
    image = _load(f"{name}.jpg", 2000)
    assert _dot_lattice(image, cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), None) is None


class _InkOcr(OcrBackend):
    """Reads 1 where the middle of the crop holds dark ink, else empty (-1)."""

    def recognize_cells(self, cells, *, multi_digit=False, min_confidence=0.0, allowlist=None):
        out = []
        for row in cells:
            line = []
            for crop in row:
                h, w = crop.shape[:2]
                middle = crop[int(h * 0.2):int(h * 0.8), int(w * 0.2):int(w * 0.8)]
                line.append(1 if (middle < 110).mean() > 0.03 else -1)
            out.append(line)
        return out

    @property
    def supports_full_image(self) -> bool:
        return False

    def recognize_full_image(self, image_path, num_subboards):  # pragma: no cover
        raise NotImplementedError


@pytest.mark.parametrize("long_side", [None, 2000])
@pytest.mark.parametrize("name,rows,cols", GAKKEN_SAMPLES)
def test_dashed_page_cells_line_up_with_the_clues(name, rows, cols, long_side):
    canon = json.loads((DOCS_DIR / f"{name}.canon.json").read_text())["cells"]
    board = SlitherlinkParser(ocr_backend=_InkOcr())._parse_image(_load(f"{name}.jpg", long_side))
    assert (len(board.cells), len(board.cells[0])) == (rows, cols)
    wrong = [
        (r, c) for r in range(rows) for c in range(cols)
        if (board.cells[r][c] >= 0) != (canon[r][c] >= 0)
    ]
    assert wrong == []
