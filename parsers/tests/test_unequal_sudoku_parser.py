"""Tests for the unequal sudoku parser.

The board is found as a lattice of separate squares (no grid lines), and the
inequality signs are read geometrically, so geometry and signs are deterministic
and pinned exactly against the hand-checked canons in ``docs/unequal-sudoku/``.
Givens need EasyOCR and are left out here (no OCR backend: every hint reads 0).
Both photos show other squares (neighbouring boards cut off at the page edge, an
answer strip, the rules-box example, the 1-9 number bar), which guards that the
detector picks the main board. Board 1 has a sign whose tip touches a cell
outline (row 2, between columns 6 and 7).
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from puzzle_parsers.unequal_sudoku.parser import UnequalSudokuParser, sign_direction

DOCS_DIR = Path(__file__).parents[2] / "docs" / "unequal-sudoku"
SAMPLES = ["unequal-sudoku-board-1", "unequal-sudoku-board-2"]


def _expected(name: str) -> dict:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())


@pytest.mark.parametrize("name", SAMPLES)
def test_signs_match_canon(name):
    board = UnequalSudokuParser().parse_file(DOCS_DIR / f"{name}.jpg")
    expected = _expected(name)
    assert board.right == expected["right"]
    assert board.down == expected["down"]
    assert board.hints == [[0] * 9 for _ in range(9)]


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("width", [1080, 800])
def test_signs_survive_downscale(name, width):
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    small = cv2.resize(
        image, (width, image.shape[0] * width // image.shape[1]), interpolation=cv2.INTER_AREA
    )
    board = UnequalSudokuParser()._parse_image(small)
    expected = _expected(name)
    assert (board.right, board.down) == (expected["right"], expected["down"])


def _chevron(tip_left: bool) -> np.ndarray:
    mask = np.zeros((40, 20), np.uint8)
    tip, back = (3, 16) if tip_left else (16, 3)
    cv2.polylines(mask, [np.array([[back, 4], [tip, 20], [back, 36]])], False, 255, 3)
    return mask


def test_sign_direction_reads_each_chevron():
    assert sign_direction(_chevron(tip_left=True), horizontal=True) == 1  # <
    assert sign_direction(_chevron(tip_left=False), horizontal=True) == 2  # >
    assert sign_direction(_chevron(tip_left=True).T, horizontal=False) == 1  # ∧
    assert sign_direction(_chevron(tip_left=False).T, horizontal=False) == 2  # ∨
    assert sign_direction(np.zeros((40, 20), np.uint8), horizontal=True) == 0
