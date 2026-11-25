"""Tests for the Majority Yajilix parser.

Grid geometry is deterministic and pinned against the hand-checked canons in
``docs/majority-yajilix/`` at full size, the Android upload size (2000px long side) and smaller.
Board 1 also shows the complete rule example and its answer above the puzzle, board 2 a
partial puzzle 3 under a finger; the border finder must pick the puzzle.

Clues come from Gemini, so ``classify_cells`` is replaced by a spy that returns the
canon's clue per cell; the test covers geometry and how reads become the canon. Each
canon was solved with CP-SAT and has a unique solution (``*.solution.json``).
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.cell_classify import Empty, LetteredDirection
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer
from puzzle_parsers.majority_yajilix import parser as yp
from puzzle_parsers.majority_yajilix.parser import MajorityYajilixParser

DOCS_DIR = Path(__file__).parents[2] / "docs" / "majority-yajilix"
SAMPLES = ["board-majority-yajilix-1", "board-majority-yajilix-2", "board-majority-yajilix-3"]


class _NoRecognizer(CellRecognizer):
    def recognize(self, cells, prompt, *, max_cells_per_batch=200):  # pragma: no cover
        raise AssertionError("the spy replaces classify_cells")

    def recognize_full_image(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("not used")

    @property
    def supports_full_image(self) -> bool:
        return False


def _expected(name: str) -> list[list[dict | None]]:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())["cells"]


def _read(clue: dict | None):
    if clue is None:
        return Empty()
    return LetteredDirection(letter=clue["kind"], direction=clue["dir"])


def _resize_long_side(image, long_side: int):
    h, w = image.shape[:2]
    s = long_side / max(h, w)
    return cv2.resize(image, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("long_side", [None, 2000, 1080])
def test_parse_matches_canon_with_clue_reads_stubbed(name, long_side, monkeypatch):
    expected = _expected(name)

    def spy(recognizer, crops, targets):
        assert (len(crops), len(crops[0])) == (len(expected), len(expected[0]))
        return [[_read(v) for v in row] for row in expected]

    monkeypatch.setattr(yp, "classify_cells", spy)
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    assert image is not None
    if long_side is not None:
        image = _resize_long_side(image, long_side)
    board = MajorityYajilixParser(recognizer=_NoRecognizer())._parse_image(image)
    assert board.model_dump()["cells"] == expected


def test_unknown_letters_and_directions_read_as_empty(monkeypatch):
    reads = [
        LetteredDirection(letter="", direction="up"),
        LetteredDirection(letter="L", direction="sideways"),
        LetteredDirection(letter="X", direction="left"),
    ]
    monkeypatch.setattr(
        yp, "classify_cells",
        lambda rec, crops, targets: [[reads[(r * 7 + c) % 3] for c in range(len(row))] for r, row in enumerate(crops)],
    )
    image = cv2.imread(str(DOCS_DIR / "board-majority-yajilix-2.jpg"))
    cells = MajorityYajilixParser(recognizer=_NoRecognizer())._parse_image(image).model_dump()["cells"]
    kept = {json.dumps(v, sort_keys=True) for row in cells for v in row if v is not None}
    assert kept == {json.dumps({"kind": "X", "dir": "left"}, sort_keys=True)}
    assert any(v is None for row in cells for v in row)


def test_validate():
    p = MajorityYajilixParser(recognizer=_NoRecognizer())
    clue = {"kind": "L", "dir": "up"}
    assert p.validate(PuzzleData(puzzle_type="majority-yajilix", grid={"cells": [[None, clue], [None, None]]}))
    bad_kind = {"kind": "Q", "dir": "up"}
    for cells in ([[None, bad_kind], [None, None]], [[None, None], [None]], [[None]]):
        assert not p.validate(PuzzleData(puzzle_type="majority-yajilix", grid={"cells": cells})), cells
