from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.recognition_schemas import INT_CELL_PROMPT
from puzzle_parsers.slitherlink.grid_detector import detect_slitherlink_grid
from puzzle_parsers.slitherlink.models import SlitherlinkBoard
if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


SLITHERLINK_PROMPT = (
    "This image shows a grid of cells cropped from a slitherlink puzzle. "
    "Each cell is labeled with its row,col position. "
    "Each cell may contain a single digit (0, 1, 2, or 3) or be empty. "
    "For each cell, output the digit if one is clearly printed, or -1 if empty. "
    "Respond with ONLY a JSON array of arrays (rows of integers). "
    "Example for a 3x3: [[1,-1,3],[-1,2,-1],[0,-1,-1]]. No explanation, just the JSON."
)


class SlitherlinkParser(PuzzleParser):
    puzzle_type = "slitherlink"

    def __init__(
        self,
        ocr_backend: OcrBackend | None = None,
        recognizer: CellRecognizer | None = None,
    ) -> None:
        self._ocr = ocr_backend
        self._recognizer = recognizer

    @property
    def recognizer(self) -> CellRecognizer:
        if self._recognizer is None:
            self._recognizer = GeminiRecognizer()
        return self._recognizer

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array, expected_rows=None, expected_cols=None)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path,
        expected_rows: int = 10, expected_cols: int = 10,
        debug_dir: str | None = None,
    ) -> SlitherlinkBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(
            img_array, expected_rows=expected_rows, expected_cols=expected_cols,
            debug_dir=debug_dir,
        )

    def _parse_image(
        self, img_array: np.ndarray,
        expected_rows: int | None = None, expected_cols: int | None = None,
        debug_dir: str | None = None,
    ) -> SlitherlinkBoard:
        geom = detect_slitherlink_grid(
            img_array,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
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

        # Recognize digits via LLM
        cells = self.recognizer.recognize(cell_crops, SLITHERLINK_PROMPT)

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
