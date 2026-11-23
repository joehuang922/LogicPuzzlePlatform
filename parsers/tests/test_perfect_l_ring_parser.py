"""Tests for the Perfect L-Ring parser.

The question is L-Ring's, so the parser is L-Ring's pipeline under type 42. Grid geometry
is deterministic and pinned against the hand-checked canons in ``docs/perfect-l-ring/``
at full size and the Android upload size (2000px long side). Each photo also shows part
of the other puzzle cut off at the page edge; the border finder must pick the complete
board.

Arrows come from Gemini, so ``classify_cells`` is replaced by a spy that returns the
canon's arrow per cell. The spy also checks that the shared empty-cell test keeps every
non-arrow cell out of the Gemini montage. The canons are the only reads under which
each board has a unique Perfect L-Ring solution (checked with CP-SAT).
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.cell_classify import Empty, Symbol, _is_cell_non_empty
from puzzle_parsers.l_ring import parser as lr
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.perfect_l_ring.parser import PerfectLRingParser
from puzzle_parsers.recognition import CellRecognizer

DOCS_DIR = Path(__file__).parents[2] / "docs" / "perfect-l-ring"
SAMPLES = ["perfect-l-ring-board-1", "perfect-l-ring-board-2"]


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
def test_parse_matches_canon_with_arrow_reads_stubbed(name, long_side, monkeypatch):
    expected = _expected(name)

    def spy(recognizer, crops, targets):
        assert (len(crops), len(crops[0])) == (len(expected), len(expected[0]))
        # Only the arrow cells pass the shared empty-cell test.
        assert [[int(_is_cell_non_empty(c)) for c in row] for row in crops] == [
            [int(v != 0) for v in row] for row in expected
        ]
        return [[Symbol(code=v) if v else Empty() for v in row] for row in expected]

    # _classify_arrows is L-Ring's, so the stub goes on its module.
    monkeypatch.setattr(lr, "classify_cells", spy)
    board = PerfectLRingParser(recognizer=_NoRecognizer())._parse_image(_load(name, long_side))
    assert board.cells == expected


def test_parse_reports_perfect_l_ring(monkeypatch):
    expected = _expected(SAMPLES[0])
    monkeypatch.setattr(
        lr, "classify_cells",
        lambda rec, crops, targets: [[Symbol(code=v) if v else Empty() for v in row] for row in expected],
    )
    from PIL import Image

    image = Image.open(DOCS_DIR / f"{SAMPLES[0]}.jpg").convert("RGB")
    data = PerfectLRingParser(recognizer=_NoRecognizer())._parse(image)
    assert data.puzzle_type == "perfect-l-ring"
    assert data.grid == {"cells": expected}


def test_validate():
    p = PerfectLRingParser(recognizer=_NoRecognizer())
    assert p.validate(PuzzleData(puzzle_type="perfect-l-ring", grid={"cells": [[0, 1], [4, 3]]}))
    assert not p.validate(PuzzleData(puzzle_type="l-ring", grid={"cells": [[0, 1], [4, 3]]}))
    for cells in ([[0, 5], [0, 0]], [[0, 0], [0]], [[0]]):
        assert not p.validate(PuzzleData(puzzle_type="perfect-l-ring", grid={"cells": cells})), cells
