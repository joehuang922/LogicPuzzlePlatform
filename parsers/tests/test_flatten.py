"""Curved-page flattening is one shared job: ``flatten.flatten_board``.

Masyu used to trace and remap its own lines while ``grid_utils`` snapped
straight lines onto a bowed page; now every parser that gets curved pages
(kakuro, masyu, picto_link, fillomino, nurimaze) calls ``flatten_board`` between
``rectify_board`` and ``find_grid_lines``. These checks pin that, and pin the
two behaviours: a bowed grid comes out straight, a flat board passes through
untouched.
"""
from __future__ import annotations

import re
from pathlib import Path

import cv2
import numpy as np

from puzzle_parsers.flatten import flatten_board
from puzzle_parsers.grid_utils import find_grid_lines, rectify_board

PKG = Path(__file__).resolve().parent.parent / "src" / "puzzle_parsers"
CURVED_PAGE_PARSERS = {"kakuro", "masyu", "picto_link", "fillomino", "nurimaze"}
_OWN_FLATTENING = re.compile(r"^def \w*(trace_lines|remap|flatten)\w*\(", re.M)
# Combo sudoku's board is no rectangle, so rectify_board/flatten_board can't
# take it; it warps each 3x3 room flat from that room's own grid junctions.
_OWN_FLATTENING_OK = {"combo_sudoku/parser.py: def flatten_rooms("}


def test_curved_page_parsers_flatten_with_the_shared_function():
    for pkg in sorted(CURVED_PAGE_PARSERS):
        src = (PKG / pkg / "grid_detector.py").read_text()
        assert "flatten_board(" in src, f"{pkg} should call flatten.flatten_board"


def test_no_parser_defines_its_own_flattening():
    offenders = [
        f"{p.relative_to(PKG)}: {m.group(0)}"
        for p in PKG.rglob("*.py")
        if p.name != "flatten.py"
        for m in _OWN_FLATTENING.finditer(p.read_text())
        if f"{p.relative_to(PKG)}: {m.group(0)}" not in _OWN_FLATTENING_OK
    ]
    assert not offenders, "Use flatten.flatten_board:\n" + "\n".join(offenders)


def _board(n: int, cell: int, bow: float) -> np.ndarray:
    """``n`` x ``n`` grid on white paper with a 1-cell margin; ``bow`` (in
    cells) bends every line into a half sine, as a page curling at the spine."""
    side = (n + 2) * cell
    img = np.full((side, side, 3), 255, np.uint8)
    t = np.linspace(0, 1, 200)
    for i in range(n + 1):
        along = cell + t * n * cell
        across = cell + i * cell + bow * cell * np.sin(np.pi * t) * (1 - abs(2 * i / n - 1))
        width = 4 if i in (0, n) else 2
        for pts in (np.stack([along, across], 1), np.stack([across, along], 1)):
            cv2.polylines(img, [np.int32(pts)], False, (0, 0, 0), width)
    return img


def _straightness(gray: np.ndarray, h_lines: list[int]) -> float:
    """Fraction of each interior row line's length that is dark within 2 px."""
    hits = []
    for y in h_lines[1:-1]:
        band = gray[max(0, y - 2): y + 3, :]
        hits.append(float((band.min(axis=0) < 128).mean()))
    return min(hits)


def test_bowed_grid_comes_out_straight():
    # 0.15 cell, about the kakuro scan's lean and the fillomino photo's bow.
    img = _board(12, 72, bow=0.15)
    straight = rectify_board(img)
    flat = flatten_board(img, straight)
    assert flat is not straight
    gray = cv2.cvtColor(flat.warped, cv2.COLOR_BGR2GRAY)
    h, v = find_grid_lines(gray)
    assert (len(h) - 1, len(v) - 1) == (12, 12)
    assert _straightness(gray, h) > 0.98
    # On the unflattened board no straight line follows the bow.
    sgray = cv2.cvtColor(straight.warped, cv2.COLOR_BGR2GRAY)
    assert _straightness(sgray, find_grid_lines(sgray)[0]) < 0.7


def test_flat_board_is_returned_unchanged():
    img = _board(10, 72, bow=0.0)
    board = rectify_board(img)
    assert flatten_board(img, board) is board
