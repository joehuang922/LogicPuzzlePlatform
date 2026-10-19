"""Tests for the Hitori parser.

Two layers, both deterministic (no live OCR):

* Grid geometry on the real sample photos in ``docs/hitori/``. Per the parser doc the
  accuracy bar is "grid geometry must be right; individual OCR misses are expected", so a
  regression that pins the detected ``rows``/``cols`` on the shipped samples is the one
  image-based check worth having. The two pages also show neighbouring puzzles, so this
  also guards that the detector still picks the one complete bordered grid.
* The OCR-to-canon glue (unreadable cells become a placeholder; shape validation) driven
  by a canned ``OcrBackend`` double, matching the pattern in ``test_combo_sudoku.py``.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest
from PIL import Image

from puzzle_parsers.hitori.grid_detector import detect_hitori_grid
from puzzle_parsers.hitori.models import HitoriBoard
from puzzle_parsers.hitori.parser import UNREADABLE_PLACEHOLDER, HitoriParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import OcrBackend

DOCS_DIR = Path(__file__).parents[2] / "docs" / "hitori"


class FakeOcr(OcrBackend):
    """Returns a canned grid; ``None`` entries stand in for an unreadable cell (0)."""

    def __init__(self, grid: list[list[int | None]]):
        self._grid = grid

    def recognize_cells(self, cells, *, multi_digit=False, min_confidence=0.0):
        return [[0 if v is None else v for v in row] for row in self._grid]

    @property
    def supports_full_image(self) -> bool:
        return False

    def recognize_full_image(self, image_path, num_subboards):  # pragma: no cover
        raise NotImplementedError


# -- grid geometry on the real samples ---------------------------------------

@pytest.mark.parametrize(
    "filename,expected_rows,expected_cols",
    [
        ("board-hitori-8x8.jpg", 8, 8),
        ("board-hitori-17x17.jpg", 17, 17),
    ],
)
def test_detects_grid_dimensions_on_sample_photos(filename, expected_rows, expected_cols):
    path = DOCS_DIR / filename
    assert path.exists(), f"missing sample image: {path}"
    img = cv2.imread(str(path))
    assert img is not None, f"could not read {path}"

    geom = detect_hitori_grid(img)

    assert (geom.rows, geom.cols) == (expected_rows, expected_cols)
    # Lines bound the cells: one more line than cells on each axis.
    assert len(geom.h_lines) == expected_rows + 1
    assert len(geom.v_lines) == expected_cols + 1


# -- OCR-to-canon glue --------------------------------------------------------

def _parse_grid(grid: list[list[int | None]]) -> HitoriBoard:
    parser = HitoriParser(ocr_backend=FakeOcr(grid))
    # A tiny solid-ruled grid of the right shape so detection recovers the dims the fake
    # OCR expects; the pixel content is irrelevant because the OCR result is canned.
    rows, cols = len(grid), len(grid[0])
    cell = 24
    pad = 6
    h, w = rows * cell + 2 * pad, cols * cell + 2 * pad
    canvas = np.full((h, w), 255, dtype=np.uint8)
    cv2.rectangle(canvas, (pad, pad), (w - pad, h - pad), 0, 2)
    for r in range(rows + 1):
        y = pad + r * cell
        cv2.line(canvas, (pad, y), (w - pad, y), 0, 1)
    for c in range(cols + 1):
        x = pad + c * cell
        cv2.line(canvas, (x, pad), (x, h - pad), 0, 1)
    img = Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_GRAY2RGB))
    return HitoriBoard(**parser._parse(img).grid)


def test_unreadable_cells_fall_back_to_placeholder():
    board = _parse_grid([[7, None], [None, 3]])
    assert board.cells == [[7, UNREADABLE_PLACEHOLDER], [UNREADABLE_PLACEHOLDER, 3]]


# -- validate() ---------------------------------------------------------------

def test_validate_accepts_a_positive_integer_grid():
    parser = HitoriParser()
    data = PuzzleData(puzzle_type="hitori", grid={"cells": [[1, 2], [2, 1]]})
    assert parser.validate(data) is True


def test_validate_rejects_wrong_type():
    parser = HitoriParser()
    assert parser.validate(PuzzleData(puzzle_type="nurikabe", grid={"cells": [[1, 2], [2, 1]]})) is False


def test_validate_rejects_non_positive_values():
    parser = HitoriParser()
    # 0 is not allowed in Hitori: every cell is a number >= 1.
    data = PuzzleData(puzzle_type="hitori", grid={"cells": [[1, 0], [2, 1]]})
    assert parser.validate(data) is False


def test_validate_rejects_too_small_or_ragged():
    parser = HitoriParser()
    assert parser.validate(PuzzleData(puzzle_type="hitori", grid={"cells": [[1]]})) is False
    assert parser.validate(PuzzleData(puzzle_type="hitori", grid={"cells": [[1, 2], [3]]})) is False
