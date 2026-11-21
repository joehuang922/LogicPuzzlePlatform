"""Tests for the Tile Paint parser.

Geometry, walls, clue cells and the half-ink test are deterministic and pinned against
the hand-checked canons in ``docs/tile-paint/`` at full size and the Android upload size
(2000 px long side). The small and medium photos also show parts of neighbouring boards.
Each canon has a unique solution under the rules (``*.solution.json``, CP-SAT), which
also checks the transcription.

Clue numbers come from the Gemini cell classifier, so ``classify_cells`` is replaced by a
spy that answers from the canon, reporting an empty half as 0 the way the classifier
does; the tests cover which cells are sent and how reads become the canon, including a
0 clue against an empty half. (Live Gemini reads of all three samples matched the
canons exactly at full size and 2000 px when the parser was written.)
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from puzzle_parsers.cell_classify import DualInteger, Empty
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.tile_paint import parser as tp
from puzzle_parsers.tile_paint.grid_detector import detect_tile_paint, find_clue_cells, half_ink
from puzzle_parsers.tile_paint.parser import TilePaintParser

DOCS_DIR = Path(__file__).parents[2] / "docs" / "tile-paint"
SAMPLES = [f"board-tile-paint-{n}" for n in ("small", "medium", "big")]
SIZES = [None, 2000]


class _Recognizer:
    """Stands in for Gemini: the spy never calls it."""


def _expected(name: str) -> dict:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())


def _image(name: str, size: int | None):
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    assert image is not None
    if size is not None:
        f = size / max(image.shape[:2])
        image = cv2.resize(image, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    return image


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("size", SIZES)
def test_parse_matches_canon_with_reads_stubbed(name, size, monkeypatch):
    expected = _expected(name)
    cells = expected["cells"]

    def spy(recognizer, crops, targets):
        assert len(crops) == len(cells) and len(crops[0]) == len(cells[0])
        out = []
        for r, row in enumerate(crops):
            line = []
            for c, crop in enumerate(row):
                clue = cells[r][c]
                if clue is None or (clue["right"] is None and clue["down"] is None):
                    # Tile cells and blank clue cells are sent blank (or not at all).
                    assert crop.min() == 255 or clue is not None
                    line.append(Empty())
                else:
                    line.append(DualInteger(top_right=clue["right"] or 0, bottom_left=clue["down"] or 0))
            out.append(line)
        return out

    monkeypatch.setattr(tp, "classify_cells", spy)
    board = TilePaintParser(recognizer=_Recognizer())._parse_image(_image(name, size))
    assert board.model_dump() == expected


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("size", SIZES)
def test_clue_cells_and_inked_halves(name, size):
    cells = _expected(name)["cells"]
    geom = detect_tile_paint(_image(name, size))
    clue = find_clue_cells(geom.gray, geom.grid)
    assert clue == [[cell is not None for cell in row] for row in cells]
    for r, row in enumerate(cells):
        for c, cell in enumerate(row):
            if cell is None:
                continue
            right, down = half_ink(geom.gray, geom.grid, r, c)
            # A strip cell's empty half is dropped anyway (no run): only the number's
            # own half must be seen.
            if cell["right"] is not None:
                assert right, (r, c)
            if cell["down"] is not None:
                assert down, (r, c)
            if r > 0 and c > 0:  # inner cells: both halves exact
                assert (right, down) == (cell["right"] is not None, cell["down"] is not None), (r, c)


def test_zero_is_kept_and_empty_half_is_none(monkeypatch):
    """The classifier says 0 for an empty half too; the ink test tells them apart."""
    name = "board-tile-paint-medium"
    expected = _expected(name)
    assert expected["cells"][15][22] == {"right": 0, "down": 6}  # a printed 0
    assert expected["cells"][0][4] == {"right": None, "down": 0}  # a 0 strip clue

    def spy(recognizer, crops, targets):
        return [[DualInteger(top_right=0, bottom_left=0) for _ in row] for row in crops]

    monkeypatch.setattr(tp, "classify_cells", spy)
    board = TilePaintParser(recognizer=_Recognizer())._parse_image(_image(name, 2000))
    assert board.cells[15][22].right == 0
    assert board.cells[0][4].down == 0 and board.cells[0][4].right is None
    assert board.cells[1][0].right == 0 and board.cells[1][0].down is None
    assert board.cells[0][0].right is None and board.cells[0][0].down is None


@pytest.mark.parametrize("name", [*SAMPLES, "board-tile-paint-example"])
def test_solution_keeps_the_rules(name):
    canon = _expected(name)
    shaded = json.loads((DOCS_DIR / f"{name}.solution.json").read_text())["shaded"]
    cells, h, v = canon["cells"], canon["grids"]["h"], canon["grids"]["v"]
    rows, cols = len(cells), len(cells[0])
    tile = lambda r, c: 0 <= r < rows and 0 <= c < cols and cells[r][c] is None
    for r in range(rows):
        for c in range(cols):
            if not tile(r, c):
                assert shaded[r][c] == 0
                clue = cells[r][c]
                for key, dr, dc in (("right", 0, 1), ("down", 1, 0)):
                    if clue[key] is None:
                        continue
                    run, rr, cc = 0, r + dr, c + dc
                    while tile(rr, cc):
                        run += shaded[rr][cc]
                        rr, cc = rr + dr, cc + dc
                    assert run == clue[key], (r, c, key)
                continue
            # tiles are shaded whole
            if tile(r + 1, c) and h[r][c] == 0:
                assert shaded[r][c] == shaded[r + 1][c]
            if tile(r, c + 1) and v[r][c] == 0:
                assert shaded[r][c] == shaded[r][c + 1]


def test_validate():
    p = TilePaintParser(recognizer=_Recognizer())
    ok = _expected("board-tile-paint-example")
    assert p.validate(PuzzleData(puzzle_type="tile-paint", grid=ok))
    over = json.loads(json.dumps(ok))
    over["cells"][0][1]["down"] = 5  # more than its 4 cells
    dangling = json.loads(json.dumps(ok))
    dangling["grids"]["h"][2][3] = 0
    dangling["grids"]["h"][2][4] = 0
    dangling["grids"]["v"][3][3] = 0
    dangling["grids"]["v"][4][3] = 1
    dangling["grids"]["v"][4][2] = 0
    dangling["grids"]["h"][3][3] = 0  # (3,3)-(4,4) one tile, with a wall inside it
    no_numbers = json.loads(json.dumps(ok))
    for row in no_numbers["cells"]:
        for i, cell in enumerate(row):
            if cell is not None:
                row[i] = {"right": None, "down": None}
    for bad in (over, dangling, no_numbers):
        assert not p.validate(PuzzleData(puzzle_type="tile-paint", grid=bad))


def test_normalize_clue_walls():
    clue = [[True, True], [True, False]]
    h, v = tp.normalize_clue_walls(clue, [[1, 0]], [[1], [0]])
    assert h == [[0, 1]] and v == [[0], [1]]
