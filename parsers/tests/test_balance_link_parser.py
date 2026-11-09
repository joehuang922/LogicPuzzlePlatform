"""Tests for the Balance Link parser.

Grid geometry and black cells are deterministic and pinned against the hand-checked
canons in ``docs/balance-link/`` at full size and the Android upload sizes. The photos
show neighbouring puzzles (board 1 also the rule example above it), and board 2 has
filled black diamonds and stars that a centre-only fill test would call black cells.

Symbols come from Gemini, so ``classify_cells`` is replaced by a spy here: it checks
black cells are blanked out of the montage and returns the canon's symbol per cell, so
the test covers how reads become the canon. (Live Gemini reads of both boards matched
the canons exactly at full, 1080 and 800 px when the parser was written.)
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from puzzle_parsers.balance_link import parser as bl
from puzzle_parsers.balance_link.parser import BalanceLinkParser, is_black_cell
from puzzle_parsers.cell_classify import Empty, Symbol
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer

DOCS_DIR = Path(__file__).parents[2] / "docs" / "balance-link"
SAMPLES = ["balance-link-board-1", "balance-link-board-2"]


class _NoRecognizer(CellRecognizer):
    def recognize(self, cells, prompt, *, max_cells_per_batch=200):  # pragma: no cover
        raise AssertionError("the spy replaces classify_cells")

    def recognize_full_image(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("not used")

    @property
    def supports_full_image(self) -> bool:
        return False


def _expected(name: str) -> list[list[int]]:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())["cells"]


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("width", [None, 1080, 800])
def test_parse_matches_canon_with_symbol_reads_stubbed(name, width, monkeypatch):
    expected = _expected(name)
    blanked: set[tuple[int, int]] = set()

    def spy(recognizer, crops, targets):
        out = []
        for r, row in enumerate(crops):
            line = []
            for c, crop in enumerate(row):
                if np.all(crop == 255):
                    blanked.add((r, c))
                v = expected[r][c]
                line.append(Symbol(code=v) if v >= 10 else Empty())
            out.append(line)
        return out

    monkeypatch.setattr(bl, "classify_cells", spy)
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    assert image is not None
    if width is not None:
        image = cv2.resize(
            image, (width, image.shape[0] * width // image.shape[1]), interpolation=cv2.INTER_AREA
        )
    board = BalanceLinkParser(recognizer=_NoRecognizer())._parse_image(image)
    assert board.cells == expected
    assert blanked == {(r, c) for r, row in enumerate(expected) for c, v in enumerate(row) if v == 1}


def test_black_cell_needs_dark_corners():
    black = np.zeros((50, 50), np.uint8)
    assert is_black_cell(black)
    # A filled disc darkens most of the centre but not the corners.
    disc = np.full((50, 50), 255, np.uint8)
    cv2.circle(disc, (25, 25), 24, 0, -1)
    assert not is_black_cell(disc)
    assert not is_black_cell(np.full((50, 50), 255, np.uint8))


def test_unknown_symbol_codes_read_as_white(monkeypatch):
    monkeypatch.setattr(
        bl, "classify_cells",
        lambda rec, crops, targets: [[Symbol(code=99) for _ in row] for row in crops],
    )
    image = cv2.imread(str(DOCS_DIR / "balance-link-board-1.jpg"))
    board = BalanceLinkParser(recognizer=_NoRecognizer())._parse_image(image)
    assert {v for row in board.cells for v in row} <= {0, 1}


def test_validate():
    p = BalanceLinkParser(recognizer=_NoRecognizer())
    ok = PuzzleData(puzzle_type="balance-link", grid={"cells": [[0, 61], [1, 61]]})
    assert p.validate(ok)
    for cells in ([[0, 2], [0, 0]], [[0, 80], [0, 0]], [[0, 0], [0]], [[0]]):
        assert not p.validate(PuzzleData(puzzle_type="balance-link", grid={"cells": cells})), cells
