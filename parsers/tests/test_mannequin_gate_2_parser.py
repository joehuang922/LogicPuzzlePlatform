"""Tests for the Mannequin Gate 2 parser.

The parse is pure OpenCV (grid lattice plus stroke tracing), so it is pinned end to end
against the hand-checked canons in ``docs/mannequin-gate-2/`` at full size and the
Android upload size (2000px long side). Each canon is the only read under which its
board has a unique solution (checked with CP-SAT). The traced lines are compared as
sets, each line in either direction.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest
from PIL import Image

from puzzle_parsers.mannequin_gate_2.models import MannequinGate2Board
from puzzle_parsers.mannequin_gate_2.parser import MannequinGate2Parser, format_problems
from puzzle_parsers.models import PuzzleData

DOCS_DIR = Path(__file__).parents[2] / "docs" / "mannequin-gate-2"
SAMPLES = [f"mannequin-gate-2-board-{i}" for i in range(1, 5)]


def _expected(name: str) -> dict:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())


def _norm(lines: list[list[list[int]]]) -> list[tuple]:
    return sorted(min(tuple(map(tuple, line)), tuple(map(tuple, line[::-1]))) for line in lines)


def _load(name: str, long_side: int | None):
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    assert image is not None
    if long_side is not None:
        scale = long_side / max(image.shape[:2])
        image = cv2.resize(
            image,
            (round(image.shape[1] * scale), round(image.shape[0] * scale)),
            interpolation=cv2.INTER_AREA,
        )
    return image


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("long_side", [None, 2000])
def test_parse_matches_canon(name, long_side):
    expected = _expected(name)
    board = MannequinGate2Parser()._parse_image(_load(name, long_side))
    assert (board.rows, board.cols) == (expected["rows"], expected["cols"])
    assert _norm(board.lines) == _norm(expected["lines"])


def test_parse_validates_against_the_schema():
    image = Image.open(DOCS_DIR / f"{SAMPLES[0]}.jpg").convert("RGB")
    data = MannequinGate2Parser().parse(image)
    assert data.puzzle_type == "mannequin-gate-2"
    assert _norm(data.grid["lines"]) == _norm(_expected(SAMPLES[0])["lines"])


def test_validate():
    p = MannequinGate2Parser()
    ok = {"rows": 2, "cols": 2, "lines": [[[0, 0], [1, 1]], [[0, 1], [1, 0]]]}
    assert p.validate(PuzzleData(puzzle_type="mannequin-gate-2", grid=ok))
    for lines in (
        [[[0, 0]]],  # too short
        [[[0, 0], [2, 0]]],  # off the board and not neighbours
        [[[0, 0], [0, 1], [0, 0]]],  # revisits a cell
        [[[0, 0], [0, 1]], [[0, 1], [0, 0]]],  # shared step
    ):
        assert not p.validate(PuzzleData(puzzle_type="mannequin-gate-2", grid={"rows": 2, "cols": 2, "lines": lines})), lines


def test_format_problems_clean_on_samples():
    for name in SAMPLES:
        assert format_problems(MannequinGate2Board(**_expected(name))) == []
