"""Shared composite-cell classification (``cell_classify``) used by the
Gemini parsers: kakuro, nurimaze, pencils, yajilin, slalom, hell_golf."""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np

from puzzle_parsers.cell_classify import (
    DualInteger,
    DualIntegerTarget,
    Empty,
    Integer,
    IntegerTarget,
    PencilHead,
    PencilHeadTarget,
    classify_cells,
)

PKG = Path(__file__).resolve().parent.parent / "src" / "puzzle_parsers"


def test_dual_integer_parse_is_forgiving():
    t = DualIntegerTarget()
    assert t.parse({"type": "dual_integer", "top_right": 29, "bottom_left": 16}) == DualInteger(29, 16)
    assert t.parse({"type": "dual_integer", "top_right": 7}) == DualInteger(7, 0)
    assert t.parse({"type": "dual_integer", "top_right": "12", "bottom_left": None}) == DualInteger(12, 0)
    assert t.parse({"type": "dual_integer", "top_right": -1, "bottom_left": "x"}) == DualInteger(0, 0)


class _FakeModel:
    """Stands in for Gemini: answers each montage from the cell count in its prompt."""

    def __init__(self) -> None:
        self.calls: list[int] = []

    def generate_content(self, content):
        n = int(re.search(r"There are (\d+) cells", content[1]).group(1))
        self.calls.append(n)

        class R:
            text = json.dumps(
                [{"type": "integer", "value": 3} if i % 2 else {"type": "pencil_head", "direction": "up"}
                 for i in range(n)]
            )
            usage_metadata = None
        return R()


def test_classify_cells_skips_blanks_batches_and_maps_back():
    from puzzle_parsers.recognition import GeminiRecognizer

    model = _FakeModel()
    ink = np.full((40, 40), 255, np.uint8)
    ink[10:30, 10:30] = 0
    blank = np.full((40, 40), 255, np.uint8)
    crops = [[ink if (r + c) % 3 else blank for c in range(10)] for r in range(30)]
    read = classify_cells(
        GeminiRecognizer(client=model), crops, [IntegerTarget(), PencilHeadTarget()],
        max_cells_per_batch=60,
    )
    inked = [(r, c) for r in range(30) for c in range(10) if (r + c) % 3]
    assert sum(model.calls) == len(inked) and max(model.calls) <= 60 and len(model.calls) > 1
    assert all(isinstance(read[r][c], Empty) for r in range(30) for c in range(10) if (r + c) % 3 == 0)
    assert {type(read[r][c]) for r, c in inked} == {Integer, PencilHead}


def test_cell_parsers_read_composite_cells_through_classify_cells():
    # A parser that sends cell crops to the vision model goes through
    # classify_cells, not the raw recognizer (whole-image readers excepted).
    exempt = {"nonogram", "sudoku", "combo_sudoku"}
    offenders = [
        str(p.relative_to(PKG))
        for p in sorted(PKG.glob("*/parser.py"))
        if p.parent.name not in exempt and re.search(r"\.recognize\(", p.read_text())
    ]
    assert not offenders, "Use cell_classify.classify_cells:\n" + "\n".join(offenders)


def test_answers_are_matched_by_their_cell_label():
    from puzzle_parsers.cell_classify import _align_answers

    batch = [(0, 0, None), (0, 1, None), (2, 3, None)]
    # The model skipped (0,1) and listed the rest out of order.
    raw = [{"cell": "2,3", "type": "integer", "value": 9}, {"cell": "0,0", "type": "integer", "value": 4}]
    out = _align_answers(raw, batch)
    assert out[0]["value"] == 4 and out[1] == {"type": "empty"} and out[2]["value"] == 9
    # Any separator counts; no usable labels at all falls back to position.
    dotted = [{"cell": "2.3", "type": "integer", "value": 9}, {"cell": "0.0", "type": "integer", "value": 4}]
    assert [x.get("value") for x in _align_answers(dotted, batch)] == [4, None, 9]
    assert _align_answers([{"type": "empty"}, {"type": "integer", "value": 1}], batch[:2])[1]["value"] == 1
