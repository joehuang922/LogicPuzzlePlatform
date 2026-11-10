"""Grid detection for slalom puzzles.

Pipeline:
1. Find quadrilateral border and warp to rectangle
2. Detect grid lines via morphological projection
3. Classify cells as wall (black) or empty (white) against the local paper
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy.ndimage import maximum_filter

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import (
    find_grid_lines,
    rectify_board,
)
from puzzle_parsers.cell_ocr import crop_cell



def detect_slalom_grid(
    image: NDArray,
    debug_dir: str | None = None,
) -> BoardGrid:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)


    board = rectify_board(image)


    warped = board.warped
    warp_h, warp_w = warped.shape[:2]
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    if debug_path:
        cv2.imwrite(str(debug_path / "01_warped.png"), warped)

    h_lines, v_lines = find_grid_lines(warped_gray)

    if debug_path:
        vis = warped.copy()
        for y in h_lines:
            cv2.line(vis, (0, y), (warp_w, y), (0, 0, 255), 1)
        for x in v_lines:
            cv2.line(vis, (x, 0), (x, warp_h), (255, 0, 0), 1)
        cv2.imwrite(str(debug_path / "02_grid_lines.png"), vis)


    return board.to_native(BoardGrid(
        warped=warped,
        warped_gray=warped_gray,
        h_lines=h_lines,
        v_lines=v_lines,
    ))


# A cell is a wall when its centre is darker than this fraction of the
# brightest paper within _WALL_PAPER_CELLS of it. Measured over every sample
# at full and Android size: walls <= 0.60 (a wall under a thumb's shadow on
# the 45x31 photo), paper >= 0.84.
_WALL_PAPER_RATIO = 0.75
_WALL_PAPER_CELLS = 3


def classify_walls(warped_gray: NDArray, geom: BoardGrid) -> list[list[int]]:
    """Classify cells as wall (1) or empty (0) against the local paper level.

    Walls are black cells (some carry a white gate number). A cell's level is
    the median of its central region (grid lines and a white digit stay out
    of it). A fixed dark cutoff (``cell_fill.is_filled``) missed walls in a
    shadow: they print grey (100-152) while the paper there is still white, so
    each cell is compared with the brightest paper in a 7x7 cell window.
    A slalom maze never has a solid 7x7 block of walls.
    """
    rows, cols = geom.rows, geom.cols
    level = np.array([
        [
            float(np.median(crop_cell(
                warped_gray, geom.h_lines[r], geom.h_lines[r + 1],
                geom.v_lines[c], geom.v_lines[c + 1], margin=0.2,
            )))
            for c in range(cols)
        ]
        for r in range(rows)
    ])
    paper = maximum_filter(level, size=2 * _WALL_PAPER_CELLS + 1, mode="nearest")
    return (level < _WALL_PAPER_RATIO * np.maximum(paper, 1)).astype(int).tolist()


def detect_gate_cells(
    warped_gray: NDArray,
    geom: BoardGrid,
    cells: list[list[int]],
    dark_threshold: int = 190,
) -> tuple[set[tuple[int, int]], set[tuple[int, int]]]:
    """Find the non-wall cells a dashed gate line runs through.

    Gates are dashed lines through cell centres. For each cell we scan a band
    over the middle half of the cell, along each axis, for a pixel column that
    reads as dashes: several separate dark runs with gaps between them. A solid
    grid line that strays into the band (imperfect grid fit) is one long run,
    so the dash test rejects it; the band's ends are trimmed so the crossing
    grid lines stay out. Tolerates about 10% of a cell of grid misalignment.

    Returns (vertical_cells, horizontal_cells) as sets of (row, col).
    """
    # Flatten lighting (photo shadows) by dividing out the local background.
    k = int(geom.cell_w) | 1
    background = cv2.morphologyEx(
        warped_gray, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
    )
    norm = cv2.divide(warped_gray, background, scale=255)

    vertical: set[tuple[int, int]] = set()
    horizontal: set[tuple[int, int]] = set()
    for r in range(geom.rows):
        for c in range(geom.cols):
            if cells[r][c] == 1:
                continue
            y1, y2 = geom.h_lines[r], geom.h_lines[r + 1]
            x1, x2 = geom.v_lines[c], geom.v_lines[c + 1]
            v_band = crop_cell(norm, y1, y2, x1, x2, margin=(0.12, 0.25))
            h_band = crop_cell(norm, y1, y2, x1, x2, margin=(0.25, 0.12)).T
            if _has_dashed_line(v_band, dark_threshold):
                vertical.add((r, c))
            if _has_dashed_line(h_band, dark_threshold):
                horizontal.add((r, c))
    return vertical, horizontal


def _has_dashed_line(band: NDArray, dark_threshold: int) -> bool:
    """Whether some pixel column of ``band`` (axis 0 = along the line) is dashed."""
    length, width = band.shape[:2]
    if length == 0 or width == 0:
        return False
    for x in range(width):
        # Darkest of 3 neighbouring columns, so a slightly tilted line still reads.
        column = band[:, max(0, x - 1):x + 2].min(axis=1) < dark_threshold
        runs = [n for n in _run_lengths(column) if n >= 2]
        if len(runs) < 3:
            continue
        dark_fraction = sum(runs) / length
        if 0.15 <= dark_fraction <= 0.8 and max(runs) < 0.35 * length:
            return True
    return False


def _run_lengths(mask: NDArray) -> list[int]:
    """Lengths of the consecutive True runs in a 1-D boolean array."""
    padded = np.concatenate(([False], mask, [False])).astype(np.int8)
    edges = np.flatnonzero(np.diff(padded))
    return list(edges[1::2] - edges[0::2])

