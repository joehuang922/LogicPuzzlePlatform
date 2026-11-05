"""Room boards classify walls through ``grid_utils.classify_border_thickness``.

Thick-vs-thin wall reading is one shared job: a fix there (the seeded,
sub-pixel width and the dead-end repair) reaches every room parser at once.
These checks stop a parser from growing its own wrapper or width measurement
again (six identical ``classify_borders`` copies used to exist), and pin the
two behaviours the shared classifier relies on.
"""
from __future__ import annotations

import re
from pathlib import Path

import cv2
import numpy as np

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import _close_dangling_walls, classify_border_thickness

PKG = Path(__file__).resolve().parent.parent / "src" / "puzzle_parsers"
ROOM_PACKAGES = {"heyawake", "lits", "norinori", "nurimaze", "nuritwin", "ripple_effect"}
_OWN_CLASSIFIER = re.compile(r"^def \w*(classify_borders|border_width|wall_width|thickness)\w*\(", re.M)


def test_room_parsers_use_the_shared_classifier():
    for pkg in sorted(ROOM_PACKAGES):
        src = "".join(p.read_text() for p in (PKG / pkg).glob("*.py"))
        assert "classify_border_thickness(" in src, f"{pkg} should call grid_utils.classify_border_thickness"


def test_no_parser_defines_its_own_wall_classifier():
    offenders = [
        f"{p.relative_to(PKG)}: {m.group(0)}"
        for p in PKG.rglob("*.py")
        if p.name != "grid_utils.py"
        for m in _OWN_CLASSIFIER.finditer(p.read_text())
    ]
    assert not offenders, "Use grid_utils.classify_border_thickness:\n" + "\n".join(offenders)


def _synthetic_board(thick_v_col: int, digit_above_row: int) -> BoardGrid:
    """4x4 board, 80px cells, 2px thin lines; one thick (8px) vertical wall
    line at ``thick_v_col`` and one thick horizontal at row 2, plus a heavy
    digit-like bar 18-30px above the thin wall under ``digit_above_row``: outside
    the seed window, inside the old +-30% scan that measured it as the wall."""
    n, p = 4, 80
    img = np.full((n * p + 1, n * p + 1), 255, np.uint8)
    for i in range(n + 1):
        cv2.line(img, (i * p, 0), (i * p, n * p), 0, 2)
        cv2.line(img, (0, i * p), (n * p, i * p), 0, 2)
    cv2.rectangle(img, (thick_v_col * p - 4, 0), (thick_v_col * p + 4, n * p), 0, -1)
    cv2.rectangle(img, (0, 2 * p - 4), (n * p, 2 * p + 4), 0, -1)
    y = (digit_above_row + 1) * p
    cv2.rectangle(img, (p // 4, y - 30), (3 * p // 4, y - 18), 0, -1)
    lines = [i * p for i in range(n + 1)]
    return BoardGrid(warped=cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), h_lines=lines, v_lines=lines)


def test_digit_above_a_thin_wall_does_not_make_it_thick():
    grid = _synthetic_board(thick_v_col=2, digit_above_row=0)
    gray = cv2.cvtColor(grid.warped, cv2.COLOR_BGR2GRAY)
    h, v = classify_border_thickness(gray, grid)
    assert h[0][0] == 0  # thin wall under the digit bar
    assert h[1] == [1, 1, 1, 1]  # the thick horizontal
    assert [row[1] for row in v] == [1, 1, 1, 1]  # the thick vertical (right of col 1)
    assert sum(map(sum, h)) == 4 and sum(map(sum, v)) == 4


def test_dead_end_wall_is_closed_by_the_least_certain_flip():
    # 3x3 board: thick wall below row 0 across cols 0-1 only, ending mid-board.
    # The wall below (0, 2) measured just under the threshold, so it is the
    # least certain one at the dead end and gets flipped to thick.
    h = [[1, 1, 0], [0, 0, 0]]
    v = [[0, 0], [0, 0], [0, 0]]
    hw = [[10.0, 10.0, 4.6], [2.0, 2.0, 2.0]]
    vw = [[2.0, 2.0], [2.0, 2.0], [2.0, 2.0]]
    _close_dangling_walls(h, v, hw, vw, threshold=5.0)
    assert h == [[1, 1, 1], [0, 0, 0]] and v == [[0, 0], [0, 0], [0, 0]]
