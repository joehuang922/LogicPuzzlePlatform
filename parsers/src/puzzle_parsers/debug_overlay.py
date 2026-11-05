"""Debug image of a parse: each cell's reading drawn on the rectified board.

Every grid parser writes one when given a ``debug_dir`` (``04_cells.png`` or
``04_classified.png``), so the reading can be checked against the board by
eye. The label goes in the cell's top-left corner, next to a printed clue
rather than on top of it, and scales with the cell.
"""
from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import cv2

from puzzle_parsers.board_grid import BoardGrid

RED = (0, 0, 255)
GREEN = (0, 200, 0)
MAGENTA = (255, 0, 255)


def save_cell_labels(
    grid: BoardGrid,
    labels: Sequence[Sequence[str | None]],
    path: str | Path,
    *,
    colors: Sequence[Sequence[tuple[int, int, int]]] | None = None,
) -> None:
    """Write ``grid.warped`` with ``labels[r][c]`` drawn in each cell.

    An empty or ``None`` label leaves the cell bare. ``colors`` (BGR, per
    cell) defaults to red.
    """
    vis = grid.warped.copy()
    if vis.ndim == 2:
        vis = cv2.cvtColor(vis, cv2.COLOR_GRAY2BGR)
    cell = min(grid.cell_w, grid.cell_h)
    scale = max(0.4, cell / 150)
    thickness = max(1, round(cell / 70))
    for r in range(grid.rows):
        for c in range(grid.cols):
            label = labels[r][c]
            if not label:
                continue
            x, y = grid.v_lines[c], grid.h_lines[r]
            color = colors[r][c] if colors is not None else RED
            cv2.putText(
                vis, label, (int(x + 0.08 * cell), int(y + 0.3 * cell)),
                cv2.FONT_HERSHEY_SIMPLEX, scale, color, thickness,
            )
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), vis)
