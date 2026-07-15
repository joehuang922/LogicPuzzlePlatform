from __future__ import annotations

import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.masyu.models import MasyuBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


MASYU_PROMPT_AUTO = (
    "This image shows a masyu puzzle grid. "
    "Count the rows and columns of the grid carefully. "
    "Each cell may contain a white circle (hollow/empty circle with dark outline), "
    "a black circle (filled dark circle), or be empty (no circle). "
    "For each cell, output: 0 if empty, 1 if white circle, 2 if black circle. "
    "Respond with ONLY a JSON array of arrays (rows of integers). "
    "Example for a 3x3: [[0,1,0],[2,0,1],[0,0,2]]. No explanation, just the JSON."
)


def _make_prompt(rows: int, cols: int) -> str:
    return (
        "This image shows a masyu puzzle grid. "
        f"The grid has {rows} rows and {cols} columns. "
        "Each cell may contain a white circle (hollow/empty circle with dark outline), "
        "a black circle (filled dark circle), or be empty (no circle). "
        "For each cell, output: 0 if empty, 1 if white circle, 2 if black circle. "
        f"Respond with ONLY a JSON array of {rows} arrays, each with {cols} integers. "
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

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            cv2.imwrite(f.name, img_array)
            cells = self.recognizer.recognize_full_image(f.name, MASYU_PROMPT_AUTO)

        if not isinstance(cells, list) or len(cells) == 0:
            raise ValueError(
                f"Expected non-empty grid from recognizer, got {type(cells)}"
            )
        for r, row in enumerate(cells):
            if not isinstance(row, list) or len(row) == 0:
                raise ValueError(f"Row {r} is not a valid list")

        board = MasyuBoard(cells=cells)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

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
        debug_path = Path(debug_dir) if debug_dir else None

        prompt = _make_prompt(expected_rows, expected_cols)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            cv2.imwrite(f.name, img_array)
            cells = self.recognizer.recognize_full_image(f.name, prompt)

        if not isinstance(cells, list) or len(cells) != expected_rows:
            raise ValueError(
                f"Expected {expected_rows} rows from recognizer, "
                f"got {len(cells) if isinstance(cells, list) else type(cells)}"
            )
        for r, row in enumerate(cells):
            if not isinstance(row, list) or len(row) != expected_cols:
                raise ValueError(
                    f"Expected {expected_cols} cols in row {r}, "
                    f"got {len(row) if isinstance(row, list) else type(row)}"
                )

        if debug_path:
            debug_path.mkdir(parents=True, exist_ok=True)
            import json
            (debug_path / "01_cells.json").write_text(
                json.dumps({"cells": cells}, indent=2)
            )

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
