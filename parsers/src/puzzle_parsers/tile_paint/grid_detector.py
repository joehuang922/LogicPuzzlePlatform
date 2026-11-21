"""Board, grid, clue cells and clue-number crops of a Tile Paint photo.

Solid lines with thick tile walls and a thick border: the shared ``rectify_board``
(flattened) and ``find_grid_lines``. The small and medium photos also show parts of
neighbouring boards and the rule example; the border finder takes the complete board.

**Clue cells** carry a thin diagonal from the upper-left to the lower-right corner. Each
cell's diagonal is probed at 29 points between 15% and 85% of its length: a point is ink
when the adaptively thresholded image (block half a cell) has ink within 0.05 cell across
the line. Tile cells score 0 (nothing on their diagonal); clue cells, numbers or not,
score 0.7-1.0 on all three samples at full size and 2000 px (the numbers sit in the
triangles, so they don't matter). The cut is 0.4. The blank top-left corner has no
diagonal; it is a clue cell whenever both its neighbours are.

**Numbers** are read by the shared cell classifier (``DualIntegerTarget``, as Kakuro),
which sees through the diagonal: the strip clues cross it (the 3 of a 13, the 2 of a 12),
so any crop that erases the line cut those digits and EasyOCR misread them. The
classifier reports an empty half as 0, the same as a printed 0, so ``half_ink`` decides
which halves hold a number: the diagonal is taken out by a 45-degree opening (it follows
a line a curled page has bent; no digit stroke is that long), and the ink left is
grouped into marks on either side of the fitted diagonal.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.cell_ocr import crop_cell
from puzzle_parsers.grid_utils import find_grid_lines, rectify_board

# Diagonal probe.
DIAG_SPAN = (0.15, 0.85)
DIAG_POINTS = 29
DIAG_WINDOW = 0.05
DIAG_MIN = 0.4
# Ink test of a clue cell's halves, as fractions of the cell: how far the printed
# diagonal may sit off the corner-to-corner one, the shortest 45-degree stroke taken for
# that line and how far its pixels are grown (anti-aliased edges), the rim ignored
# (grid lines), the smallest mark that counts as a number (area, extent), and how far
# from the line its centre must lie.
DIAG_SHIFT = 0.15
LINE_KERNEL = 0.3
LINE_GROW = 0.04
INK_MARGIN = 0.1
MARK_MIN_AREA = 0.008
MARK_MIN_SIZE = 0.15
MARK_MIN_OFFSET = 0.08


@dataclass
class TilePaintGeometry:
    grid: BoardGrid
    gray: NDArray


def detect_tile_paint(image: NDArray, debug_dir: str | None = None) -> TilePaintGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)
    board = rectify_board(image, debug_dir=debug_dir)
    warped_gray = cv2.cvtColor(board.warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = find_grid_lines(warped_gray)
    grid = board.to_native(BoardGrid(warped=board.warped, h_lines=h_lines, v_lines=v_lines, quad=board.quad))
    gray = cv2.cvtColor(grid.warped, cv2.COLOR_BGR2GRAY)
    if debug_path:
        vis = grid.warped.copy()
        for y in grid.h_lines:
            cv2.line(vis, (0, int(y)), (vis.shape[1], int(y)), (0, 0, 200), 1)
        for x in grid.v_lines:
            cv2.line(vis, (int(x), 0), (int(x), vis.shape[0]), (200, 0, 0), 1)
        cv2.imwrite(str(debug_path / "01_grid.png"), vis)
    return TilePaintGeometry(grid=grid, gray=gray)


def _pitch(grid: BoardGrid) -> float:
    return ((grid.h_lines[-1] - grid.h_lines[0]) / grid.rows + (grid.v_lines[-1] - grid.v_lines[0]) / grid.cols) / 2


def diagonal_scores(gray: NDArray, grid: BoardGrid) -> NDArray:
    """Fraction of each cell's upper-left to lower-right diagonal that is ink."""
    p = _pitch(grid)
    block = max(3, int(p * 0.5) | 1)
    ink = cv2.adaptiveThreshold(gray, 1, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, block, 15)
    ih, iw = ink.shape
    scores = np.zeros((grid.rows, grid.cols))
    ts = np.linspace(*DIAG_SPAN, DIAG_POINTS)
    for r in range(grid.rows):
        y1, y2 = grid.h_lines[r], grid.h_lines[r + 1]
        for c in range(grid.cols):
            x1, x2 = grid.v_lines[c], grid.v_lines[c + 1]
            win = max(1, int(round(min(y2 - y1, x2 - x1) * DIAG_WINDOW)))
            hits = 0
            for t in ts:
                y = int(round(y1 + t * (y2 - y1)))
                x = int(round(x1 + t * (x2 - x1)))
                # across the diagonal: along (+1, -1)
                if any(
                    0 <= y - k < ih and 0 <= x + k < iw and ink[y - k, x + k]
                    for k in range(-win, win + 1)
                ):
                    hits += 1
            scores[r, c] = hits / len(ts)
    return scores


def find_clue_cells(gray: NDArray, grid: BoardGrid) -> list[list[bool]]:
    scores = diagonal_scores(gray, grid)
    clue = [[bool(scores[r, c] >= DIAG_MIN) for c in range(grid.cols)] for r in range(grid.rows)]
    if grid.rows > 1 and grid.cols > 1 and clue[0][1] and clue[1][0]:
        clue[0][0] = True  # the blank corner of the clue row and column
    return clue


def _ink(roi: NDArray) -> NDArray:
    block = max(3, int(min(roi.shape[:2]) * 0.5) | 1)
    return cv2.adaptiveThreshold(roi, 1, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, block, 15)


def _fit_diagonal(ink: NDArray) -> tuple[float, float]:
    """(offset, slope) of the printed diagonal in a full-cell crop: x = offset + slope * y.

    On a curled page the line runs off the cell's corner-to-corner diagonal; the best of
    a sweep of offsets and slopes near it (most ink along the line) is the printed one.
    """
    h, w = ink.shape
    ys = np.linspace(0.12 * h, 0.88 * h, 48)
    best = (-1.0, 0.0, w / h)
    for slope in np.linspace(0.8, 1.2, 9) * (w / h):
        for off in np.linspace(-DIAG_SHIFT, DIAG_SHIFT, 25) * w:
            xs = np.round(off + slope * ys).astype(int)
            ok = (xs >= 0) & (xs < w)
            score = ink[ys[ok].astype(int), xs[ok]].sum()
            if score > best[0]:
                best = (float(score), float(off), float(slope))
    return best[1], best[2]


def _diagonal_line(ink: NDArray, size: int) -> NDArray:
    """Pixels of long upper-left to lower-right strokes: the printed diagonal.

    An opening with a 45-degree line keeps only strokes longer than ``LINE_KERNEL`` of a
    cell. That follows a diagonal a curled page has bent, and no digit stroke is that
    long, so a digit crossing the line loses only where it overlaps it.
    """
    k = max(5, int(round(LINE_KERNEL * size)))
    line = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.eye(k, dtype=np.uint8))
    grow = max(1, int(round(LINE_GROW * size)))
    return cv2.dilate(line, np.ones((2 * grow + 1, 2 * grow + 1), np.uint8)).astype(bool)


def clue_crop(gray: NDArray, grid: BoardGrid, r: int, c: int) -> NDArray:
    """The whole clue cell, as the recognizer reads it (numbers reach the edges)."""
    return crop_cell(gray, grid.h_lines[r], grid.h_lines[r + 1], grid.v_lines[c], grid.v_lines[c + 1], margin=0)


def half_ink(gray: NDArray, grid: BoardGrid, r: int, c: int) -> tuple[bool, bool]:
    """Whether the upper-right and lower-left halves of a clue cell hold a number.

    The recognizer reports a half with no number as 0, the same as a printed 0, so a
    half's number is kept only when the half has ink. The printed diagonal is taken out
    first, then the ink left inside the cell (grid-line remains at the edge dropped) is
    grouped into marks, each assigned to the side of the fitted diagonal it lies on.
    """
    roi = clue_crop(gray, grid, r, c)
    h, w = roi.shape[:2]
    size = min(h, w)
    ink = _ink(roi)
    line = _diagonal_line(ink, size)
    off, slope = _fit_diagonal(ink)
    rest = ink.astype(bool) & ~line
    my, mx = int(round(h * INK_MARGIN)), int(round(w * INK_MARGIN))
    rest[:my] = rest[h - my:] = False
    rest[:, :mx] = rest[:, w - mx:] = False
    yy, xx = np.mgrid[0:h, 0:w]
    side = xx - (off + slope * yy)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(rest.astype(np.uint8), connectivity=8)
    right = down = False
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if area < MARK_MIN_AREA * size * size or max(bw, bh) < MARK_MIN_SIZE * size:
            continue
        # In cells; a mark close to the line is a piece of a digit crossing it, which
        # counts for neither half (its digit's main body decides).
        mean = side[labels == i].mean() / np.hypot(1.0, slope) / size
        if mean > MARK_MIN_OFFSET:
            right = True
        elif mean < -MARK_MIN_OFFSET:
            down = True
    return right, down
