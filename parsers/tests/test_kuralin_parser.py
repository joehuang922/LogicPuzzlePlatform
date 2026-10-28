"""Tests for the Kuralin parser.

Circle detection on the real sample photos in ``docs/kuralin/``. The parser has no
OCR, so the whole pipeline is deterministic and the samples can be pinned exactly:
sample 1 against its hand-checked canon, sample 2 against a hand count. Sample 1 also
has a small worked example above the puzzle, so this guards that the detector picks
the main board.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from puzzle_parsers.kuralin.parser import KuralinParser
from puzzle_parsers.models import PuzzleData

DOCS_DIR = Path(__file__).parents[2] / "docs" / "kuralin"

# Sample 2 (puzzle ⑤), hand-read from the photo as (dr, dc, color).
SAMPLE_2_CIRCLES = {
    (1, 8, 2), (2, 2, 0), (2, 12, 2), (3, 16, 2), (3, 18, 2), (4, 4, 0), (4, 6, 1),
    (5, 12, 1), (6, 17, 2), (9, 8, 1), (10, 2, 1), (10, 10, 2), (10, 17, 1),
    (12, 11, 1), (12, 14, 2), (14, 2, 1), (14, 6, 0), (14, 8, 2), (14, 17, 2),
    (16, 2, 2), (17, 16, 2), (17, 18, 2), (18, 4, 2), (18, 8, 0), (18, 12, 1),
}


def _circles(board) -> set[tuple[int, int, int]]:
    return {(c.dr, c.dc, c.color) for c in board.circles}


def test_sample_1_matches_canon():
    expected = json.loads((DOCS_DIR / "kuralin-small.canon.json").read_text())
    board = KuralinParser().parse_file(DOCS_DIR / "kuralin-small.jpg")
    assert (board.width, board.height) == (expected["width"], expected["height"])
    assert _circles(board) == {(c["dr"], c["dc"], c["color"]) for c in expected["circles"]}


def test_sample_2_matches_hand_count():
    board = KuralinParser().parse_file(DOCS_DIR / "kuralin-small-2.jpg")
    assert (board.width, board.height) == (10, 10)
    assert _circles(board) == SAMPLE_2_CIRCLES


@pytest.mark.parametrize(
    "circle",
    [
        {"dr": 3, "dc": 3, "color": 0},  # cell center
        {"dr": 0, "dc": 2, "color": 0},  # outer border
        {"dr": 2, "dc": 2, "color": 3},  # unknown color
    ],
)
def test_validate_rejects_bad_circle(circle):
    grid = {"width": 4, "height": 4, "circles": [circle]}
    assert not KuralinParser().validate(PuzzleData(puzzle_type="kuralin", grid=grid))


def test_validate_accepts_edge_and_corner_circles():
    grid = {
        "width": 4,
        "height": 4,
        "circles": [{"dr": 2, "dc": 2, "color": 1}, {"dr": 1, "dc": 4, "color": 2}],
    }
    assert KuralinParser().validate(PuzzleData(puzzle_type="kuralin", grid=grid))
