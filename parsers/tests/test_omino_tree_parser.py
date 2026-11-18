"""Tests for the Omino Tree parser.

Grid geometry and arrows are deterministic and pinned against the hand-checked canons
in ``docs/omino-tree/`` at full size, the Android upload size (2000 px long side) and
1200 px. Every photo also shows part of a neighbouring puzzle cut off by the page edge.
Each canon has a unique solution (``*.solution.json``, exhaustive search), which also
checks the transcription.

Numbers come from EasyOCR, so ``read_grid_clues`` is replaced by a spy that returns the
canon's numbers; the test covers geometry, arrows, and that arrows are whitened out of
the image the OCR reads. (Live EasyOCR reads of all four samples matched the canons
exactly at full, 2000 and 1200 px when the parser was written.)
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from puzzle_parsers.models import PuzzleData
from puzzle_parsers.omino_tree import parser as op
from puzzle_parsers.omino_tree.grid_detector import detect_omino_tree
from puzzle_parsers.omino_tree.parser import OminoTreeParser

DOCS_DIR = Path(__file__).parents[2] / "docs" / "omino-tree"
SAMPLES = [f"board-omino-tree-{i}" for i in (1, 2, 3, 4)]
SIZES = [None, 2000, 1200]


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
        assert allow_multi_digits and not allow_zero and max_value is None
        assert (len(h_lines) - 1, len(v_lines) - 1) == (expected["rows"], expected["cols"])
        return expected["numbers"]

    monkeypatch.setattr(op, "read_grid_clues", spy)
    board = OminoTreeParser()._parse_image(_image(name, size))
    assert board.model_dump() == expected


@pytest.mark.parametrize("name", SAMPLES)
def test_ocr_image_has_no_arrows(name):
    """Cells with an arrow but no number read as blank paper in the OCR image."""
    expected = _expected(name)
    geom = detect_omino_tree(_image(name, 2000))
    h, v = geom.grid.h_lines, geom.grid.v_lines
    step = {"up": (-1, 0), "down": (1, 0), "left": (0, -1), "right": (0, 1)}
    cells = set()
    for a in expected["arrows"]:
        dr, dc = step[a["dir"]]
        cells |= {(a["r"], a["c"]), (a["r"] + dr, a["c"] + dc)}
    for r, c in cells:
        if expected["numbers"][r][c]:
            continue
        ch, cw = h[r + 1] - h[r], v[c + 1] - v[c]
        crop = geom.ocr_gray[h[r] + ch // 6 : h[r + 1] - ch // 6, v[c] + cw // 6 : v[c + 1] - cw // 6]
        assert np.mean(crop < 128) < 0.01, (r, c)


def test_validate():
    p = OminoTreeParser()
    ok = {
        "rows": 2,
        "cols": 2,
        "numbers": [[1, 0], [0, 2]],
        "arrows": [{"r": 0, "c": 0, "dir": "right"}],
    }
    assert p.validate(PuzzleData(puzzle_type="omino-tree", grid=ok))
    bad_grids = [
        {**ok, "numbers": [[1, 0]]},
        {**ok, "arrows": [{"r": 0, "c": 1, "dir": "right"}]},
        {**ok, "arrows": [{"r": 0, "c": 0, "dir": "right"}, {"r": 0, "c": 1, "dir": "left"}]},
        {**ok, "rows": 1, "numbers": [[1, 0]]},
    ]
    for grid in bad_grids:
        assert not p.validate(PuzzleData(puzzle_type="omino-tree", grid=grid))
