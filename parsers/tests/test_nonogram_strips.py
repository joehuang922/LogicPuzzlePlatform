"""Big-nonogram clue strips: geometry, reading, merging and checks.

The sample is a 175x110 (19,250-cell) nonogram whose clues were scanned as
four strips: row clues in two (top, bottom) and column clues in two (left,
right). ``q83.canon.json`` is the verified clue set: the strips' reading with
one misread fixed (column 146's 18 read as 16, before the board's edge line
was painted out of the crops), which line logic alone then solves completely,
so every clue in it is consistent with a unique picture.

``lp2604-*`` are a 180x70 board photographed rather than scanned: its thin
separators fade out among the clues at the top and bottom of the page, and a
smudge and a crease bend one column line. ``lp2604.canon.json`` is its verified clue
set (line logic solves all 12,600 cells).
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from puzzle_parsers.nonogram_strips.geometry import (
    Polyline,
    _classify_thick,
    _fill_faint,
    _recentre_strays,
    detect_any,
    detect_strip,
    ink_mask,
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


def _flat(y: float, x0: float = 0.0, x1: float = 1000.0) -> Polyline:
    return Polyline(np.array([x0, x1]), np.array([y, y]))


def test_faint_lines_are_carried_across_from_their_neighbours():
    # lines every 50px; 1-4 died out at x=800, while 0 and 5 reach x=100
    seps = [_flat(50.0 * i, 800.0 if 0 < i < 5 else 100.0) for i in range(6)]
    extents = [800.0 if 0 < i < 5 else 100.0 for i in range(6)]
    filled, ext = _fill_faint(seps, extents, reach=150.0)
    assert ext == [100.0] * 6
    assert [round(float(s(120.0))) for s in filled] == [0, 50, 100, 150, 200, 250]


def test_a_line_that_strayed_goes_back_between_its_neighbours():
    seps = [_flat(0.0), _flat(30.0), _flat(116.0), _flat(174.0)]  # 30 should be 58
    fixed = _recentre_strays(seps, np.linspace(0, 1000, 5), pitch=58.0)
    assert round(float(fixed[1](500.0))) == 58
    assert [float(s(500.0)) for s in fixed[2:]] == [116.0, 174.0]


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


def test_photographed_strip_keeps_every_line_where_thin_lines_fade():
    g = detect_strip(cv2.imread(str(STRIPS / "lp2604-rows.jpg")), "rows")
    assert len(g.separators) - 1 == 70 and g.start_border and g.end_border
    # Every separator reaches across the clue grid (21 rows used to stop short).
    common = float(np.median(g.extents))
    assert all(e <= common + 0.5 * g.cell_pitch for e in g.extents)


def test_photographed_row_keeps_a_number_the_ocr_read_as_zero():
    """Row 66's clean bold 8 reads "0"; no clue is 0, so it stays a number
    (guessed 8, flagged) instead of vanishing from the middle of the row.
    (Its 21 reads 1 or 27, both crops blurred: left to the repair.)"""
    from puzzle_parsers.recognition import EasyOcrBackend

    canon = json.loads((STRIPS / "lp2604.canon.json").read_text())["rowClues"][65]
    r = read_strip(cv2.imread(str(STRIPS / "lp2604-rows.jpg")), "rows", EasyOcrBackend(), max_clue=180)
    row = r.lines[65]
    assert len(row.clues) == len(canon)
    assert row.clues[10] == 8 and row.alternates[10] == [6, 9, 3]
    assert [c for k, c in enumerate(row.clues) if k != 20] == [c for k, c in enumerate(canon) if k != 20]
    assert "gap" not in row.flags


def test_photographed_strip_lines_stay_evenly_spaced_past_a_smudge():
    g = detect_strip(cv2.imread(str(STRIPS / "lp2604-cols-middle.jpg")), "cols")
    assert len(g.separators) - 1 == 68
    xs = np.linspace(float(np.median(g.extents)), float(np.median(g.edge.pos)), 12)
    gaps = np.diff([[float(s(x)) for x in xs] for s in g.separators], axis=0)
    assert np.abs(gaps - g.row_pitch).max() < 0.2 * g.row_pitch


@pytest.mark.parametrize("name, n", [("j12600-cols-thin-board.jpg", 40), ("j12600-cols-corner.jpg", 35)])
def test_photographed_cols_with_barely_any_board_find_the_board_by_its_border(name, n):
    """Only a row or two of faint board cells show past the clues: no run of
    board lines, so the board's thick border and the clue lines' pitch place it."""
    g = detect_strip(cv2.imread(str(STRIPS / name)), "cols")
    assert len(g.separators) - 1 == n
    thick = [i for i, t in enumerate(g.thick) if t]
    assert thick and all(b - a == 5 for a, b in zip(thick, thick[1:]))


def test_the_page_edge_past_the_bottom_border_is_no_clue_line():
    """The scanned page's straight edge, two and a half rows below the board's
    bottom border, used to be taken for a clue line (with a predicted one
    between), hiding the border the strip is placed by."""
    g = detect_strip(cv2.imread(str(STRIPS / "j12600-rows-bottom.jpg")), "rows")
    assert len(g.separators) - 1 == 60
    assert g.end_border and not g.start_border
    assert g.thick[-1] and g.thick[0]


def test_a_tall_column_strip_is_found_to_be_columns():
    """Taller than wide, and read as rows it still shows a few "rows" (the
    clue grid's own lines): the way round with more lines wins."""
    g = detect_any(cv2.imread(str(STRIPS / "j12600b-cols-middle.jpg")))
    assert g.orientation == "cols" and len(g.separators) - 1 == 37


def test_a_speckled_scan_below_the_bottom_border_is_blank_paper():
    g = detect_strip(cv2.imread(str(STRIPS / "j12600b-rows-bottom-speckled.jpg")), "rows")
    assert len(g.separators) - 1 == 13 and g.end_border


def test_separators_fading_into_a_dark_photo_edge_still_cross_the_clues():
    g = detect_strip(cv2.imread(str(STRIPS / "j12600b-rows-dark-bottom.jpg")), "rows")
    common = float(np.median(g.extents))
    assert len(g.separators) - 1 == 46
    assert all(e <= common + 0.5 * g.cell_pitch for e in g.extents)


def test_number_separators_follow_the_dashes_on_a_curved_page():
    """Columns 5 to 14 of this photo curve: separators placed at an even
    pitch from the board drift off the dashes after about eight numbers."""
    g = detect_strip(cv2.imread(str(STRIPS / "j12600b-cols-left-curved.jpg")), "cols")
    ink = ink_mask(g.image)
    for i in range(4, 14):
        y1, y2 = g.separators[i], g.separators[i + 1]
        on_dash = 0
        xs = g.number_seps[i][1:]
        for x in xs:
            a, b = sorted((int(y1(x)), int(y2(x))))
            col = ink[a:b, max(0, int(x) - 3):int(x) + 4].max(axis=1)
            on_dash += col.mean() / 255 > 0.25
        assert on_dash >= 0.8 * len(xs), (i, on_dash, len(xs))


def test_a_header_scan_is_no_strip_either_way():
    """The web editor reads an image with no grid either way as the puzzle's header."""
    image = cv2.imread(str(STRIPS / "j12600-header.jpg"))
    for axis in ("rows", "cols"):
        with pytest.raises(ValueError):
            detect_strip(image, axis)


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
    # Column 146's 18, next to the board's thick edge line, once read 16;
    # with the line painted out of the crops every line reads exactly.
    assert [ln.clues for ln in cols.lines] == canon["colClues"]
    totals = next(c for c in check_clues(rows, cols) if c.name == "totals")
    assert totals.ok


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
