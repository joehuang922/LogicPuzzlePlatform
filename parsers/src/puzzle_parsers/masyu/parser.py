from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.masyu.grid_detector import detect_masyu_grid
from puzzle_parsers.masyu.models import MasyuBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


MASYU_PROMPT = (
    "This image shows a grid of cells cropped from a masyu puzzle. "
    "Each cell is labeled with its row,col position. "
    "Each cell may contain a white circle (hollow/empty circle with dark outline), "
    "a black circle (filled dark circle), or be empty (no circle). "
    "For each cell, output: 0 if empty, 1 if white circle, 2 if black circle. "
    "Respond with ONLY a JSON array of arrays (rows of integers). "
    "Example for a 3x3: [[0,1,0],[2,0,1],[0,0,2]]. No explanation, just the JSON."
)


class MasyuParser(PuzzleParser):
    puzzle_type = "masyu"

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
        expected_rows: int | None = None,
        expected_cols: int | None = None,
        debug_dir: str | None = None,
    ) -> MasyuBoard:
        geom = detect_masyu_grid(
            img_array,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
            debug_dir=debug_dir,
        )

        debug_path = Path(debug_dir) if debug_dir else None
        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)

        rows = geom.rows
        cols = geom.cols
        cell_centers = geom.cell_centers

        # Extract cell ROIs
        cell_crops: list[list[np.ndarray]] = []
        roi_size_h = int(geom.cell_h * 0.7)
        roi_size_w = int(geom.cell_w * 0.7)
        for r in range(rows):
            row_crops: list[np.ndarray] = []
            for c in range(cols):
                cx, cy = cell_centers[r, c]
                x1 = max(0, int(cx - roi_size_w / 2))
                y1 = max(0, int(cy - roi_size_h / 2))
                x2 = min(gray.shape[1], int(cx + roi_size_w / 2))
                y2 = min(gray.shape[0], int(cy + roi_size_h / 2))
                cell_roi = gray[y1:y2, x1:x2]
                row_crops.append(cell_roi)
            cell_crops.append(row_crops)

        # Recognize circles via LLM
        cells = self.recognizer.recognize(cell_crops, MASYU_PROMPT)

        if debug_path:
            vis = img_array.copy()
            labels = {0: ".", 1: "W", 2: "B"}
            for r in range(rows):
                for c in range(cols):
                    val = cells[r][c]
                    label = labels.get(val, "?")
                    cx, cy = cell_centers[r, c]
                    cv2.putText(
                        vis,
                        label,
                        (int(cx) - 5, int(cy) + 5),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (0, 0, 255),
                        2,
                    )
            cv2.imwrite(str(debug_path / "03_cells.png"), vis)

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
