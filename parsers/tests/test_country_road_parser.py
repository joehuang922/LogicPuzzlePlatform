"""Tests for the Country Road parser.

Geometry and walls are deterministic and pinned against the hand-checked canons in
``docs/country-road/`` at full size and the Android upload size (2000 px long side).
Every photo also shows part of a neighbouring board. Each canon has a unique solution
under the four rules (``*.solution.json``, CP-SAT), which also checks the transcription.

Room numbers come from EasyOCR, so ``read_grid_clues`` is replaced by a spy returning
the canon's numbers; the tests cover geometry, walls and how reads become the canon.
(Live EasyOCR reads of all three samples matched the canons exactly at full size and
2000 px when the parser was written.)
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.country_road import parser as cp
from puzzle_parsers.country_road.parser import CountryRoadParser, room_ids
from puzzle_parsers.models import PuzzleData

DOCS_DIR = Path(__file__).parents[2] / "docs" / "country-road"
SAMPLES = ["board-country-road", "board-country-road-2", "board-country-road-3"]
SIZES = [None, 2000]


class _Ocr:
    """Stands in for the backend: the spy never calls it."""


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

    def spy(ocr, image, h_lines, v_lines, *, allow_multi_digits, allow_zero=False, max_value=None):
        assert allow_multi_digits and not allow_zero
        assert (len(h_lines) - 1, len(v_lines) - 1) == (len(expected["cells"]), len(expected["cells"][0]))
        return [[v if v > 0 else 0 for v in row] for row in expected["cells"]]

    monkeypatch.setattr(cp, "read_grid_clues", spy)
    board = CountryRoadParser(ocr_backend=_Ocr())._parse_image(_image(name, size))
    assert board.model_dump() == expected


def test_second_read_in_a_room_is_dropped(monkeypatch):
    name = SAMPLES[0]
    expected = _expected(name)

    def spy(ocr, image, h_lines, v_lines, **kwargs):
        cells = [row[:] for row in expected["cells"]]
        cells[0][1] = 7  # same room as the 4 at (0, 0)
        cells[1][1] = -1  # an unreadable cell
        return cells

    monkeypatch.setattr(cp, "read_grid_clues", spy)
    board = CountryRoadParser(ocr_backend=_Ocr())._parse_image(_image(name, 2000))
    assert board.cells == expected["cells"]


@pytest.mark.parametrize("name", SAMPLES)
def test_solution_keeps_the_rules(name):
    canon = _expected(name)
    edges = json.loads((DOCS_DIR / f"{name}.solution.json").read_text())["edges"]
    cells, h, v = canon["cells"], canon["grids"]["h"], canon["grids"]["v"]
    rows, cols = len(cells), len(cells[0])
    eh, ev = edges["h"], edges["v"]
    deg = [[0] * cols for _ in range(rows)]
    for r in range(rows):
        for c in range(cols):
            if c < cols - 1 and eh[r][c]:
                deg[r][c] += 1
                deg[r][c + 1] += 1
            if r < rows - 1 and ev[r][c]:
                deg[r][c] += 1
                deg[r + 1][c] += 1
    assert all(d in (0, 2) for row in deg for d in row)
    ids = room_ids(rows, cols, h, v)
    rooms = {i for row in ids for i in row}
    for room in rooms:
        crossings = sum(
            1 for r in range(rows) for c in range(cols - 1)
            if eh[r][c] and ids[r][c] != ids[r][c + 1] and room in (ids[r][c], ids[r][c + 1])
        ) + sum(
            1 for r in range(rows - 1) for c in range(cols)
            if ev[r][c] and ids[r][c] != ids[r + 1][c] and room in (ids[r][c], ids[r + 1][c])
        )
        assert crossings == 2
        cells_in = [(r, c) for r in range(rows) for c in range(cols) if ids[r][c] == room]
        numbers = [cells[r][c] for r, c in cells_in if cells[r][c]]
        if numbers:
            assert sum(1 for r, c in cells_in if deg[r][c]) == numbers[0]
    for r in range(rows):
        for c in range(cols):
            if c < cols - 1 and v[r][c]:
                assert deg[r][c] or deg[r][c + 1]
            if r < rows - 1 and h[r][c]:
                assert deg[r][c] or deg[r + 1][c]


def test_validate():
    p = CountryRoadParser()
    ok = json.loads((DOCS_DIR / "board-country-road-example.canon.json").read_text())
    assert p.validate(PuzzleData(puzzle_type="country-road", grid=ok))
    two = json.loads(json.dumps(ok))
    two["cells"][1][1] = 2
    dangling = json.loads(json.dumps(ok))
    dangling["grids"]["v"][0][0] = 1
    big = json.loads(json.dumps(ok))
    big["cells"][0][2] = 2
    for bad in (two, dangling, big):
        assert not p.validate(PuzzleData(puzzle_type="country-road", grid=bad))
