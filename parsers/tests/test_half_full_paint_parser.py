"""Tests for the Half-Full Paint parser.

The read is deterministic (no OCR or Gemini): board, walls and circles are pinned
against the hand-checked canons in ``docs/half-full-paint/`` at full size, the Android
upload size (2000px long side) and 1080px. Each photo also shows parts of other boards,
and sample 1 the complete example board beside the puzzle; the border finder must pick
the puzzle. Every pinned canon has exactly one solution (``*.solution.json``).
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.half_full_paint.parser import HalfFullPaintParser
from puzzle_parsers.models import PuzzleData

DOCS_DIR = Path(__file__).parents[2] / "docs" / "half-full-paint"
SAMPLES = ["board-half-full-paint-1", "board-half-full-paint-2", "board-half-full-paint-3"]


def _resize_long_side(image, long_side: int):
    h, w = image.shape[:2]
    s = long_side / max(h, w)
    return cv2.resize(image, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)


def _sorted(canon: dict) -> dict:
    return {**canon, "circles": sorted(canon["circles"], key=lambda c: (c["dr"], c["dc"]))}


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("long_side", [None, 2000, 1080])
def test_parse_matches_canon(name, long_side):
    expected = json.loads((DOCS_DIR / f"{name}.canon.json").read_text())
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    assert image is not None
    if long_side is not None:
        image = _resize_long_side(image, long_side)
    board = HalfFullPaintParser()._parse_image(image)
    assert _sorted(board.model_dump()) == _sorted(expected)


def test_validate():
    p = HalfFullPaintParser()
    good = {"width": 2, "height": 2, "grids": {"h": [[0, 1]], "v": [[0], [1]]},
            "circles": [{"dr": 2, "dc": 2, "color": 1}, {"dr": 1, "dc": 2, "color": 2}]}
    assert p.validate(PuzzleData(puzzle_type="half-full-paint", grid=good))
    centre = {**good, "circles": [{"dr": 1, "dc": 1, "color": 0}]}
    twice = {**good, "circles": [{"dr": 2, "dc": 2, "color": 0}, {"dr": 2, "dc": 2, "color": 1}]}
    outside = {**good, "circles": [{"dr": 4, "dc": 2, "color": 0}]}
    walls = {**good, "grids": {"h": [[0]], "v": [[0], [1]]}}
    for bad in (centre, twice, outside, walls):
        assert not p.validate(PuzzleData(puzzle_type="half-full-paint", grid=bad)), bad
