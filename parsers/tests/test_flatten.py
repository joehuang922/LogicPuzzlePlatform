"""Curved-page flattening is one shared job: ``flatten.flatten_board``.

Masyu used to trace and remap its own lines while ``grid_utils`` snapped
straight lines onto a bowed page. Then a few parsers opted in to
``flatten_board``; now ``rectify_board`` runs it on every board, and it checks
its own trace against the border (falling back to the plain warp), so no
parser opts in or out. These checks pin that, and pin the behaviours: a bowed
grid comes out straight, a flat board passes through untouched, and a trace
that misses part of the board is not used.
"""
from __future__ import annotations

import re
from pathlib import Path

import cv2
import numpy as np

from puzzle_parsers.flatten import (
    _add_border,
    _drop_midcell,
    _fits_border,
    flatten_board,
)
from puzzle_parsers.grid_utils import find_grid_lines, rectify_board

PKG = Path(__file__).resolve().parent.parent / "src" / "puzzle_parsers"
_OWN_FLATTENING = re.compile(r"^def \w*(trace_lines|remap|flatten)\w*\(", re.M)
# Combo sudoku's board is no rectangle, so rectify_board/flatten_board can't
# take it; it warps each 3x3 room flat from that room's own grid junctions.
_OWN_FLATTENING_OK = {"combo_sudoku/parser.py: def flatten_rooms("}


def _sources() -> list[Path]:
    return [p for p in PKG.rglob("*.py") if p.name not in ("flatten.py", "grid_utils.py")]


def test_parsers_flatten_through_rectify_board_only():
    offenders = [
        str(p.relative_to(PKG))
        for p in _sources()
        if re.search(r"flatten_board\(|flatten\s*=\s*False", p.read_text())
    ]
    assert not offenders, "rectify_board flattens every board; don't call or skip it:\n" + "\n".join(offenders)


def test_no_parser_defines_its_own_flattening():
    offenders = [
        f"{p.relative_to(PKG)}: {m.group(0)}"
        for p in _sources()
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
    straight = rectify_board(img, flatten=False)
    flat = rectify_board(img)
    assert flat.warped.shape != straight.warped.shape or np.any(flat.warped != straight.warped)
    gray = cv2.cvtColor(flat.warped, cv2.COLOR_BGR2GRAY)
    h, v = find_grid_lines(gray)
    assert (len(h) - 1, len(v) - 1) == (12, 12)
    assert _straightness(gray, h) > 0.98
    # On the unflattened board no straight line follows the bow.
    sgray = cv2.cvtColor(straight.warped, cv2.COLOR_BGR2GRAY)
    assert _straightness(sgray, find_grid_lines(sgray)[0]) < 0.7


def test_flat_board_is_returned_unchanged():
    img = _board(10, 72, bow=0.0)
    board = rectify_board(img, flatten=False)
    assert flatten_board(img, board) is board


def _tracks(*means: float) -> np.ndarray:
    return np.array([[m, m + 0.5, m - 0.5] for m in means], dtype=float)


def test_dashed_line_through_cell_centres_is_dropped():
    # A slalom gate down the middle of a column traces like a ruling.
    out = _drop_midcell(_tracks(0, 10, 15, 20, 30), 10)
    assert out.mean(axis=1).tolist() == [0, 10, 20, 30]


def test_border_missed_beside_a_page_curl_is_added_from_the_quad():
    out = _add_border(_tracks(0, 10, 20, 30), 0, 39, 10)
    assert out.mean(axis=1).tolist() == [0, 10, 20, 30, 39]


def test_trace_that_misses_part_of_the_board_is_not_used():
    assert _fits_border(_tracks(0, 10, 20, 30), 0, 30, 10)
    # Stops 3 cells short of the border (a title band, halftone shading).
    assert not _fits_border(_tracks(0, 10, 20, 30), 0, 60, 10)
    # A gap of two cells: a line lost mid-board.
    assert not _fits_border(_tracks(0, 10, 30, 40), 0, 40, 10)
