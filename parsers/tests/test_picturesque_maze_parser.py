"""Tests for the Picturesque Maze (浮き出しメイロ) parser.

Three scans from two publishers (blue ink with IN/OUT labels; black ink with ▼
markers only, one 120x80 maze) and a hand-held phone photo of the first scan's
page, all in ``docs/picturesque-maze/``. No OCR, so the pipeline is
deterministic. Each scan is pinned against its canon at full size and at the
Android upload size (2000 px long side). The canons were checked by solving
them: each is a perfect maze (no loops, every cell reachable) whose route draws
the picture (a panda, two dice, a samurai). The photo has glare over part of the
board; it must read the scan's maze to within one wall, the misread leaving a
loop that the review flags.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from puzzle_parsers.models import PuzzleData
from puzzle_parsers.picturesque_maze.models import PicturesqueMazeBoard
from puzzle_parsers.picturesque_maze.parser import PicturesqueMazeParser, maze_imperfections, route_length

DOCS_DIR = Path(__file__).parents[2] / "docs" / "picturesque-maze"
SAMPLES = ["board-picturesque-maze-1", "board-picturesque-maze-2", "board-picturesque-maze-3"]


def _expected(name: str) -> dict:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())


def _read(name: str, long_side: int | None) -> dict:
    img = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    if long_side:
        f = long_side / max(img.shape[:2])
        img = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    return PicturesqueMazeParser()._parse_image(img).model_dump()


def _wall_diff(a: dict, b: dict) -> int:
    return sum(
        x != y
        for kind in ("h", "v")
        for ra, rb in zip(a["walls"][kind], b["walls"][kind])
        for x, y in zip(ra, rb)
    )


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("long_side", [None, 2000])
def test_scan_matches_canon(name, long_side):
    assert _read(name, long_side) == _expected(name)


@pytest.mark.parametrize("name", SAMPLES)
def test_canon_is_a_perfect_maze(name):
    board = PicturesqueMazeBoard(**_expected(name))
    assert maze_imperfections(board) == (0, 0)
    assert route_length(board) is not None


@pytest.mark.parametrize("long_side", [None, 2000])
def test_photo_reads_the_scanned_maze(long_side):
    board = _read("board-picturesque-maze-1-photo", long_side)
    expected = _expected("board-picturesque-maze-1")
    assert (board["width"], board["height"]) == (expected["width"], expected["height"])
    assert (board["entrance"], board["exit"]) == (expected["entrance"], expected["exit"])
    assert _wall_diff(board, expected) <= 1


def _draw_maze(walls_h, walls_v, entrance_col, exit_col, cell=40, margin=60):
    rows, cols = len(walls_v), len(walls_h[0])
    img = np.full((rows * cell + 2 * margin, cols * cell + 2 * margin, 3), 255, np.uint8)

    def line(x1, y1, x2, y2):
        cv2.line(img, (margin + x1 * cell, margin + y1 * cell), (margin + x2 * cell, margin + y2 * cell), (0, 0, 0), 3)

    for c in range(cols):
        if c != entrance_col:
            line(c, 0, c + 1, 0)
        if c != exit_col:
            line(c, rows, c + 1, rows)
    for r in range(rows):
        line(0, r, 0, r + 1)
        line(cols, r, cols, r + 1)
    for r in range(rows - 1):
        for c in range(cols):
            if walls_h[r][c]:
                line(c, r + 1, c + 1, r + 1)
    for r in range(rows):
        for c in range(cols - 1):
            if walls_v[r][c]:
                line(c + 1, r, c + 1, r + 1)
    return img


def _random_perfect_maze(rows, cols, seed):
    rng = np.random.default_rng(seed)
    walls_h = [[1] * cols for _ in range(rows - 1)]
    walls_v = [[1] * (cols - 1) for _ in range(rows)]
    seen = {(0, 0)}
    stack = [(0, 0)]
    while stack:
        r, c = stack[-1]
        options = [(r + dr, c + dc) for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1))
                   if 0 <= r + dr < rows and 0 <= c + dc < cols and (r + dr, c + dc) not in seen]
        if not options:
            stack.pop()
            continue
        nr, nc = options[rng.integers(len(options))]
        if nr != r:
            walls_h[min(r, nr)][c] = 0
        else:
            walls_v[r][min(c, nc)] = 0
        seen.add((nr, nc))
        stack.append((nr, nc))
    return walls_h, walls_v


def test_synthetic_maze_round_trips():
    walls_h, walls_v = _random_perfect_maze(24, 30, seed=7)
    img = _draw_maze(walls_h, walls_v, entrance_col=3, exit_col=27)
    board = PicturesqueMazeParser()._parse_image(img).model_dump()
    assert (board["width"], board["height"]) == (30, 24)
    assert board["entrance"] == {"side": "top", "index": 3}
    assert board["exit"] == {"side": "bottom", "index": 27}
    assert board["walls"] == {"h": walls_h, "v": walls_v}


def test_validate_rejects_bad_boards():
    parser = PicturesqueMazeParser()
    good = _expected("board-picturesque-maze-2")
    assert parser.validate(PuzzleData(puzzle_type="picturesque-maze", grid=good))
    same = {**good, "exit": good["entrance"]}
    assert not parser.validate(PuzzleData(puzzle_type="picturesque-maze", grid=same))
    sealed = json.loads(json.dumps(good))
    sealed["walls"]["h"] = [[1] * good["width"] for _ in sealed["walls"]["h"]]
    assert not parser.validate(PuzzleData(puzzle_type="picturesque-maze", grid=sealed))
