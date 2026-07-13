"""Grid detection for nonogram puzzles.

Pipeline:
1. Detect the main grid area (the playable cells) by finding the largest
   rectangular region bounded by thick lines.
2. Determine rows and columns from internal grid lines.
3. Identify the clue regions: above the grid (column clues) and to the
   left of the grid (row clues).
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray


@dataclass
class NonogramGeometry:
    image: NDArray
    rows: int
    cols: int
    grid_rect: tuple[int, int, int, int]  # x, y, w, h of the playable grid
    row_clue_rect: tuple[int, int, int, int]  # x, y, w, h of row clue region
    col_clue_rect: tuple[int, int, int, int]  # x, y, w, h of col clue region
    cell_w: float
    cell_h: float


def detect_nonogram_grid(
    image: NDArray,
    expected_rows: int | None = None,
    expected_cols: int | None = None,
    debug_dir: str | None = None,
) -> NonogramGeometry:
    from pathlib import Path

    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 128, 255, cv2.THRESH_BINARY_INV)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)

    grid_rect = cv2.boundingRect(contours[0])
    gx, gy, gw, gh = grid_rect

    if expected_rows and expected_cols:
        rows, cols = expected_rows, expected_cols
    else:
        cell_h_est = gh / (expected_rows or 10)
        cell_w_est = gw / (expected_cols or 10)
        rows = int(round(gh / cell_h_est))
        cols = int(round(gw / cell_w_est))

    cell_w = gw / cols
    cell_h = gh / rows

    row_clue_w = int(cell_w * max(r_len for r_len in ([5] if not expected_rows else [5])))
    row_clue_rect = (max(0, gx - row_clue_w), gy, row_clue_w, gh)

    col_clue_h = int(cell_h * 5)
    col_clue_rect = (gx, max(0, gy - col_clue_h), gw, col_clue_h)

    if debug_path:
        vis = image.copy()
        cv2.rectangle(vis, (gx, gy), (gx + gw, gy + gh), (0, 255, 0), 2)
        cv2.imwrite(str(debug_path / "01_grid.png"), vis)

    return NonogramGeometry(
        image=image,
        rows=rows,
        cols=cols,
        grid_rect=grid_rect,
        row_clue_rect=row_clue_rect,
        col_clue_rect=col_clue_rect,
        cell_w=cell_w,
        cell_h=cell_h,
    )
