"""Skeleton Puzzle grid: the lattice and which of its squares are cells.

The board is a crossword-shaped patch of cells with no rectangular border:
1. **Board.** Every grid line is joined to the others, so the board is the
   largest connected ink component. Only that component goes to
   ``rectify_board`` (as ``border_image``), with its rotated bounding box drawn
   round it as a frame: the ragged outline alone gave the border finder an
   inner rectangle (board 1) or the page's decorative frame (board 2).
   ``rectify_board`` flattens a curved page as for every board.
2. **Lattice.** ``find_grid_lines`` on the flattened board.
3. **Walls.** ``grid_utils.classify_border_lines`` reads every wall, outer
   ones included, as no line, thin (two cells) or thick (the outline).
4. **Cells.** Squares joined by a non-thick wall share a class, so they form
   regions. Each region votes from its own walls (thin inside means cells, no
   line inside means non-cells; its outer edge lined means cells) and a region
   with no vote takes the opposite of its thick-walled neighbours. A local
   pass then lets each square follow its four walls. Faint thin lines on a
   washed-out photo read as no line; voting per region (not one parity flood
   from a corner, which flipped whole bands) keeps such misreads local.
5. **Repair.** Every cell is in a slot, so a lone cell gets the square that
   joins it to the cell straight beyond filled in (see ``_bridge_isolated``).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import classify_border_lines, find_grid_lines, rectify_board

MASK_WORK_SIZE = 1600
ICM_ROUNDS = 20
NO_LINE, THIN, THICK = 0, 1, 2


@dataclass
class SkeletonGeometry:
    cells: list[list[int]]
    grid: BoardGrid
    quad: NDArray = field(repr=False)  # board corners in the source image (TL, TR, BR, BL)

    @property
    def rows(self) -> int:
        return self.grid.rows

    @property
    def cols(self) -> int:
        return self.grid.cols


def detect_skeleton_grid(image: NDArray, debug_dir: str | None = None) -> SkeletonGeometry:
    gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    board = rectify_board(image, border_image=_grid_only(gray), debug_dir=debug_dir)
    warped_gray = cv2.cvtColor(board.warped, cv2.COLOR_BGR2GRAY) if board.warped.ndim == 3 else board.warped
    h_lines, v_lines = find_grid_lines(warped_gray)
    grid = board.to_native(BoardGrid(warped=board.warped, h_lines=h_lines, v_lines=v_lines, quad=board.quad))
    h, v = classify_border_lines(grid.warped_gray, grid)
    cells = cell_mask(h, v, grid.rows, grid.cols)
    if debug_dir:
        _write_debug(grid, h, v, cells, Path(debug_dir))
    return SkeletonGeometry(cells=cells, grid=grid, quad=board.quad)


def _grid_only(gray: NDArray) -> NDArray:
    """The page with only the largest ink component (the grid) left, framed by its bounding box."""
    scale = min(1.0, MASK_WORK_SIZE / max(gray.shape))
    small = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    ink = cv2.adaptiveThreshold(small, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, 12)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
    if n <= 1:
        return gray
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    keep = (labels == largest).astype(np.uint8) * 255
    keep = cv2.resize(keep, (gray.shape[1], gray.shape[0]), interpolation=cv2.INTER_NEAREST)
    keep = cv2.dilate(keep, np.ones((3, 3), np.uint8))
    out = np.full_like(gray, 255)
    out[keep > 0] = gray[keep > 0]
    box = cv2.boxPoints(cv2.minAreaRect(cv2.findNonZero(keep))).astype(np.int32)
    cv2.polylines(out, [box], True, 0, max(3, int(max(gray.shape) / 400)))
    return out


def cell_mask(h: list[list[int]], v: list[list[int]], rows: int, cols: int) -> list[list[int]]:
    """1 = cell from full-lattice walls: h is (rows+1) x cols (wall above each square), v is rows x (cols+1)."""
    parent = list(range(rows * cols))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    internal = [((r - 1) * cols + c, r * cols + c, h[r][c]) for r in range(1, rows) for c in range(cols)]
    internal += [(r * cols + c - 1, r * cols + c, v[r][c]) for r in range(rows) for c in range(1, cols)]
    for a, b, w in internal:
        if w != THICK:
            parent[root(a)] = root(b)

    score: dict[int, int] = {}

    def vote(region: int, is_cell: bool) -> None:
        score[region] = score.get(region, 0) + (1 if is_cell else -1)

    for a, _, w in internal:
        if w == THIN:
            vote(root(a), True)
        elif w == NO_LINE:
            vote(root(a), False)
    outer = [(0, c, h[0][c]) for c in range(cols)] + [(rows - 1, c, h[rows][c]) for c in range(cols)]
    outer += [(r, 0, v[r][0]) for r in range(rows)] + [(r, cols - 1, v[r][cols]) for r in range(rows)]
    for r, c, w in outer:
        vote(root(r * cols + c), w != NO_LINE)

    label = {g: int(s > 0) for g, s in score.items() if s != 0}
    # Regions with no vote take the opposite of their thick-walled neighbours.
    for _ in range(rows * cols):
        votes: dict[int, list[int]] = {}
        for a, b, w in internal:
            if w != THICK:
                continue
            for x, y in ((a, b), (b, a)):
                gx, gy = root(x), root(y)
                if gx not in label and gy in label:
                    votes.setdefault(gx, [0, 0])[1 - label[gy]] += 1
        if not votes:
            break
        for g, (v0, v1) in votes.items():
            label[g] = int(v1 >= v0)
    mask = [[label.get(root(r * cols + c), 0) for c in range(cols)] for r in range(rows)]

    # Each square follows its four walls (outside the board counts as a non-cell).
    def cost(a: int, b: int, w: int) -> int:
        if w == THIN:
            return (a != 1) + (b != 1)
        if w == NO_LINE:
            return (a != 0) + (b != 0)
        return int(a == b)

    def energy(r: int, c: int, lab: int) -> int:
        total = 0
        for nr, nc, w in ((r - 1, c, h[r][c]), (r + 1, c, h[r + 1][c]), (r, c - 1, v[r][c]), (r, c + 1, v[r][c + 1])):
            other = mask[nr][nc] if 0 <= nr < rows and 0 <= nc < cols else 0
            total += cost(lab, other, w)
        return total

    for _ in range(ICM_ROUNDS):
        changed = False
        for r in range(rows):
            for c in range(cols):
                e0, e1 = energy(r, c, 0), energy(r, c, 1)
                if e0 != e1 and mask[r][c] != int(e1 < e0):
                    mask[r][c] = int(e1 < e0)
                    changed = True
        if not changed:
            break
    _bridge_isolated(mask, h, v)
    return mask


def _bridge_isolated(mask: list[list[int]], h: list[list[int]], v: list[list[int]]) -> None:
    """A cell in no slot can't be: fill the square that joins it to the cell straight beyond.

    A washed-out stretch of page can lose every wall of one square in a down or
    across run, leaving the run's end cut off as a lone cell (board 1's top row).
    The gap is filled only when no thick wall separates the three squares.
    """
    rows, cols = len(mask), len(mask[0])

    def wall(r: int, c: int, dr: int, dc: int) -> int:
        """The wall from (r, c) towards (r + dr, c + dc)."""
        if dr:
            return h[r + (1 if dr > 0 else 0)][c]
        return v[r][c + (1 if dc > 0 else 0)]

    def cell(r: int, c: int) -> bool:
        return 0 <= r < rows and 0 <= c < cols and mask[r][c] == 1

    for r in range(rows):
        for c in range(cols):
            if not mask[r][c] or any(cell(r + dr, c + dc) for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                continue
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                gr, gc = r + dr, c + dc
                if cell(gr + dr, gc + dc) and THICK not in (wall(r, c, dr, dc), wall(gr, gc, dr, dc)):
                    mask[gr][gc] = 1
                    break


def _write_debug(grid: BoardGrid, h: list[list[int]], v: list[list[int]], cells: list[list[int]], out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    vis = grid.warped.copy()
    hl, vl = grid.h_lines, grid.v_lines
    for r in range(grid.rows):
        for c in range(grid.cols):
            if cells[r][c]:
                overlay = vis[hl[r]:hl[r + 1], vl[c]:vl[c + 1]]
                overlay[:] = (overlay * 0.7 + np.array([255, 230, 180]) * 0.3).astype(np.uint8)
    colour = {THIN: (0, 200, 0), THICK: (0, 0, 255)}
    for r in range(grid.rows + 1):
        for c in range(grid.cols):
            if h[r][c]:
                cv2.line(vis, (vl[c] + 4, hl[r]), (vl[c + 1] - 4, hl[r]), colour[h[r][c]], 3)
    for r in range(grid.rows):
        for c in range(grid.cols + 1):
            if v[r][c]:
                cv2.line(vis, (vl[c], hl[r] + 4), (vl[c], hl[r + 1] - 4), colour[v[r][c]], 3)
    cv2.imwrite(str(out / "skeleton_cells.png"), vis)
