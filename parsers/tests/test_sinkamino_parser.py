"""Tests for the Sinkamino parser.

No OCR is involved, so the whole canon — black cells, given squares and arrow trails —
is pinned exactly against the hand-checked canons in ``docs/sinkamino/``, at full size
and at the Android upload sizes. The photos are of a curved page (the straight lattice
drifts ~0.15 cell near board 1's edges), show neighbouring puzzles, print some squares
faintly near the page edge, and have trails that start or end inside a given square.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.models import PuzzleData
from puzzle_parsers.sinkamino.parser import SinkaminoParser, assemble_trails

DOCS_DIR = Path(__file__).parents[2] / "docs" / "sinkamino"
SAMPLES = ["sinkamino-board-1", "sinkamino-board-2", "sinkamino-board-3"]


def _expected(name: str) -> dict:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("width", [None, 1080, 800])
def test_parse_matches_canon(name, width):
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    assert image is not None
    if width is not None:
        image = cv2.resize(
            image, (width, image.shape[0] * width // image.shape[1]), interpolation=cv2.INTER_AREA
        )
    board = SinkaminoParser()._parse_image(image)
    expected = _expected(name)
    assert board.cells == expected["cells"]
    assert sorted(board.arrows) == sorted(expected["arrows"])


def test_trail_runs_tail_to_head_and_drops_unclear_chains():
    h = v = [0, 10, 20, 30, 40]
    links = {((0, 0), (0, 1)), ((0, 1), (0, 2))}
    # Arrowhead near (0, 2): the trail runs (0,0) -> (0,2).
    assert assemble_trails(links, [(25.0, 5.0)], h, v) == [[[0, 0], [0, 1], [0, 2]]]
    # And reversed when the head is at (0, 0).
    assert assemble_trails(links, [(5.0, 5.0)], h, v) == [[[0, 2], [0, 1], [0, 0]]]
    # No arrowhead: dropped for the admin to draw.
    assert assemble_trails(links, [], h, v) == []
    # A branch isn't a trail.
    branch = links | {((0, 1), (1, 1))}
    assert assemble_trails(branch, [(25.0, 5.0)], h, v) == []


@pytest.mark.parametrize("name", SAMPLES)
def test_sample_canons_validate(name):
    assert SinkaminoParser().validate(PuzzleData(puzzle_type="sinkamino", grid=_expected(name)))


def test_validate_rejects_broken_trails():
    p = SinkaminoParser()
    cells = [[0, 1], [0, 0]]
    ok = PuzzleData(puzzle_type="sinkamino", grid={"cells": cells, "arrows": [[[0, 0], [1, 0], [1, 1]]]})
    assert p.validate(ok)
    for arrows in ([[[0, 0]]], [[[0, 0], [0, 1]]], [[[0, 0], [1, 1]]], [[[1, 1], [2, 1]]]):
        bad = PuzzleData(puzzle_type="sinkamino", grid={"cells": cells, "arrows": arrows})
        assert not p.validate(bad), arrows
