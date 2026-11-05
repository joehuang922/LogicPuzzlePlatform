"""Each parser's cell-reading debug image goes through ``debug_overlay``."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.debug_overlay import save_cell_labels

PKG = Path(__file__).resolve().parent.parent / "src" / "puzzle_parsers"
# Out of the plan's scope: slitherlink's dot lattice, combo_sudoku's sub-boards.
_EXEMPT = {"slitherlink", "combo_sudoku"}


def test_parsers_draw_cell_labels_with_the_shared_helper():
    offenders = [
        str(p.relative_to(PKG))
        for p in sorted(PKG.glob("*/parser.py"))
        if p.parent.name not in _EXEMPT and "cv2.putText(" in p.read_text()
    ]
    assert not offenders, "Use debug_overlay.save_cell_labels:\n" + "\n".join(offenders)


def test_save_cell_labels_draws_only_labelled_cells(tmp_path):
    lines = [0, 80, 160]
    grid = BoardGrid(warped=np.full((161, 161, 3), 255, np.uint8), h_lines=lines, v_lines=lines)
    out = tmp_path / "04_cells.png"
    save_cell_labels(grid, [["7", None], ["", "12"]], out)
    img = cv2.imread(str(out))
    inked = [[bool((img[r * 80 + 5:r * 80 + 75, c * 80 + 5:c * 80 + 75] < 200).any()) for c in (0, 1)] for r in (0, 1)]
    assert inked == [[True, False], [False, True]]
