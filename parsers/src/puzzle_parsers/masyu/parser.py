from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.masyu.grid_detector import detect_masyu_grid
from puzzle_parsers.masyu.models import MasyuBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class MasyuParser(PuzzleParser):
    puzzle_type = "masyu"

    def __init__(
        self,
        ocr_backend: OcrBackend | None = None,
        recognizer: object | None = None,
    ) -> None:
        pass

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array, expected_rows=10, expected_cols=10)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self,
        image_path: str | Path,
        expected_rows: int = 10,
        expected_cols: int = 10,
        debug_dir: str | None = None,
    ) -> MasyuBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(
            img_array,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
            debug_dir=debug_dir,
        )

    def _parse_image(
        self,
        img_array: np.ndarray,
        expected_rows: int = 10,
        expected_cols: int = 10,
        debug_dir: str | None = None,
    ) -> MasyuBoard:
        geom = detect_masyu_grid(
            img_array,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
            debug_dir=debug_dir,
        )

        debug_path = Path(debug_dir) if debug_dir else None
        rows = geom.rows
        cols = geom.cols

        cells = _detect_circles(
            geom.warped_gray, geom.h_lines, geom.v_lines, rows, cols, geom.cell_h
        )

        if debug_path:
            vis = geom.warped.copy()
            labels = {0: ".", 1: "W", 2: "B"}
            for r in range(rows):
                for c in range(cols):
                    val = cells[r][c]
                    label = labels.get(val, "?")
                    cx = (geom.v_lines[c] + geom.v_lines[c + 1]) // 2
                    cy = (geom.h_lines[r] + geom.h_lines[r + 1]) // 2
                    cv2.putText(
                        vis, label, (cx - 5, cy + 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1,
                    )
            cv2.imwrite(str(debug_path / "04_classified.png"), vis)

        return MasyuBoard(cells=cells)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = MasyuBoard(**data.grid)
            for row in board.cells:
                if not all(0 <= v <= 2 for v in row):
                    return False
            return True
        except Exception:
            return False


def _detect_circles(
    gray: np.ndarray,
    h_lines: list[int],
    v_lines: list[int],
    rows: int,
    cols: int,
    cell_size: float,
) -> list[list[int]]:
    """Detect circles using HoughCircles on the full warped image.

    Runs circle detection globally (more robust than per-cell), then assigns
    each detected circle to its grid cell and classifies by center intensity.
    """
    cells = [[0] * cols for _ in range(rows)]

    blurred = cv2.medianBlur(gray, 5)
    min_r = int(cell_size * 0.15)
    max_r = int(cell_size * 0.4)
    min_dist = int(cell_size * 0.5)

    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min_dist,
        param1=100,
        param2=20,
        minRadius=min_r,
        maxRadius=max_r,
    )

    if circles is None:
        return cells

    for cx, cy, _ in circles[0]:
        # Determine which cell this circle belongs to
        col = -1
        row = -1
        for c_idx in range(cols):
            if v_lines[c_idx] <= cx < v_lines[c_idx + 1]:
                col = c_idx
                break
        for r_idx in range(rows):
            if h_lines[r_idx] <= cy < h_lines[r_idx + 1]:
                row = r_idx
                break

        if row < 0 or col < 0:
            continue

        # Classify by center intensity
        ci, cj = int(cy), int(cx)
        patch = gray[max(0, ci - 2) : ci + 3, max(0, cj - 2) : cj + 3]
        mean_center = float(patch.mean())

        if mean_center < 128:
            cells[row][col] = 2  # Black circle
        else:
            cells[row][col] = 1  # White circle

    return cells
