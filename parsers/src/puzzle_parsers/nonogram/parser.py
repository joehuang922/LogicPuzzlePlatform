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
from puzzle_parsers.nonogram.grid_detector import detect_nonogram_grid
from puzzle_parsers.nonogram.models import NonogramBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


ROW_CLUE_PROMPT = (
    "This image shows a cropped section of row clues from a nonogram puzzle. "
    "Each row of the grid has a sequence of numbers to the left indicating "
    "the lengths of consecutive filled groups in that row. "
    "Output a JSON array of arrays, where each inner array contains the clue "
    "numbers for that row, from top to bottom. A row with no clue has [0]. "
    "Example for 3 rows: [[3,2],[1],[5,1,2]]. No explanation, just the JSON."
)

COL_CLUE_PROMPT = (
    "This image shows a cropped section of column clues from a nonogram puzzle. "
    "Each column of the grid has a sequence of numbers above indicating "
    "the lengths of consecutive filled groups in that column. "
    "Output a JSON array of arrays, where each inner array contains the clue "
    "numbers for that column, from left to right. A column with no clue has [0]. "
    "Example for 3 columns: [[2,1],[4],[1,1,3]]. No explanation, just the JSON."
)


class NonogramParser(PuzzleParser):
    puzzle_type = "nonogram"

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
    ) -> NonogramBoard:
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
    ) -> NonogramBoard:
        geom = detect_nonogram_grid(
            img_array,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
            debug_dir=debug_dir,
        )

        debug_path = Path(debug_dir) if debug_dir else None

        # Extract row clue region
        rx, ry, rw, rh = geom.row_clue_rect
        row_clue_img = img_array[ry : ry + rh, rx : rx + rw]

        # Extract col clue region
        cx, cy, cw, ch = geom.col_clue_rect
        col_clue_img = img_array[cy : cy + ch, cx : cx + cw]

        if debug_path:
            cv2.imwrite(str(debug_path / "02_row_clues.png"), row_clue_img)
            cv2.imwrite(str(debug_path / "03_col_clues.png"), col_clue_img)

        # Use LLM to recognize clues from clue region images
        row_clue_pil = Image.fromarray(cv2.cvtColor(row_clue_img, cv2.COLOR_BGR2RGB))
        col_clue_pil = Image.fromarray(cv2.cvtColor(col_clue_img, cv2.COLOR_BGR2RGB))

        row_clues = self.recognizer.recognize_raw(row_clue_pil, ROW_CLUE_PROMPT)
        col_clues = self.recognizer.recognize_raw(col_clue_pil, COL_CLUE_PROMPT)

        return NonogramBoard(rowClues=row_clues, colClues=col_clues)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = NonogramBoard(**data.grid)
            for clue in board.rowClues + board.colClues:
                if not all(n >= 0 for n in clue):
                    return False
                if len(clue) == 0:
                    return False
            return True
        except Exception:
            return False
