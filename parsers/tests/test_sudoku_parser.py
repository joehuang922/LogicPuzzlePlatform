"""Sudoku geometry: board size and room size on 9x9 and bigger boards.

The samples are a plain 9x9 (docs/combo-sudoku/board_sudoku.jpg) and three
magazine giants in docs/sudoku: 16x16 with 4x4 rooms, 25x25 with 5x5, and a
two-page 30x30 spread whose rooms are 6 wide and 5 tall. Each keeps its size
at full and Android upload size (longest side 2000px). The clues need EasyOCR
and are left out here; the *.canon.json beside each giant is its true grid.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from puzzle_parsers.models import PuzzleData
from puzzle_parsers.sudoku.parser import SudokuParser, infer_rooms

DOCS = Path(__file__).parents[2] / "docs"
SAMPLES = [
    ("combo-sudoku/board_sudoku.jpg", 3, 3),
    ("sudoku/board-sudoku-16x16.jpg", 4, 4),
    ("sudoku/board-sudoku-25x25.jpg", 5, 5),
    ("sudoku/board-sudoku-30x30.jpg", 6, 5),
]


class _NoOcr:
    """Reads every cell as empty: these tests check geometry, not clues."""

    supports_full_image = False

    def recognize_cells(self, cells, **_):
        return [[-1] * len(row) for row in cells]


def _android(img: Image.Image) -> Image.Image:
    s = 2000 / max(img.size)
    return img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS) if s < 1 else img


@pytest.mark.parametrize("android", [False, True], ids=["full", "android"])
@pytest.mark.parametrize("name, room_width, room_height", SAMPLES)
def test_board_and_room_size(name, room_width, room_height, android):
    img = Image.open(DOCS / name).convert("RGB")
    grid = SudokuParser(ocr_backend=_NoOcr())._parse(_android(img) if android else img).grid
    size = room_width * room_height
    assert len(grid["hints"]) == size and all(len(row) == size for row in grid["hints"])
    if size == 9:
        # A 9x9 canon is unchanged: no room size.
        assert set(grid) == {"hints"}
    else:
        assert (grid["room_width"], grid["room_height"]) == (room_width, room_height)


def _walls(size: int, room_width: int, room_height: int) -> tuple[list[list[int]], list[list[int]]]:
    h = [[int((r + 1) % room_height == 0)] * size for r in range(size - 1)]
    v = [[int((c + 1) % room_width == 0) for c in range(size - 1)] for _ in range(size)]
    return h, v


@pytest.mark.parametrize("size, room_width, room_height", [(16, 4, 4), (25, 5, 5), (30, 6, 5), (30, 5, 6), (12, 4, 3)])
def test_infer_rooms_from_walls(size, room_width, room_height):
    assert infer_rooms(size, *_walls(size, room_width, room_height)) == (room_width, room_height)


def test_infer_rooms_outvotes_a_stray_thick_line():
    # A page fold read as one more thick column line (after column 15) on 6-wide rooms.
    h, v = _walls(30, 6, 5)
    for row in v:
        row[14] = 1
    assert infer_rooms(30, h, v) == (6, 5)


def test_validate_checks_size_against_rooms():
    parser = SudokuParser(ocr_backend=_NoOcr())
    ok = PuzzleData(puzzle_type="sudoku", grid={"room_width": 4, "room_height": 4, "hints": np.zeros((16, 16), int).tolist()})
    assert parser.validate(ok)
    wrong = PuzzleData(puzzle_type="sudoku", grid={"room_width": 4, "room_height": 4, "hints": np.zeros((9, 9), int).tolist()})
    assert not parser.validate(wrong)
    too_big = PuzzleData(puzzle_type="sudoku", grid={"hints": [[10] * 9 for _ in range(9)]})
    assert not parser.validate(too_big)
