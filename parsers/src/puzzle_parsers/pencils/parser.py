from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.debug_overlay import save_cell_labels
from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import GeminiRecognizer, CellRecognizer
from puzzle_parsers.cell_classify import (
    Integer,
    IntegerTarget,
    PencilHead,
    PencilHeadTarget,
    classify_cells,
)
from puzzle_parsers.pencils.grid_detector import detect_pencils_grid
from puzzle_parsers.pencils.models import PencilsBoard
from puzzle_parsers.cell_ocr import crop_cell

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


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
        debug_dir: str | None = None,
    ) -> PencilsBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self,
        img_array: np.ndarray,
        debug_dir: str | None = None,
    ) -> PencilsBoard:
        geom = detect_pencils_grid(img_array, debug_dir=debug_dir)

        debug_path = Path(debug_dir) if debug_dir else None
        rows = geom.rows
        cols = geom.cols

        # Full cells for LLM recognition: a pencil's tip and shaft reach the edges.
        cell_crops = [
            [
                crop_cell(
                    geom.warped_gray, geom.h_lines[r], geom.h_lines[r + 1],
                    geom.v_lines[c], geom.v_lines[c + 1], margin=0,
                )
                for c in range(cols)
            ]
            for r in range(rows)
        ]

        # Recognize all cells via LLM using custom montage with red borders
        cells = self._recognize_with_montage(cell_crops)

        if debug_path:
            arrows = {-1: '^', -2: 'v', -3: '<', -4: '>'}
            labels = [[str(v) if v > 0 else arrows.get(v, '.') for v in row] for row in cells]
            save_cell_labels(geom, labels, debug_path / "04_classified.png")

        return PencilsBoard(cells=cells)

    def _recognize_with_montage(self, cell_crops: list[list[np.ndarray]]) -> list[list[int]]:
        """Read clue numbers and pencil heads with the shared classifier."""
        read = classify_cells(self.recognizer, cell_crops, [IntegerTarget(), PencilHeadTarget()])
        return [[_cell_value(cls) for cls in row] for row in read]

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


# A pencil head is stored as a negative int by the direction its tip points.
_HEAD_VALUE = {"up": -1, "down": -2, "left": -3, "right": -4}


def _cell_value(cls: object) -> int:
    """Board value of one classified cell: clue number, head (-1..-4) or 0."""
    if isinstance(cls, Integer) and cls.value > 0:
        return cls.value
    if isinstance(cls, PencilHead):
        return _HEAD_VALUE.get(cls.direction, 0)
    return 0
