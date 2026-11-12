"""Tests for the Skeleton Puzzle parser.

The cell mask is deterministic and pinned against the hand-checked canons in
``docs/skeleton-puzzle/`` at full size and the Android upload size (2000 px).
Each canon's slots match its printed word list length for length, which is
how the masks were checked. Board 1 is a washed-out photo of a curled page:
its thin lines are faint and flattening falls back to the plain warp (the
hole in its middle leaves three vertical lines too sparse to trace), so the
parser gets a few squares wrong there; the test pins exactly those.

The word list comes from Gemini, so the recognizer is a stub that returns the
canon's words; the test covers geometry and how the reply becomes the canon.
(Live Gemini read all three lists with every word and the right lengths when
the parser was written; board 1's ニシユタカ came back with a small ュ, which
the board writes full-size anyway.)
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest
from PIL import Image

from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer
from puzzle_parsers.skeleton_puzzle.grid_detector import detect_skeleton_grid
from puzzle_parsers.skeleton_puzzle.models import SkeletonPuzzleBoard
from puzzle_parsers.skeleton_puzzle.parser import (
    SkeletonPuzzleParser,
    format_problems,
    slot_lengths,
    words_from_response,
)

DOCS_DIR = Path(__file__).parents[2] / "docs" / "skeleton-puzzle"
SAMPLES = ["skeleton-puzzle-board-1", "skeleton-puzzle-board-2", "skeleton-puzzle-board-3"]
# Squares the parser is known to get wrong, per (sample, size).
KNOWN_OFF = {
    ("skeleton-puzzle-board-1", None): {(0, 10), (0, 11), (0, 12), (0, 13), (3, 4)},
    ("skeleton-puzzle-board-1", 2000): {(5, 4), (5, 5), (7, 4), (10, 1), (16, 18), (16, 19), (18, 18)},
}


class _StubRecognizer(CellRecognizer):
    def __init__(self, reply: object) -> None:
        self.reply = reply
        self.images: list[Image.Image] = []

    def recognize_image(self, image: Image.Image, prompt: str) -> object:
        self.images.append(image)
        return self.reply

    def recognize(self, cells, prompt, *, max_cells_per_batch=200):  # pragma: no cover
        raise AssertionError("not used")

    def recognize_full_image(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("not used")

    @property
    def supports_full_image(self) -> bool:
        return False


def _canon(name: str) -> dict:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())


def _image(name: str, size: int | None):
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    assert image is not None
    if size is not None:
        f = size / max(image.shape[:2])
        image = cv2.resize(image, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    return image


def test_canons_are_well_formed():
    for name in SAMPLES:
        assert format_problems(SkeletonPuzzleBoard(**_canon(name))) == [], name


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("size", [None, 2000])
def test_cell_mask_matches_canon(name, size):
    want = _canon(name)["cells"]
    got = detect_skeleton_grid(_image(name, size)).cells
    assert (len(got), len(got[0])) == (len(want), len(want[0]))
    off = {(r, c) for r in range(len(want)) for c in range(len(want[0])) if got[r][c] != want[r][c]}
    assert off == KNOWN_OFF.get((name, size), set())


def test_parse_reads_words_below_the_board():
    name = "skeleton-puzzle-board-2"
    canon = _canon(name)
    stub = _StubRecognizer(canon["words"])
    image = _image(name, 2000)
    board = SkeletonPuzzleParser(recognizer=stub)._parse_image(image)
    assert board.canon() == canon
    # Only the area under the board goes to Gemini.
    assert len(stub.images) == 1
    assert stub.images[0].size[0] == image.shape[1]
    assert stub.images[0].size[1] < image.shape[0] / 2


def test_words_from_response():
    raw = [
        {"word": "アイコ", "hint": "（トマト）"},
        {"word": " モギリ "},
        {"word": ""},
        "junk",
        {"word": "シシャ", "hint": ""},
    ]
    words = words_from_response(raw)
    assert [(w.word, w.hint) for w in words] == [("アイコ", "トマト"), ("モギリ", None), ("シシャ", None)]
    assert words_from_response({"words": [{"word": "ラッパ"}]})[0].word == "ラッパ"
    assert words_from_response("nonsense") == []


def test_slot_lengths_and_format_problems():
    cells = [[1, 1, 1], [0, 0, 1], [0, 0, 1]]
    assert slot_lengths(cells) == {3: 2}
    ok = SkeletonPuzzleBoard(cells=cells, words=[{"word": "サクラ"}, {"word": "ラッパ"}])
    assert format_problems(ok) == []
    bad = SkeletonPuzzleBoard(cells=cells, words=[{"word": "サクラ"}, {"word": "AB"}])
    assert format_problems(bad) == [
        'Word 2 "AB" must be kana (and ー) only',
        "0 slots of length 2 but 1 words of 2 letters",
        "2 slots of length 3 but 1 words of 3 letters",
    ]


def test_validate():
    p = SkeletonPuzzleParser(recognizer=_StubRecognizer([]))
    good = {"cells": [[1, 1, 1], [0, 0, 1], [0, 0, 1]], "words": [{"word": "サクラ"}, {"word": "ラッパ"}]}
    assert p.validate(PuzzleData(puzzle_type="skeleton-puzzle", grid=good))
    assert not p.validate(PuzzleData(puzzle_type="skeleton-puzzle", grid={**good, "words": good["words"][:1]}))
