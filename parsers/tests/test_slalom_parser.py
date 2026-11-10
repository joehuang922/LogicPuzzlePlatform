"""Tests for the Slalom parser's gate detection.

Gates (dashed lines through cell centres) are read from pixels, so this part of
the pipeline is deterministic and pinned exactly against hand-read gates on the
sample photos in ``docs/slalom/``. Clues (start circle, arrows) come from the
LLM and are not covered here.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import pytest

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.slalom.grid_detector import (
    classify_walls,
    detect_gate_cells,
    detect_slalom_grid,
)
from puzzle_parsers.slalom.parser import SlalomParser

DOCS_DIR = Path(__file__).parents[2] / "docs" / "slalom"

# Hand-read gates as (orientation, line, from, to).
SAMPLE_GATES = {
    "board-slalom.jpg": {
        ("v", 4, 0, 0), ("v", 8, 0, 0), ("v", 2, 4, 4), ("h", 4, 7, 7),
        ("h", 5, 5, 5), ("h", 7, 4, 4), ("v", 7, 7, 7), ("v", 1, 9, 9),
    },
    "board-slalom-medium.jpg": {
        ("v", 3, 0, 0), ("v", 11, 0, 1), ("v", 15, 0, 1), ("h", 2, 16, 16),
        ("h", 3, 2, 2), ("h", 3, 4, 6), ("v", 9, 3, 5), ("v", 3, 4, 5),
        ("v", 13, 3, 4), ("v", 1, 5, 5), ("v", 7, 5, 5), ("v", 11, 5, 5),
        ("v", 13, 6, 6), ("h", 6, 2, 2), ("h", 6, 4, 6), ("h", 6, 8, 8),
        ("v", 1, 7, 7), ("v", 6, 9, 11), ("h", 10, 8, 8), ("v", 4, 11, 11),
        ("h", 12, 2, 3), ("h", 14, 2, 2), ("v", 13, 14, 14), ("h", 15, 7, 10),
        ("v", 11, 16, 16),
    },
    # Mostly long vertical gates; Gemini used to read them as horizontal.
    "board-slalom-vol194-3.jpg": {
        ("v", 2, 0, 1), ("v", 4, 1, 2), ("v", 6, 2, 3), ("v", 8, 3, 3),
        ("v", 4, 4, 6), ("v", 6, 5, 6), ("v", 8, 5, 6), ("v", 1, 5, 7),
        ("v", 2, 5, 7), ("v", 1, 9, 9), ("v", 2, 9, 9),
    },
    "board-slalom-vol194-4.jpg": {
        ("h", 1, 3, 5), ("v", 8, 2, 2), ("h", 3, 4, 7), ("h", 5, 3, 5),
        ("v", 2, 6, 7), ("v", 6, 6, 7), ("v", 8, 6, 7), ("v", 2, 9, 9),
        ("v", 8, 9, 9),
    },
}


# A 45x31 phone photo of a curved page with a thumb's shadow over the top
# right corner. The circled 47 is the gate count; all 47 hand-checked against
# the photo, at full size and after Android's 2000px upload.
BIG = "board-slalom-45x31.jpg"
BIG_START = (32, 4)  # the circle's ring reads as dashes; the parser drops it
BIG_GATES = {
    ("h", 1, 4, 4), ("h", 3, 14, 16), ("h", 3, 20, 22), ("h", 5, 4, 6), ("h", 5, 12, 14),
    ("h", 7, 14, 16), ("h", 7, 28, 28), ("h", 9, 4, 8), ("h", 16, 19, 21), ("h", 17, 12, 12),
    ("h", 18, 9, 9), ("h", 18, 28, 28), ("h", 26, 21, 21), ("h", 28, 9, 11), ("h", 28, 26, 28),
    ("h", 35, 10, 12), ("h", 35, 22, 26), ("h", 37, 26, 26), ("h", 39, 16, 18),
    ("h", 40, 12, 14), ("h", 41, 0, 2), ("h", 41, 8, 10), ("h", 41, 24, 24), ("h", 41, 28, 30),
    ("v", 3, 29, 31), ("v", 4, 21, 25), ("v", 4, 40, 42), ("v", 5, 13, 15), ("v", 5, 29, 31),
    ("v", 5, 35, 37), ("v", 6, 19, 21), ("v", 7, 13, 15), ("v", 9, 4, 6), ("v", 12, 21, 23),
    ("v", 13, 9, 11), ("v", 16, 26, 30), ("v", 17, 33, 35), ("v", 21, 38, 40), ("v", 22, 27, 29),
    ("v", 23, 9, 11), ("v", 24, 23, 25), ("v", 24, 27, 29), ("v", 25, 7, 9), ("v", 27, 2, 2),
    ("v", 27, 13, 15), ("v", 29, 21, 21), ("v", 29, 37, 37),
}


def _gates(
    cells: list[list[int]], geom: BoardGrid, start: tuple[int, int] | None = None
) -> set[tuple[str, int, int, int]]:
    vertical, horizontal = detect_gate_cells(geom.warped_gray, geom, cells)
    vertical.discard(start)
    horizontal.discard(start)
    gates = SlalomParser._build_gates(vertical, horizontal, cells, geom)
    return {(g.orientation, g.line, g.from_, g.to) for g in gates}


@pytest.mark.parametrize("name", sorted(SAMPLE_GATES))
def test_sample_gates(name):
    geom = detect_slalom_grid(cv2.imread(str(DOCS_DIR / name)))
    cells = classify_walls(geom.warped_gray, geom)
    assert _gates(cells, geom) == SAMPLE_GATES[name]


@pytest.mark.parametrize("long_side", [None, 2000])
def test_big_curved_photo(long_side):
    """Flattened to 45x31 at both sizes (it read 46x30 with doubled and
    skipped lines, and 23x15 at Android size); shadowed walls still walls."""
    image = cv2.imread(str(DOCS_DIR / BIG))
    if long_side:
        f = long_side / max(image.shape[:2])
        image = cv2.resize(image, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    geom = detect_slalom_grid(image)
    assert (geom.rows, geom.cols) == (45, 31)
    cells = classify_walls(geom.warped_gray, geom)
    assert _gates(cells, geom, BIG_START) == BIG_GATES
    assert len(BIG_GATES) == 47


def _geometry(rows: int, cols: int) -> BoardGrid:
    return BoardGrid(
        warped=None, h_lines=list(range(rows + 1)), v_lines=list(range(cols + 1)),
    )


def test_build_gates_keeps_only_wall_to_wall_runs():
    cells = [
        [0, 0, 0, 0],
        [1, 0, 0, 1],
        [0, 0, 0, 0],
    ]
    vertical = {(0, 1)}  # border above, open cell below: dropped
    # (1,1)-(1,2) has walls at both ends: kept. (2,3) has the border on one side only: dropped.
    horizontal = {(1, 1), (1, 2), (2, 3)}
    gates = SlalomParser._build_gates(vertical, horizontal, cells, _geometry(3, 4))
    assert [(g.orientation, g.line, g.from_, g.to) for g in gates] == [("h", 1, 1, 2)]
