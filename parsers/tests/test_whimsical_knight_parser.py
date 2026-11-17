"""Tests for the Whimsical Knight parser.

The three sample photos in ``docs/whimsical-knight/`` have no border or grid lines,
and each also shows part of a neighbouring puzzle (and, on the first page, the
knight-move diagram and a "?" face whose dot sits beside the board). No OCR, so the
pipeline is deterministic and each sample is pinned against its hand-checked canon
(each has a unique solution under the rules), at full size and down to 1000 px.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.models import PuzzleData
from puzzle_parsers.whimsical_knight.parser import WhimsicalKnightParser

DOCS_DIR = Path(__file__).parents[2] / "docs" / "whimsical-knight"
SAMPLES = ["board-whimsical-knight", "board-whimsical-knight-2", "board-whimsical-knight-3"]


def _expected(name: str) -> dict:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())


@pytest.mark.parametrize("name", SAMPLES)
def test_sample_matches_canon(name):
    board = WhimsicalKnightParser().parse_file(DOCS_DIR / f"{name}.jpg")
    assert board.model_dump() == _expected(name)


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("long_side", [2000, 1000])
def test_sample_matches_canon_downscaled(name, long_side):
    img = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    f = long_side / max(img.shape[:2])
    small = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    assert WhimsicalKnightParser()._parse_image(small).model_dump() == _expected(name)


def _validate(grid: dict) -> bool:
    return WhimsicalKnightParser().validate(PuzzleData(puzzle_type="whimsical-knight", grid=grid))


def test_validate_accepts_samples():
    for name in SAMPLES:
        assert _validate(_expected(name))


@pytest.mark.parametrize(
    "change",
    [
        {"gray": [[0]]},  # wrong gray size
        {"circles": [{"dr": 1, "dc": 1}]},  # circle in a cell
        {"squares": [{"dr": 1, "dc": 0}]},  # square on a midpoint
        {"circles": [{"dr": 9, "dc": 0}]},  # outside the lattice
        {"circles": [{"dr": 0, "dc": 0}], "squares": [{"dr": 0, "dc": 0}]},  # two clues at one point
    ],
)
def test_validate_rejects_bad_canon(change):
    grid = {"rows": 3, "cols": 3, "gray": [[0, 0], [0, 0]], "circles": [], "squares": []}
    assert not _validate({**grid, **change})
