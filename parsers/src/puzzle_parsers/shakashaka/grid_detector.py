"""Shakashaka grid detection — uses shared grid_utils."""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.grid_utils import (
    detect_grid_lines,
    find_quadrilateral_border,
    warp_to_rectangle,
)


@dataclass
class ShakashakaGeometry:
    warped: NDArray
    rows: int
    cols: int
    h_lines: list[int]
    v_lines: list[int]
    cell_h: float
    cell_w: float


def detect_shakashaka_grid(
    img: NDArray, debug_dir: str | None = None
) -> ShakashakaGeometry:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    quad = find_quadrilateral_border(gray)
    warped = warp_to_rectangle(img, quad)
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    h_lines, v_lines = detect_grid_lines(warped_gray)

    rows = len(h_lines) - 1
    cols = len(v_lines) - 1

    cell_h = (h_lines[-1] - h_lines[0]) / rows if rows > 0 else 0
    cell_w = (v_lines[-1] - v_lines[0]) / cols if cols > 0 else 0

    return ShakashakaGeometry(
        warped=warped,
        rows=rows,
        cols=cols,
        h_lines=h_lines,
        v_lines=v_lines,
        cell_h=cell_h,
        cell_w=cell_w,
    )
