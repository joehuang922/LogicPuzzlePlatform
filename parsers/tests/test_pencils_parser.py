"""Tests for the Pencils parser.

Grid geometry is deterministic and pinned against the hand-checked canons in
``docs/pencils/`` (10x10, 17x17 and a 45x31 two-page spread) at full and Android upload
size (longest side 2000px; every sample is already smaller, so Android sends it as is,
and a 1080-wide copy stands in for a smaller phone upload).

Numbers and heads come from Gemini, so ``classify_cells`` is replaced by a spy that
returns the canon's read per cell; the test covers geometry and how reads become the
canon. (Live Gemini reads of all three boards at full size matched the canons exactly
when these tests were written.)
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

import lambda_handler
from puzzle_parsers.cell_classify import Empty, Integer, PencilHead
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.pencils import parser as pp
from puzzle_parsers.pencils.parser import PencilsParser
from puzzle_parsers.recognition import CellRecognizer

DOCS_DIR = Path(__file__).parents[2] / "docs" / "pencils"
SAMPLES = ["board-pencils", "board-pencils-medium", "board-pencils-big"]
_DIRECTION = {-1: "up", -2: "down", -3: "left", -4: "right"}


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


def _read(v: int):
    if v > 0:
        return Integer(value=v)
    if v < 0:
        return PencilHead(direction=_DIRECTION[v])
    return Empty()


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("width", [None, 1080])
def test_parse_matches_canon_with_reads_stubbed(name, width, monkeypatch):
    expected = _expected(name)

    def spy(recognizer, crops, targets):
        assert (len(crops), len(crops[0])) == (len(expected), len(expected[0]))
        return [[_read(v) for v in row] for row in expected]

    monkeypatch.setattr(pp, "classify_cells", spy)
    image = cv2.imread(str(DOCS_DIR / f"{name}.png"))
    assert image is not None
    if width is not None:
        image = cv2.resize(
            image, (width, image.shape[0] * width // image.shape[1]),
            interpolation=cv2.INTER_AREA if width < image.shape[1] else cv2.INTER_CUBIC,
        )
    board = PencilsParser(recognizer=_NoRecognizer())._parse_image(image)
    assert board.cells == expected


def test_unknown_reads_become_empty(monkeypatch):
    monkeypatch.setattr(
        pp, "classify_cells",
        lambda rec, crops, targets: [[PencilHead(direction="sideways") for _ in row] for row in crops],
    )
    image = cv2.imread(str(DOCS_DIR / "board-pencils.png"))
    board = PencilsParser(recognizer=_NoRecognizer())._parse_image(image)
    assert {v for row in board.cells for v in row} == {0}


def test_reads_with_gemini_only():
    # Heads can't be read by EasyOCR, so production skips its cold start for pencils.
    assert 8 not in lambda_handler._OCR_TYPES
    assert isinstance(lambda_handler._build_parser(8), PencilsParser)


def test_validate():
    p = PencilsParser(recognizer=_NoRecognizer())
    assert p.validate(PuzzleData(puzzle_type="pencils", grid={"cells": [[0, -4], [3, -1]]}))
    assert not p.validate(PuzzleData(puzzle_type="pencils", grid={"cells": [[0, -5], [0, 0]]}))
