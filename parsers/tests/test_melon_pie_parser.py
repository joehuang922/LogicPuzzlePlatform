"""Tests for the Melon Pie parser.

The read is deterministic (no OCR or Gemini): lattice size and circles are pinned
against the hand-transcribed canons in ``docs/melon-pie/`` at full size, the Android
upload size (2000px long side), 1080 and 800px. The board has no solid border, and each
photo has fingers and neighbouring boards in it: sample 1's puzzle 2 cut off below,
sample 3's puzzle 2 ending one cell above puzzle 3. Every pinned canon has exactly one
solution (``*.solution.json``).
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.melon_pie.parser import MelonPieParser
from puzzle_parsers.models import PuzzleData

DOCS_DIR = Path(__file__).parents[2] / "docs" / "melon-pie"
SAMPLES = ["board-melon-pie-1", "board-melon-pie-2", "board-melon-pie-3"]


def _resize_long_side(image, long_side: int):
    h, w = image.shape[:2]
    s = long_side / max(h, w)
    return cv2.resize(image, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)


def _sorted(canon: dict) -> dict:
    return {**canon, "circles": sorted(canon["circles"], key=lambda c: (c["r"], c["c"]))}


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("long_side", [None, 2000, 1080, 800])
def test_parse_matches_canon(name, long_side):
    expected = json.loads((DOCS_DIR / f"{name}.canon.json").read_text())
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    assert image is not None
    if long_side is not None:
        image = _resize_long_side(image, long_side)
    board = MelonPieParser()._parse_image(image)
    assert _sorted(board.model_dump()) == _sorted(expected)


def test_validate():
    p = MelonPieParser()
    good = {"width": 2, "height": 2, "circles": [{"r": 0, "c": 0, "color": 1}, {"r": 2, "c": 2, "color": 1}]}
    assert p.validate(PuzzleData(puzzle_type="melon-pie", grid=good))
    off = {**good, "circles": [{"r": 3, "c": 0, "color": 0}]}
    twice = {**good, "circles": [{"r": 1, "c": 1, "color": 0}, {"r": 1, "c": 1, "color": 2}]}
    colour = {**good, "circles": [{"r": 1, "c": 1, "color": 3}]}
    for bad in (off, twice, colour):
        assert not p.validate(PuzzleData(puzzle_type="melon-pie", grid=bad)), bad
