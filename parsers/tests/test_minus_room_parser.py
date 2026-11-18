"""Tests for the Minus Room parser.

Geometry, walls and circle positions are deterministic and pinned against the
hand-checked canons in ``docs/minus-room/`` at full size, the Android upload size
(2000 px long side) and 1200 px. Every photo also shows parts of neighbouring puzzles.
Each canon has a unique solution under the five rules (``*.solution.json``, CP-SAT),
which also checks the transcription.

Givens, circle digits and the 「1〜N」 range come from EasyOCR, so ``read_grid_clues``
and ``read_cells`` are replaced by spies returning the canon's values; the tests cover
geometry, walls, which crops are read and how reads become the canon. (Live EasyOCR
reads of all three samples matched the canons exactly, range included, at full, 2000
and 1200 px when the parser was written.)
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from puzzle_parsers.minus_room import parser as mp
from puzzle_parsers.minus_room.grid_detector import detect_minus_room, find_max_digit
from puzzle_parsers.minus_room.parser import MinusRoomParser
from puzzle_parsers.models import PuzzleData

DOCS_DIR = Path(__file__).parents[2] / "docs" / "minus-room"
SAMPLES = [f"board-minus-room-{i}" for i in (1, 2, 3)]
SIZES = [None, 2000, 1200]


class _Ocr:
    """Stands in for the backend: the spies never call it."""


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

    def grid_spy(ocr, image, h_lines, v_lines, *, allow_multi_digits, allow_zero=False, max_value=None):
        assert not allow_multi_digits and not allow_zero and max_value == expected["max"]
        assert (len(h_lines) - 1, len(v_lines) - 1) == (expected["rows"], expected["cols"])
        return expected["cells"]

    def cells_spy(ocr, rois, *, allow_multi_digits, allow_zero=False, max_value=None):
        assert len(rois) == 1 and not allow_multi_digits
        if allow_zero:  # the circles, in canon order
            assert max_value == expected["max"] - 1
            assert len(rois[0]) == len(expected["circles"])
            return [[k["value"] for k in expected["circles"]]]
        assert len(rois[0]) == 1  # the range's N
        return [[expected["max"]]]

    monkeypatch.setattr(mp, "read_grid_clues", grid_spy)
    monkeypatch.setattr(mp, "read_cells", cells_spy)
    board = MinusRoomParser(ocr_backend=_Ocr())._parse_image(_image(name, size))
    assert board.model_dump() == expected


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("size", SIZES)
def test_range_digit_is_found(name, size):
    image = _image(name, size)
    geom = detect_minus_room(image)
    box = find_max_digit(image, geom.grid.quad, geom.grid.cols)
    assert box is not None
    # right of or below the board's bottom-right corner
    x, y, w, h = box
    quad = geom.grid.quad
    assert x + w > quad[:, 0].max() - 3 * (quad[:, 0].max() - quad[:, 0].min()) / geom.grid.cols
    assert y + h > quad[:, 1].max() - (quad[:, 1].max() - quad[:, 1].min()) / geom.grid.rows


@pytest.mark.parametrize("name", SAMPLES)
def test_ocr_image_has_no_circles(name):
    """Every circle is painted out of the image the givens are read from."""
    geom = detect_minus_room(_image(name, 2000))
    for k in geom.circles:
        r = round(k.radius)
        patch = geom.ocr_gray[round(k.y) - r : round(k.y) + r, round(k.x) - r : round(k.x) + r]
        assert np.mean(patch < 128) < 0.01, (k.dr, k.dc)


def test_without_ocr_everything_reads_empty_and_max_defaults():
    board = MinusRoomParser()._parse_image(_image(SAMPLES[0], 2000))
    assert board.max == mp.DEFAULT_MAX
    assert all(v == 0 for row in board.cells for v in row)
    assert board.circles == []


def test_validate():
    p = MinusRoomParser()
    ok = {
        "rows": 2, "cols": 2, "max": 2,
        "cells": [[1, 0], [0, 2]],
        "edges": {"h": [[1, 0]], "v": [[0], [1]]},
        "circles": [{"dr": 0, "dc": 1, "value": 1}],
    }
    assert p.validate(PuzzleData(puzzle_type="minus-room", grid=ok))
    bad_grids = [
        {**ok, "cells": [[3, 0], [0, 2]]},
        {**ok, "circles": [{"dr": 0, "dc": 0, "value": 1}]},
        {**ok, "circles": [{"dr": 0, "dc": 1, "value": 2}]},
        {**ok, "circles": [{"dr": 0, "dc": 1, "value": 1}, {"dr": 0, "dc": 1, "value": 0}]},
        {**ok, "edges": {"h": [[1]], "v": [[0], [1]]}},
    ]
    for grid in bad_grids:
        assert not p.validate(PuzzleData(puzzle_type="minus-room", grid=grid))
