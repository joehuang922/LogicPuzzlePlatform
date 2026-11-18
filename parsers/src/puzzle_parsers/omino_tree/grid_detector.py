"""Board, grid and arrows of an Omino Tree photo.

The board has a thick border and dashed interior lines, so it goes through the
shared ``rectify_board`` (flattened) and ``find_grid_lines``. Each photo also shows
part of a neighbouring puzzle cut off by the page edge; the border finder takes
the complete board.

Arrows are gray halftone block arrows centred on interior edges. Their dots are as
dark as the digits pixel by pixel, so a blur of about a twelfth of a cell (a few
dot periods) turns them into an even mid gray (0.25-0.8 of the paper) while digit
strokes stay darker and dashed lines and digit rims go lighter or thin; an opening
of a tenth of a cell removes what thin gray is left. Each remaining blob is an
arrow: its centroid snaps to the nearest interior edge midpoint and the edge's
normal is its axis. The tail end is a flat-ended shaft, the tip a point, so the
far end whose cross-section is narrower is the end cell.

Measured on the four samples (48 arrows at full size, 2000 and 1200 px): arrow
blobs are 0.17-0.22 cell^2 and leftover noise at most 0.008, so ``MIN_ARROW_AREA``
sits in a wide gap; the outer-end width ratio (tail / tip) is at least 1.38.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.grid_utils import find_grid_lines, rectify_board

# Blob area (cell^2) below which a gray blob is noise, and how far (cell) its
# centroid may sit from an edge midpoint.
MIN_ARROW_AREA = 0.04
MAX_SNAP = 0.3
# Fraction of the blob's extent, at each far end, whose cross-section is averaged.
END_BAND = 0.2


@dataclass
class OminoTreeGeometry:
    grid: BoardGrid
    # (r, c, dir) start cell and direction
    arrows: list[tuple[int, int, str]]
    # native board, grayscale, arrows whitened out: what the clue OCR reads
    ocr_gray: NDArray


def detect_omino_tree(image: NDArray, debug_dir: str | None = None) -> OminoTreeGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    board = rectify_board(image, debug_dir=debug_dir)
    warped_gray = cv2.cvtColor(board.warped, cv2.COLOR_BGR2GRAY)
    h_lines, v_lines = find_grid_lines(warped_gray)
    grid = board.to_native(BoardGrid(warped=board.warped, h_lines=h_lines, v_lines=v_lines, quad=board.quad))

    gray = cv2.cvtColor(grid.warped, cv2.COLOR_BGR2GRAY)
    mask, blurred, paper = _arrow_mask(gray, grid)
    arrows = _read_arrows(mask, grid)

    # OCR sees the digits only: arrow pixels that aren't digit-dark go white.
    near = cv2.dilate(mask, np.ones((5, 5), np.uint8))
    ocr_gray = gray.copy()
    ocr_gray[(near > 0) & (blurred >= 0.3 * paper)] = 255

    if debug_path:
        vis = grid.warped.copy()
        vis[mask > 0] = (0, 200, 0)
        for y in grid.h_lines:
            cv2.line(vis, (0, y), (vis.shape[1], y), (0, 0, 200), 1)
        for x in grid.v_lines:
            cv2.line(vis, (x, 0), (x, vis.shape[0]), (200, 0, 0), 1)
        cv2.imwrite(str(debug_path / "01_arrows.png"), vis)
        cv2.imwrite(str(debug_path / "02_ocr.png"), ocr_gray)

    return OminoTreeGeometry(grid=grid, arrows=arrows, ocr_gray=ocr_gray)


def _pitch(grid: BoardGrid) -> float:
    return ((grid.h_lines[-1] - grid.h_lines[0]) / grid.rows + (grid.v_lines[-1] - grid.v_lines[0]) / grid.cols) / 2


def _arrow_mask(gray: NDArray, grid: BoardGrid) -> tuple[NDArray, NDArray, float]:
    p = _pitch(grid)
    k = max(3, int(p / 12) | 1)
    blurred = cv2.GaussianBlur(gray, (k, k), 0)
    paper = float(np.percentile(blurred, 90))
    mask = ((blurred > 0.25 * paper) & (blurred < 0.8 * paper)).astype(np.uint8)
    o = max(3, int(p / 10) | 1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (o, o)))
    # Nothing outside the board's interior: the thick border blurs gray too.
    inner = np.zeros_like(mask)
    m = int(p * 0.08)
    inner[grid.h_lines[0] + m : grid.h_lines[-1] - m, grid.v_lines[0] + m : grid.v_lines[-1] - m] = 1
    return mask * inner, blurred, paper


def _read_arrows(mask: NDArray, grid: BoardGrid) -> list[tuple[int, int, str]]:
    p = _pitch(grid)
    hl = np.asarray(grid.h_lines, dtype=float)
    vl = np.asarray(grid.v_lines, dtype=float)
    n, labels, stats, cents = cv2.connectedComponentsWithStats(mask, connectivity=8)
    found: dict[tuple[str, int, int], tuple[int, int, str]] = {}
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < MIN_ARROW_AREA * p * p:
            continue
        cx, cy = cents[i]
        # Fractional cell coordinates of the centroid.
        fy = _frac(hl, cy)
        fx = _frac(vl, cx)
        best = None
        # Horizontal edge midpoint between rows r-1 and r at column c: (r, c + 0.5).
        r = round(fy)
        c = int(np.floor(fx))
        if 0 < r < grid.rows and 0 <= c < grid.cols:
            d = np.hypot(fy - r, fx - (c + 0.5))
            best = (d, "h", r, c)
        r2 = int(np.floor(fy))
        c2 = round(fx)
        if 0 < c2 < grid.cols and 0 <= r2 < grid.rows:
            d = np.hypot(fy - (r2 + 0.5), fx - c2)
            if best is None or d < best[0]:
                best = (d, "v", r2, c2)
        if best is None or best[0] > MAX_SNAP:
            continue
        _, kind, er, ec = best
        ys, xs = np.nonzero(labels == i)
        if kind == "h":
            # vertical arrow across the line between rows er-1 and er
            tip_low = _tip_at_high_end(ys, xs)
            found[(kind, er, ec)] = (er - 1, ec, "down") if tip_low else (er, ec, "up")
        else:
            tip_right = _tip_at_high_end(xs, ys)
            found[(kind, er, ec)] = (er, ec - 1, "right") if tip_right else (er, ec, "left")
    return sorted(found.values())


def _frac(lines: NDArray, pos: float) -> float:
    """Position in cell units along the axis whose grid lines are ``lines``."""
    i = int(np.clip(np.searchsorted(lines, pos) - 1, 0, len(lines) - 2))
    return i + (pos - lines[i]) / (lines[i + 1] - lines[i])


def _tip_at_high_end(along: NDArray, across: NDArray) -> bool:
    """Whether the arrow's point is at the high end of ``along``.

    Mean cross-section width over the outer ``END_BAND`` of the extent at each end:
    the flat tail keeps its shaft width, the tip narrows to a point.
    """
    lo, hi = along.min(), along.max()
    band = max(1.0, (hi - lo) * END_BAND)

    def mean_width(sel: NDArray) -> float:
        a = along[sel]
        b = across[sel]
        if a.size == 0:
            return 0.0
        widths = [np.ptp(b[a == v]) + 1 for v in np.unique(a)]
        return float(np.mean(widths))

    low_w = mean_width(along <= lo + band)
    high_w = mean_width(along >= hi - band)
    return high_w < low_w
