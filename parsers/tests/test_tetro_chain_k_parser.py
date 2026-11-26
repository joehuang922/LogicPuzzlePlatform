"""Tests for the Tetro Chain K parser.

The read is deterministic (no OCR or Gemini): board size and circles are pinned against
the checked canons in ``docs/tetro-chain-k/`` at full size, the Android upload size
(2000px long side) and 1080px. Each photo also shows parts of other boards; on sample 4
the previous puzzle's bottom border sits right above the board on the same columns (the
shared projection box must skip the gap). Every pinned canon has exactly one solution
under the type's five rules (``*.solution.json``).
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.tetro_chain_k.parser import TetroChainKParser
from puzzle_parsers.models import PuzzleData

DOCS_DIR = Path(__file__).parents[2] / "docs" / "tetro-chain-k"
SAMPLES = ["board-tetro-chain-k-1", "board-tetro-chain-k-2", "board-tetro-chain-k-3", "board-tetro-chain-k-4"]


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
    board = TetroChainKParser()._parse_image(image)
    assert _sorted(board.model_dump()) == _sorted(expected)


def test_validate():
    p = TetroChainKParser()
    good = {"width": 2, "height": 2, "circles": [{"dr": 2, "dc": 2, "color": 1}, {"dr": 1, "dc": 2, "color": 2}]}
    assert p.validate(PuzzleData(puzzle_type="tetro-chain-k", grid=good))
    centre = {**good, "circles": [{"dr": 1, "dc": 1, "color": 0}]}
    twice = {**good, "circles": [{"dr": 2, "dc": 2, "color": 0}, {"dr": 2, "dc": 2, "color": 1}]}
    outside = {**good, "circles": [{"dr": 4, "dc": 2, "color": 0}]}
    for bad in (centre, twice, outside):
        assert not p.validate(PuzzleData(puzzle_type="tetro-chain-k", grid=bad)), bad
