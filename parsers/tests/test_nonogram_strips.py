"""Big-nonogram clue strips: geometry, reading, merging and checks.

The sample is a 175x110 (19,250-cell) nonogram whose clues were scanned as
four strips: row clues in two (top, bottom) and column clues in two (left,
right). ``q83.canon.json`` is the verified clue set: the strips' reading with
one misread fixed (column 146's 18 read as 16), which line logic alone then
solves completely, so every clue in it is consistent with a unique picture.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from puzzle_parsers.nonogram_strips.geometry import (
    _classify_thick,
    detect_strip,
    regular_lines,
)
from puzzle_parsers.nonogram_strips.merge import check_clues, merge_axis
from puzzle_parsers.nonogram_strips.reader import (
    ClueLine,
    StripReading,
    _lines_from_cells,
    read_strip,
    reconcile,
)

STRIPS = Path(__file__).parents[2] / "docs" / "nonogram" / "strips"
WIDTH, HEIGHT = 175, 110
SAMPLES = [
    # file, axis, lines (complete), starts at the board's border, ends at it, offset
    ("q83-rows-top.jpg", "rows", 70, 70, True, False, 0),
    ("q83-rows-bottom.jpg", "rows", 67, 66, False, True, 43),
    ("q83-cols-left.jpg", "cols", 80, 80, True, False, 0),
    ("q83-cols-right.jpg", "cols", 98, 98, False, True, 77),
]


# --- reading rules ------------------------------------------------------------


@pytest.mark.parametrize(
    "trimmed, wide, max_clue, want",
    [
        (12, 12, None, 12),
        (16, 10, None, 10),  # the trimmed crop clipped the 0
        (1, 15, None, 15),  # ... or dropped the 5 entirely
        (25, 251, None, 25),  # the wide crop read a dash as a trailing 1
        (19, 119, None, 19),  # ... or a leading one
        (19, 419, 110, 19),  # longer than the line: impossible
        (0, 7, None, 7),
        (7, 0, None, 7),
    ],
)
def test_reconcile(trimmed, wide, max_clue, want):
    value, disagreed = reconcile(trimmed, wide, max_clue)
    assert value == want
    assert disagreed == (trimmed != wide)


def test_line_reads_away_from_the_board_reversed():
    # cells from the board edge outwards: 33 62 5 13 13, then blanks
    clues, ks, flags = _lines_from_cells([33, 62, 5, 13, 13, 0, 0], empty=0)
    assert clues == [13, 13, 5, 62, 33]
    assert ks == [4, 3, 2, 1, 0]
    assert flags == []


def test_lone_number_beyond_a_blank_is_dropped_as_a_ghost():
    clues, _, flags = _lines_from_cells([5, 3, 0, 0, 6, 0], empty=0)
    assert clues == [3, 5]
    assert flags == ["ghost_dropped:6"]


def test_numbers_beyond_a_blank_are_kept_and_flagged():
    clues, _, flags = _lines_from_cells([5, 0, 3, 2], empty=0)
    assert clues == [2, 3, 5]
    assert flags == ["gap"]


def test_numbers_off_the_board_edge_are_flagged():
    _, _, flags = _lines_from_cells([0, 4, 2], empty=0)
    assert "detached" in flags


# --- geometry helpers -------------------------------------------------------


def test_regular_lines_fill_in_faint_lines_between_strong_ones():
    prof = np.zeros(600)
    for x in range(20, 580, 50):
        prof[x] = 100 if (x - 20) % 250 == 0 else 15  # every 5th strong
    xs, seen = regular_lines(prof, 50, weak=0.1)
    assert [round(x) for x in xs] == list(range(20, 580, 50))
    assert all(seen)


def test_thick_lines_are_found_by_their_every_5th_rhythm():
    widths = [3, 3, 7, 3, 3, 3, 3, 7, 3, 3, 3, 3, 7, 3, 12]  # 12: an outer border
    assert [i for i, t in enumerate(_classify_thick(widths)) if t] == [2, 7, 12]


# --- merging ----------------------------------------------------------------


def _reading(axis, lines, *, start=False, end=False, first_thick=0):
    n = len(lines)
    thick = [(j - first_thick) % 5 == 0 for j in range(n + 1)]
    return StripReading(
        orientation=axis,
        lines=[ClueLine(c, c is not None) if c is not None else ClueLine([], False) for c in lines],
        thick=thick,
        start_border=start,
        end_border=end,
        geometry=None,  # type: ignore[arg-type]
    )


def test_strips_are_placed_by_border_and_by_overlap():
    truth = [[i % 7 + 1, i % 3 + 1] for i in range(20)]
    top = _reading("rows", truth[:9], start=True)
    bottom = _reading("rows", truth[12:], end=True, first_thick=3)
    # The middle strip has no border: placed by its overlap (and the 5-phase).
    middle = _reading("rows", truth[6:15], first_thick=4)
    res = merge_axis("rows", [top, bottom, middle], 20)
    assert [p.offset for p in res.placements] == [0, 12, 6]
    assert [p.how for p in res.placements] == ["start_border", "end_border", "overlap"]
    assert [ln.clues for ln in res.lines] == truth
    assert all(ln.status == "ok" for ln in res.lines)


def test_disagreeing_strips_leave_the_line_to_a_person():
    a = _reading("rows", [[1], [2], [3]], start=True)
    b = _reading("rows", [[2], [9]], end=True)  # line 2 read differently
    res = merge_axis("rows", [a, b], 3)
    assert [ln.status for ln in res.lines] == ["ok", "ok", "conflict"]
    assert res.lines[2].clues is None


def test_uncovered_lines_are_missing():
    a = _reading("rows", [[1], [2]], start=True)
    res = merge_axis("rows", [a], 4)
    assert [ln.status for ln in res.lines] == ["ok", "ok", "missing", "missing"]


def test_checks_fit_and_totals():
    rows = merge_axis("rows", [_reading("rows", [[2], [1, 1]], start=True)], 2)
    cols = merge_axis("cols", [_reading("cols", [[2], [3]], start=True)], 2)
    checks = {c.name: c for c in check_clues(rows, cols)}
    assert not checks["rows_fit"].ok  # 1 1 needs 3 cells of a 2-cell row
    assert not checks["cols_fit"].ok
    assert not checks["totals"].ok  # rows add up to 4, columns to 5


# --- the 175x110 sample ---------------------------------------------------------


@pytest.mark.parametrize("name, axis, n, complete, start, end, offset", SAMPLES)
def test_sample_geometry(name, axis, n, complete, start, end, offset):
    g = detect_strip(cv2.imread(str(STRIPS / name)), axis)
    assert len(g.separators) - 1 == n
    assert (g.start_border, g.end_border) == ((start, end) if axis == "rows" else (end, start))
    # thick every 5th, all the way along
    thick = [i for i, t in enumerate(g.thick) if t]
    assert thick and all(b - a == 5 for a, b in zip(thick, thick[1:]))


@pytest.fixture(scope="module")
def sample_reading():
    from puzzle_parsers.recognition import EasyOcrBackend

    ocr = EasyOcrBackend()
    readings = {"rows": [], "cols": []}
    for name, axis, *_ in SAMPLES:
        max_clue = WIDTH if axis == "rows" else HEIGHT
        readings[axis].append(read_strip(cv2.imread(str(STRIPS / name)), axis, ocr, max_clue=max_clue))
    return readings


def test_sample_reads_the_canon(sample_reading):
    canon = json.loads((STRIPS / "q83.canon.json").read_text())
    rows = merge_axis("rows", sample_reading["rows"], HEIGHT)
    cols = merge_axis("cols", sample_reading["cols"], WIDTH)
    assert [p.offset for p in rows.placements + cols.placements] == [s[-1] for s in SAMPLES]
    assert [ln.clues for ln in rows.lines] == canon["rowClues"]
    wrong = [ln.index + 1 for ln, want in zip(cols.lines, canon["colClues"]) if ln.clues != want]
    # Known: column 146's 18, blurred in the lowest-resolution strip, reads
    # 16 in both crops. The totals check catches it (off by 2).
    assert wrong == [146]
    totals = next(c for c in check_clues(rows, cols) if c.name == "totals")
    assert not totals.ok and "11030" in totals.detail and "11028" in totals.detail


@pytest.mark.parametrize("name, axis", [("q83-rows-bottom.jpg", "rows"), ("q83-cols-right.jpg", "cols")])
def test_shares_split_the_lines_exactly(name, axis):
    """The web editor reads a strip in parallel shares; together they cover
    every line once, as contiguous blocks in board order."""
    img = cv2.imread(str(STRIPS / name))
    geom = detect_strip(img, axis)
    seen: list[int] = []
    for k in range(4):
        r = read_strip(img, axis, None, geometry=geom, share=(k, 4))
        mine = [j for j, ln in enumerate(r.lines) if "not_read" not in ln.flags]
        assert mine == list(range(mine[0], mine[-1] + 1))
        seen += mine
    assert seen == list(range(len(geom.separators) - 1))


def test_endpoint_rejects_a_request_without_orientation():
    import lambda_handler

    res = lambda_handler.handler({"body": json.dumps({"mode": "nonogramStrip", "image": "eA=="})}, None)
    assert res["statusCode"] == 400
