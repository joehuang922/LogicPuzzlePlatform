"""Tests for the L-Ring parser.

Grid geometry is deterministic and pinned against the hand-checked canons in
``docs/l-ring/`` at full size and the Android upload sizes. Board 1 is a whole-page
photo (rule example above, a thumb below) where the board is only ~14% of the frame,
so it needs the border finder's small-board contour pass.

Arrows come from Gemini, so ``classify_cells`` is replaced by a spy that returns the
canon's arrow per cell; the test covers geometry and how reads become the canon.
(Live Gemini reads of both boards matched the canons exactly at full, 1080 and 800 px
when the parser was written.)
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.cell_classify import Empty, Symbol
from puzzle_parsers.l_ring import parser as lr
from puzzle_parsers.l_ring.parser import LRingParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer

DOCS_DIR = Path(__file__).parents[2] / "docs" / "l-ring"
SAMPLES = ["l-ring-board-1", "l-ring-board-2"]


class _NoRecognizer(CellRecognizer):
    def recognize(self, cells, prompt, *, max_cells_per_batch=200):  # pragma: no cover
        raise AssertionError("the spy replaces classify_cells")

    def recognize_full_image(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("not used")

    @property
    def supports_full_image(self) -> bool:
        return False


def _expected(name: str) -> list[list[int]]:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())["cells"]


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("width", [None, 1080, 800])
def test_parse_matches_canon_with_arrow_reads_stubbed(name, width, monkeypatch):
    expected = _expected(name)

    def spy(recognizer, crops, targets):
        assert (len(crops), len(crops[0])) == (len(expected), len(expected[0]))
        return [[Symbol(code=v) if v else Empty() for v in row] for row in expected]

    monkeypatch.setattr(lr, "classify_cells", spy)
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    assert image is not None
    if width is not None:
        image = cv2.resize(
            image, (width, image.shape[0] * width // image.shape[1]), interpolation=cv2.INTER_AREA
        )
    board = LRingParser(recognizer=_NoRecognizer())._parse_image(image)
    assert board.cells == expected


def test_unknown_codes_read_as_empty(monkeypatch):
    monkeypatch.setattr(
        lr, "classify_cells",
        lambda rec, crops, targets: [[Symbol(code=9) for _ in row] for row in crops],
    )
    image = cv2.imread(str(DOCS_DIR / "l-ring-board-2.jpg"))
    board = LRingParser(recognizer=_NoRecognizer())._parse_image(image)
    assert {v for row in board.cells for v in row} == {0}


def test_validate():
    p = LRingParser(recognizer=_NoRecognizer())
    assert p.validate(PuzzleData(puzzle_type="l-ring", grid={"cells": [[0, 1], [4, 3]]}))
    for cells in ([[0, 5], [0, 0]], [[0, 0], [0]], [[0]]):
        assert not p.validate(PuzzleData(puzzle_type="l-ring", grid={"cells": cells})), cells
