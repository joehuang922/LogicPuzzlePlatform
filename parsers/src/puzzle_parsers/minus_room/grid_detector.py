"""Board, grid and circles of a Minus Room photo.

Solid lines and a thick border: the shared ``rectify_board`` (flattened) and
``find_grid_lines``. Each photo also shows parts of neighbouring puzzles; the border
finder takes the complete board.

Circles are white discs ringed in black, centred on the edge between two cells, on thin
lines and walls alike. ``cv2.HoughCircles`` on the native board (radius 0.12-0.26 cell)
finds them; one counts when its centre sits within 0.15 cell of an edge midpoint, which
digits (centred in cells) never do. Measured on the three samples at full size, 2000 and
1200 px: every circle found, none extra, radii 0.19-0.23 cell.

The image the clue OCR reads has every circle painted white (a disc overlaps the edge
of the two cells beside it).
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

MIN_RADIUS = 0.12
MAX_RADIUS = 0.26
MAX_SNAP = 0.15


@dataclass
class FoundCircle:
    dr: int
    dc: int
    x: float
    y: float
    radius: float


@dataclass
class MinusRoomGeometry:
    grid: BoardGrid
    gray: NDArray
    circles: list[FoundCircle]
    # gray with the circles painted white: what the given-number OCR reads
    ocr_gray: NDArray


def pitch(grid: BoardGrid) -> float:
    return ((grid.h_lines[-1] - grid.h_lines[0]) / grid.rows + (grid.v_lines[-1] - grid.v_lines[0]) / grid.cols) / 2


def detect_minus_room(image: NDArray, debug_dir: str | None = None) -> MinusRoomGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    board = rectify_board(image, debug_dir=debug_dir)
    warped_gray = cv2.cvtColor(board.warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = find_grid_lines(warped_gray)
    grid = board.to_native(BoardGrid(warped=board.warped, h_lines=h_lines, v_lines=v_lines, quad=board.quad))
    gray = cv2.cvtColor(grid.warped, cv2.COLOR_BGR2GRAY)
    circles = _find_circles(gray, grid)

    ocr_gray = gray.copy()
    for k in circles:
        cv2.circle(ocr_gray, (round(k.x), round(k.y)), round(k.radius * 1.2), 255, -1)

    if debug_path:
        vis = grid.warped.copy()
        for y in grid.h_lines:
            cv2.line(vis, (0, y), (vis.shape[1], y), (0, 0, 200), 1)
        for x in grid.v_lines:
            cv2.line(vis, (x, 0), (x, vis.shape[0]), (200, 0, 0), 1)
        for k in circles:
            cv2.circle(vis, (round(k.x), round(k.y)), round(k.radius), (0, 180, 0), 2)
        cv2.imwrite(str(debug_path / "01_circles.png"), vis)

    return MinusRoomGeometry(grid=grid, gray=gray, circles=circles, ocr_gray=ocr_gray)


def _find_circles(gray: NDArray, grid: BoardGrid) -> list[FoundCircle]:
    p = pitch(grid)
    found = cv2.HoughCircles(
        cv2.medianBlur(gray, 3), cv2.HOUGH_GRADIENT, dp=1, minDist=p * 0.4,
        param1=120, param2=30, minRadius=int(p * MIN_RADIUS), maxRadius=int(p * MAX_RADIUS),
    )
    hl = np.asarray(grid.h_lines, dtype=float)
    vl = np.asarray(grid.v_lines, dtype=float)
    out: dict[tuple[int, int], FoundCircle] = {}
    for x, y, r in (found[0] if found is not None else []):
        # Doubled coordinates: cell (r, c) centre is (2r, 2c), so 2 * fraction - 1.
        fy = 2 * np.interp(y, hl, np.arange(len(hl))) - 1
        fx = 2 * np.interp(x, vl, np.arange(len(vl))) - 1
        dr, dc = round(fy), round(fx)
        if (dr + dc) % 2 != 1 or not (0 <= dr <= 2 * (grid.rows - 1) and 0 <= dc <= 2 * (grid.cols - 1)):
            continue
        if np.hypot(fy - dr, fx - dc) / 2 > MAX_SNAP:
            continue
        out.setdefault((dr, dc), FoundCircle(dr, dc, float(x), float(y), float(r)))
    return sorted(out.values(), key=lambda k: (k.dr, k.dc))


def find_max_digit(image: NDArray, quad: NDArray, cols: int) -> tuple[int, int, int, int] | None:
    """Box (x, y, w, h) in ``image`` of N in the 「1〜N」 printed by the board's bottom-right.

    The range sits just right of or below the bottom-right corner. In a band around that
    corner (board erased), the 「〜」 is the component more than 1.4x as wide as tall;
    N is the next component right of it on the same line. Measured on the three samples
    at full size, 2000 and 1200 px: found every time.
    """
    from puzzle_parsers.grid_utils import order_points

    gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    q = order_points(quad)
    left, right = min(q[0][0], q[3][0]), max(q[1][0], q[2][0])
    bottom = max(q[2][1], q[3][1])
    p = (right - left) / cols
    x0, x1 = int(max(0, right - 3 * p)), int(min(w, right + 2.5 * p))
    y0, y1 = int(max(0, bottom - 1.2 * p)), int(min(h, bottom + 1.6 * p))
    if x1 <= x0 or y1 <= y0:
        return None
    region = crop_cell(gray, y0, y1, x0, x1, margin=0).copy()
    _, ink = cv2.threshold(region, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    poly = (np.asarray(q) - [x0, y0]).astype(np.int32)
    cv2.fillPoly(ink, [poly], 0)
    cv2.polylines(ink, [poly], True, 0, max(1, int(p * 0.12)))
    n, _, stats, _ = cv2.connectedComponentsWithStats(ink)
    comps = [
        tuple(int(v) for v in stats[k, :4])
        for k in range(1, n)
        if p * 0.04 < stats[k, 3] < p * 0.9 and stats[k, 2] < p * 0.9 and stats[k, 4] > p * p * 0.003
    ]
    best = None
    for tx, ty, tw, th in comps:
        if not (tw > 1.4 * th and tw > p * 0.2):
            continue
        cy = ty + th / 2
        after = [
            c for c in comps
            if c[0] > tx + tw - p * 0.05 and abs(c[1] + c[3] / 2 - cy) < p * 0.3
            and c[0] - (tx + tw) < p * 0.6 and c[3] > p * 0.2
        ]
        if after:
            best = min(after, key=lambda c: c[0])
    if best is None:
        return None
    x, y, bw, bh = best
    return x + x0, y + y0, bw, bh
