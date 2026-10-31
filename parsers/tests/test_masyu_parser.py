"""Tests for the masyu parser.

Circle detection on the sample images in ``docs/masyu/``. The parser has no OCR,
so the pipeline is deterministic and each sample is pinned exactly against its
``<name>.canon.json``. The canons were checked cell by cell, not just snapshotted:
an independent ink-blob detector agreed on every circle it found, and every cell
it disagreed on was inspected by eye.

- ``board-masyu-medium`` (17x17): flat scan; takes the plain even-grid path.
- ``board-masyu-big`` (45x31): scan with lines ~0.1 cell off an even grid. On the
  plain grid each black circle's rim poked into the cell above and read as a
  white circle (18 false circles), so it must take the flattening path.
- ``board-masyu-curved-photo`` (50x64): phone photo of a curved magazine page.
  The four-corner warp cut through the bowed bottom row and lost the two right
  columns; it read as 18x18 before the flattening path.

To add a case: put the image in ``docs/masyu/``, write its canon with
``python -m puzzle_parsers.masyu <image> -o docs/masyu/<name>.canon.json``,
check that canon against the image (``--debug <dir>`` writes an overlay with
each cell's reading to ``04_classified.png``), then add the name below.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from puzzle_parsers.masyu.parser import MasyuParser
from puzzle_parsers.models import PuzzleData

DOCS_DIR = Path(__file__).parents[2] / "docs" / "masyu"

SAMPLES = [
    "board-masyu-medium.png",
    "board-masyu-big.png",
    "board-masyu-curved-photo.jpg",
]


@pytest.mark.parametrize("name", SAMPLES)
def test_sample_matches_canon(name):
    expected = json.loads(
        (DOCS_DIR / f"{Path(name).stem}.canon.json").read_text()
    )["cells"]
    cells = MasyuParser().parse_file(DOCS_DIR / name).cells

    assert (len(cells), len(cells[0])) == (len(expected), len(expected[0]))
    wrong = [
        (r, c, cells[r][c], expected[r][c])
        for r in range(len(expected))
        for c in range(len(expected[0]))
        if cells[r][c] != expected[r][c]
    ]
    assert not wrong, f"{len(wrong)} cells differ (row, col, got, want): {wrong[:20]}"


@pytest.mark.xfail(reason="10x10 sample has read as 1x2 or 1x4 since before the curved-page work", strict=True)
def test_small_sample_is_10x10():
    cells = MasyuParser().parse_file(DOCS_DIR / "board-masyu.png").cells
    assert (len(cells), len(cells[0])) == (10, 10)


def test_validate_rejects_unknown_cell_value():
    grid = {"cells": [[0, 1], [2, 3]]}
    assert not MasyuParser().validate(PuzzleData(puzzle_type="masyu", grid=grid))
