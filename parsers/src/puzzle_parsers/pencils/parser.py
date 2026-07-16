from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import GeminiRecognizer, CellRecognizer
from puzzle_parsers.pencils.grid_detector import detect_pencils_grid
from puzzle_parsers.pencils.models import PencilsBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend

PENCILS_PROMPT = (
    "This image shows a grid of cells cropped from a 'Pencils' puzzle. "
    "Each cell is labeled with its row,col position. "
    "Each cell contains one of: "
    "  - A positive integer (1, 2, 3, 4, 5, 6, 7, 8, 9, or larger) representing a number clue. "
    "  - A pencil head icon: a filled triangular arrowhead pointing in one direction. "
    "    Output -1 if pointing UP, -2 if pointing DOWN, -3 if pointing LEFT, -4 if pointing RIGHT. "
    "  - Empty (no content visible). Output 0 for empty cells. "
    "For each cell, output the integer value. "
    "Respond with ONLY a JSON array of arrays (rows of integers). "
    "Example for a 3x3: [[0,-4,3],[0,5,0],[0,0,-1]]. No explanation, just the JSON."
)


class PencilsParser(PuzzleParser):
    puzzle_type = "pencils"

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
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self,
        image_path: str | Path,
        expected_rows: int | None = None,
        expected_cols: int | None = None,
        debug_dir: str | None = None,
    ) -> PencilsBoard:
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
    ) -> PencilsBoard:
        geom = detect_pencils_grid(
            img_array,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
            debug_dir=debug_dir,
        )

        debug_path = Path(debug_dir) if debug_dir else None
        rows = geom.rows
        cols = geom.cols

        # Extract cell crops for batch LLM recognition
        cell_crops: list[list[np.ndarray]] = []
        for r in range(rows):
            row_crops: list[np.ndarray] = []
            for c in range(cols):
                x1 = geom.v_lines[c]
                x2 = geom.v_lines[c + 1]
                y1 = geom.h_lines[r]
                y2 = geom.h_lines[r + 1]
                # Use center 70% to avoid grid line artifacts
                w = x2 - x1
                h = y2 - y1
                margin_x = int(w * 0.15)
                margin_y = int(h * 0.15)
                cell_roi = geom.warped_gray[
                    y1 + margin_y : y2 - margin_y,
                    x1 + margin_x : x2 - margin_x,
                ]
                row_crops.append(cell_roi)
            cell_crops.append(row_crops)

        # Recognize all cells via LLM in batch
        cells = self.recognizer.recognize(cell_crops, PENCILS_PROMPT)

        if debug_path:
            vis = geom.warped.copy()
            for r in range(rows):
                for c in range(cols):
                    val = cells[r][c]
                    if val == 0:
                        label = "."
                    elif val > 0:
                        label = str(val)
                    else:
                        label = {-1: "^", -2: "v", -3: "<", -4: ">"}[val]
                    cx = (geom.v_lines[c] + geom.v_lines[c + 1]) // 2
                    cy = (geom.h_lines[r] + geom.h_lines[r + 1]) // 2
                    cv2.putText(
                        vis, label, (cx - 5, cy + 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1,
                    )
            cv2.imwrite(str(debug_path / "04_classified.png"), vis)

        return PencilsBoard(cells=cells)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = PencilsBoard(**data.grid)
            for row in board.cells:
                if not all(v >= -4 for v in row):
                    return False
            return True
        except Exception:
            return False
