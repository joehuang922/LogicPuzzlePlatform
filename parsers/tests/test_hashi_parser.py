"""Tests for the Hashi parser.

Island detection is deterministic and pinned against the hand-checked canons in
``docs/hashi/`` at full size and smaller upload sizes. Every sample has parts of
other puzzles in frame (neighbouring puzzles, the rule sidebar, the rule example),
puzzle 2 has an empty row and column, and the medium sample's curled left edge
breaks two rings that only the recovery probe finds.

Numbers come from EasyOCR, so ``read_cells`` is replaced by a spy that hands each
island the canon's number; the test covers geometry and how reads become the canon.
(Live EasyOCR reads of all three samples matched the canons exactly at full, 2000,
1080 and 800 px when the parser was written.)
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.hashi import parser as hp
from puzzle_parsers.hashi.grid_detector import detect_hashi_islands
from puzzle_parsers.hashi.parser import HashiParser
from puzzle_parsers.models import PuzzleData

DOCS_DIR = Path(__file__).parents[2] / "docs" / "hashi"
SAMPLES = ["hashi-board-small", "hashi-board-small-2", "hashi-board-medium"]
SIZES = [None, 2000, 1080, 800]


def _expected(name: str) -> list[list[int]]:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())["cells"]


def _image(name: str, size: int | None):
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    assert image is not None
    if size is not None:
        f = size / max(image.shape[:2])
        image = cv2.resize(image, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    return image


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("size", SIZES)
def test_parse_matches_canon_with_reads_stubbed(name, size, monkeypatch):
    expected = _expected(name)
    geom = detect_hashi_islands(_image(name, size))
    assert (geom.rows, geom.cols) == (len(expected), len(expected[0]))
    found = {(i.row, i.col) for i in geom.islands}
    want = {(r, c) for r, row in enumerate(expected) for c, v in enumerate(row) if v}
    assert found == want

    def spy(ocr, rois, *, allow_multi_digits, allow_zero=False, max_value=None):
        assert not allow_multi_digits and max_value == 8
        assert len(rois) == 1 and len(rois[0]) == len(geom.islands)
        return [[expected[i.row][i.col] for i in geom.islands]]

    monkeypatch.setattr(hp, "read_cells", spy)
    monkeypatch.setattr(hp, "detect_hashi_islands", lambda img, debug_dir=None: geom)
    board = HashiParser()._parse_image(_image(name, size))
    assert board.cells == expected


def test_unreadable_island_reads_as_empty(monkeypatch):
    monkeypatch.setattr(
        hp, "read_cells",
        lambda ocr, rois, **kw: [[0 for _ in rois[0]]],
    )
    board = HashiParser()._parse_image(_image("hashi-board-small", 1080))
    assert {v for row in board.cells for v in row} == {0}


def test_validate():
    p = HashiParser()
    ok = [[2, 0, 2], [0, 0, 0], [2, 0, 2]]
    assert p.validate(PuzzleData(puzzle_type="hashi", grid={"cells": ok}))
    for cells in (
        [[2, 0, 9], [0, 0, 0], [2, 0, 2]],  # 9 is out of range
        [[2, 0, 2], [0, 0], [2, 0, 2]],  # ragged
        [[2]],  # too small
        [[0, 0, 0], [0, 2, 2], [0, 2, 2]],  # empty outer row and column
    ):
        assert not p.validate(PuzzleData(puzzle_type="hashi", grid={"cells": cells})), cells
