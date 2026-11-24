"""Tests for the Irregular Nonogram (変形ロジック) parser.

Two scans (Q79, Q80) in ``docs/irregular-nonogram/``. The board, its pieces, which side
each clue block is on and which cells are read are deterministic, and pinned against the
canons at full size and at the Android upload size (2000 px long side). Each canon has
exactly one solution (the player's solver gate), and the solutions draw the pictures the
book asks about (a drum kit, a hurdler), which checks the transcription.

Digits come from EasyOCR, so ``read_cells`` is replaced by a spy returning the canon's
numbers in reading order; a live test (skipped without EasyOCR) reads both scans at
both sizes. Live reads matched the canons exactly when the parser was written.

The hand-held photo of Q79 (curved page, strong perspective) is not yet read correctly:
the lattice fit can't follow its curl. It's kept as a sample for that future work.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from puzzle_parsers.irregular_nonogram import parser as ip
from puzzle_parsers.irregular_nonogram.grid_detector import clue_blocks, detect_irregular, pieces, _INK
from puzzle_parsers.irregular_nonogram.parser import IrregularNonogramParser
from puzzle_parsers.models import PuzzleData

DOCS_DIR = Path(__file__).parents[2] / "docs" / "irregular-nonogram"
SAMPLES = ["board-irregular-nonogram-1", "board-irregular-nonogram-2"]
SIZES = [None, 2000]


def _expected(name: str) -> dict:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())


def _image(name: str, size: int | None):
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    assert image is not None
    if size is not None:
        f = size / max(image.shape[:2])
        image = cv2.resize(image, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    return image


def _numbers(canon: dict) -> list[int]:
    return [n for e in canon["rowClues"] for n in e["clues"]] + [n for e in canon["colClues"] for n in e["clues"]]


class _Ocr:
    """Stands in for the backend: the spy never calls it."""


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("size", SIZES)
def test_parse_matches_canon_with_reads_stubbed(name, size, monkeypatch):
    expected = _expected(name)
    numbers = _numbers(expected)

    def cells_spy(ocr, rois, *, allow_multi_digits, allow_zero=False, max_value=None):
        assert allow_multi_digits and not allow_zero and max_value is None
        assert len(rois) == 1 and len(rois[0]) == len(numbers)  # one crop per printed number
        return [numbers]

    monkeypatch.setattr(ip, "read_cells", cells_spy)
    board = IrregularNonogramParser(ocr_backend=_Ocr())._parse_image(_image(name, size))
    assert board.model_dump() == expected


@pytest.mark.parametrize("name", SAMPLES)
def test_every_piece_has_one_clue_block(name):
    geom = detect_irregular(_image(name, None))
    ps = pieces(geom.board)
    blocks = clue_blocks(geom.board, geom.ink > _INK)
    assert sorted(blocks) == list(range(len(ps)))
    # A clue cell belongs to one block.
    cells = [cell for _, block in blocks.values() for cell in block]
    assert len(cells) == len(set(cells))


def test_board_is_built_from_5x5_blocks():
    for name, blocks in (("board-irregular-nonogram-1", 41), ("board-irregular-nonogram-2", 39)):
        board = np.array(_expected(name)["cells"])
        assert board.sum() == 25 * blocks


@pytest.mark.parametrize("size", SIZES)
def test_live_ocr_reads_the_canons(size):
    pytest.importorskip("easyocr")
    from puzzle_parsers.recognition import EasyOcrBackend

    parser = IrregularNonogramParser(ocr_backend=EasyOcrBackend())
    for name in SAMPLES:
        assert parser._parse_image(_image(name, size)).model_dump() == _expected(name), name


def test_validate():
    parser = IrregularNonogramParser()
    good = _expected("board-irregular-nonogram-2")
    assert parser.validate(PuzzleData(puzzle_type="irregular-nonogram", grid=good))
    assert not parser.validate(PuzzleData(puzzle_type="irregular-nonogram", grid={**good, "rowClues": [], "colClues": []}))
    assert not parser.validate(PuzzleData(puzzle_type="irregular-nonogram", grid={**good, "height": good["height"] + 1}))
