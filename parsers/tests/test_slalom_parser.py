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

from puzzle_parsers.slalom.grid_detector import (
    SlalomGeometry,
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


def _gates(cells: list[list[int]], geom: SlalomGeometry) -> set[tuple[str, int, int, int]]:
    vertical, horizontal = detect_gate_cells(geom.warped_gray, geom, cells)
    gates = SlalomParser._build_gates(vertical, horizontal, cells, geom)
    return {(g.orientation, g.line, g.from_, g.to) for g in gates}


@pytest.mark.parametrize("name", sorted(SAMPLE_GATES))
def test_sample_gates(name):
    geom = detect_slalom_grid(cv2.imread(str(DOCS_DIR / name)))
    cells = classify_walls(geom.warped_gray, geom)
    assert _gates(cells, geom) == SAMPLE_GATES[name]


def _geometry(rows: int, cols: int) -> SlalomGeometry:
    return SlalomGeometry(
        warped=None, warped_gray=None, rows=rows, cols=cols,
        h_lines=list(range(rows + 1)), v_lines=list(range(cols + 1)),
        cell_h=1.0, cell_w=1.0,
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
