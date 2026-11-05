from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.cell_ocr import read_cells
from puzzle_parsers.slitherlink.grid_detector import detect_slitherlink_grid
from puzzle_parsers.slitherlink.models import SlitherlinkBoard
if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class SlitherlinkParser(PuzzleParser):
    puzzle_type = "slitherlink"

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path,
        debug_dir: str | None = None,
    ) -> SlitherlinkBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray,
        debug_dir: str | None = None,
    ) -> SlitherlinkBoard:
        geom = detect_slitherlink_grid(
            img_array,
            debug_dir=debug_dir,
        )

        debug_path = Path(debug_dir) if debug_dir else None
        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)

        rows = geom.rows
        cols = geom.cols
        dot_grid = geom.dot_grid

        # Extract cell ROIs
        cell_crops: list[list[np.ndarray]] = []
        for r in range(rows):
            row_crops: list[np.ndarray] = []
            for c in range(cols):
                tl = dot_grid[r, c]
                tr = dot_grid[r, c + 1]
                bl = dot_grid[r + 1, c]
                br = dot_grid[r + 1, c + 1]

                cx = (tl[0] + tr[0] + bl[0] + br[0]) / 4
                cy = (tl[1] + tr[1] + bl[1] + br[1]) / 4
                cell_w = ((tr[0] - tl[0]) + (br[0] - bl[0])) / 2
                cell_h = ((bl[1] - tl[1]) + (br[1] - tr[1])) / 2

                roi_w = int(cell_w * 0.6)
                roi_h = int(cell_h * 0.6)
                x1 = max(0, int(cx - roi_w / 2))
                y1 = max(0, int(cy - roi_h / 2))
                x2 = min(gray.shape[1], int(cx + roi_w / 2))
                y2 = min(gray.shape[0], int(cy + roi_h / 2))
                cell_roi = gray[y1:y2, x1:x2]
                row_crops.append(cell_roi)
            cell_crops.append(row_crops)

        # Clues are 0-3; empty cells read -1.
        cells = read_cells(
            self._ocr, cell_crops, allow_multi_digits=False, allow_zero=True, max_value=3
        )

        if debug_path:
            vis = img_array.copy()
            for r in range(rows):
                for c in range(cols):
                    val = cells[r][c]
                    label = str(val) if val >= 0 else "."
                    cx = int((dot_grid[r, c, 0] + dot_grid[r, c + 1, 0]) / 2)
                    cy = int((dot_grid[r, c, 1] + dot_grid[r + 1, c, 1]) / 2)
                    cv2.putText(vis, label, (cx - 5, cy + 5),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
            cv2.imwrite(str(debug_path / "03_cells.png"), vis)

        return SlitherlinkBoard(cells=cells)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = SlitherlinkBoard(**data.grid)
            for row in board.cells:
                if not all(-1 <= v <= 3 for v in row):
                    return False
            return True
        except Exception:
            return False
