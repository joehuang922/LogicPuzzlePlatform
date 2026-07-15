"""Grid detection for masyu puzzles via outer boundary + uniform subdivision.

Pipeline:
1. Find the largest rectangular contour (the board boundary)
2. Subdivide uniformly into expected_rows x expected_cols cells
3. Return cell center coordinates for ROI extraction
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray


@dataclass
class MasyuGeometry:
    image: NDArray
    rows: int
    cols: int
    cell_centers: NDArray  # (rows, cols, 2) array of cell center coordinates
    cell_h: float
    cell_w: float
    x0: float
    y0: float


def detect_masyu_grid(
    image: NDArray,
    expected_rows: int = 10,
    expected_cols: int = 10,
    debug_dir: str | None = None,
) -> MasyuGeometry:
    debug_path = Path(debug_dir) if debug_dir else None
    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape[:2]

    # Find the board boundary (largest rectangle)
    x0, y0, x1, y1 = _find_board_boundary(gray)

    if debug_path:
        vis = image.copy()
        cv2.rectangle(vis, (int(x0), int(y0)), (int(x1), int(y1)), (0, 255, 0), 2)
        cv2.imwrite(str(debug_path / "01_boundary.png"), vis)

    board_w = x1 - x0
    board_h = y1 - y0
    cell_w = board_w / expected_cols
    cell_h = board_h / expected_rows

    # Compute cell centers via uniform subdivision
    cell_centers = np.zeros((expected_rows, expected_cols, 2), dtype=np.float64)
    for r in range(expected_rows):
        for c in range(expected_cols):
            cx = x0 + (c + 0.5) * cell_w
            cy = y0 + (r + 0.5) * cell_h
            cell_centers[r, c] = [cx, cy]

    if debug_path:
        vis = image.copy()
        for r in range(expected_rows):
            for c in range(expected_cols):
                cx, cy = cell_centers[r, c]
                cv2.circle(vis, (int(cx), int(cy)), 3, (0, 255, 0), -1)
        cv2.imwrite(str(debug_path / "02_cell_centers.png"), vis)

    return MasyuGeometry(
        image=image,
        rows=expected_rows,
        cols=expected_cols,
        cell_centers=cell_centers,
        cell_h=cell_h,
        cell_w=cell_w,
        x0=x0,
        y0=y0,
    )


def _find_board_boundary(gray: NDArray) -> tuple[float, float, float, float]:
    """Find the board's outer boundary rectangle.

    Strategy: detect long horizontal and vertical lines using morphological
    operations, then find the bounding rectangle of the grid structure.
    This avoids picking up metadata/title areas outside the grid.
    """
    h_img, w_img = gray.shape[:2]

    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Detect long horizontal lines
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (w_img // 4, 1))
    h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)

    # Detect long vertical lines
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, h_img // 4))
    v_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)

    # Combine to get grid structure
    grid_mask = cv2.bitwise_or(h_lines, v_lines)

    # Find bounding rect of the grid lines
    coords = cv2.findNonZero(grid_mask)
    if coords is None:
        return _fallback_boundary(w_img, h_img)

    x, y, w, h = cv2.boundingRect(coords)

    # Sanity check
    if w < w_img * 0.3 or h < h_img * 0.3:
        return _fallback_boundary(w_img, h_img)

    return float(x), float(y), float(x + w), float(y + h)


def _fallback_boundary(w_img: int, h_img: int) -> tuple[float, float, float, float]:
    """Fall back to image edges with 5% margin."""
    margin_x = w_img * 0.05
    margin_y = h_img * 0.05
    return margin_x, margin_y, w_img - margin_x, h_img - margin_y
