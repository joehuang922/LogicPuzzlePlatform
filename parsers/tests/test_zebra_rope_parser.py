"""Tests for the Zebra Rope parser.

Rope and circle detection on the two sample photos in ``docs/zebra-rope/``. No OCR, so
the pipeline is deterministic and both samples are pinned against their hand-checked
canons. Each photo also shows part of the neighbouring puzzle, so this guards that the
detector picks the complete board. The samples are also read at the Android upload
size (2000 px long side) and well below it, where a rope crossing a grid line blurs
into a ring-like ghost circle.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.models import PuzzleData
from puzzle_parsers.zebra_rope.grid_detector import chain_ropes
from puzzle_parsers.zebra_rope.parser import ZebraRopeParser

DOCS_DIR = Path(__file__).parents[2] / "docs" / "zebra-rope"
SAMPLES = ["board-zebra-rope-1", "board-zebra-rope-2"]


def _expected(name: str) -> dict:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())


def _assert_matches(board: dict, expected: dict) -> None:
    assert (board["width"], board["height"]) == (expected["width"], expected["height"])
    assert board["ropes"] == expected["ropes"]
    assert board["circles"] == expected["circles"]


@pytest.mark.parametrize("name", SAMPLES)
def test_sample_matches_canon(name):
    board = ZebraRopeParser().parse_file(DOCS_DIR / f"{name}.jpg")
    _assert_matches(board.model_dump(), _expected(name))


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("long_side", [2000, 1000])
def test_sample_matches_canon_downscaled(name, long_side):
    img = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    f = long_side / max(img.shape[:2])
    small = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    board = ZebraRopeParser()._parse_image(small)
    _assert_matches(board.model_dump(), _expected(name))


def test_chain_ropes_keeps_crossing_ropes_apart():
    # A horizontal rope and a vertical rope cross at (1, 1); a third bends at (3, 3).
    steps = {
        ((1, 0), (1, 1)), ((1, 1), (1, 2)),
        ((0, 1), (1, 1)), ((1, 1), (2, 1)),
        ((3, 2), (3, 3)), ((2, 4), (3, 3)),
    }
    assert chain_ropes(steps) == [
        [(0, 1), (1, 1), (2, 1)],
        [(1, 0), (1, 1), (1, 2)],
        [(2, 4), (3, 3), (3, 2)],
    ]


def _validate(grid: dict) -> bool:
    return ZebraRopeParser().validate(PuzzleData(puzzle_type="zebra-rope", grid=grid))


def test_validate_accepts_sample_canon():
    assert _validate(_expected(SAMPLES[0]))


@pytest.mark.parametrize(
    "ropes,circles",
    [
        ([[[0, 0], [2, 0]]], []),  # a rope that jumps a cell
        ([[[0, 0], [1, 1], [0, 0]]], []),  # a rope that revisits a cell
        ([[[0, 0], [0, 4]]], []),  # off the grid
        ([], [{"dr": 3, "dc": 3, "color": 0}]),  # circle at a cell centre
        ([], [{"dr": 0, "dc": 2, "color": 0}]),  # circle on the outer border
        ([], [{"dr": 2, "dc": 2, "color": 3}]),  # unknown colour
    ],
)
def test_validate_rejects_bad_canon(ropes, circles):
    assert not _validate({"width": 4, "height": 4, "ropes": ropes, "circles": circles})
