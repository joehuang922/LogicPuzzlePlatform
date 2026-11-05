from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.grid_utils import classify_border_thickness
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.nurimaze.grid_detector import (
    detect_nurimaze_grid,
)
from puzzle_parsers.nurimaze.models import NurimazeBoard, NurimazeGrids
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.cell_classify import Symbol, SymbolTarget, classify_cells
from puzzle_parsers.cell_ocr import crop_cell


# Cell values: 0 empty, 1 circle, 2 triangle, 3 start (S), 4 goal (G).
_SYMBOLS = SymbolTarget({
    1: "circle (hollow ring)",
    2: "triangle (hollow triangle)",
    3: "the letter S (start)",
    4: "the letter G (goal)",
})


class NurimazeParser(PuzzleParser):
    puzzle_type = "nurimaze"

    def __init__(self, recognizer: CellRecognizer | None = None, **kwargs) -> None:
        self._recognizer = recognizer or GeminiRecognizer(**kwargs)

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> NurimazeBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> NurimazeBoard:
        geom = detect_nurimaze_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        h_borders, v_borders = classify_border_thickness(warped_gray, geom, debug_dir=debug_dir)
        cells = self._classify_symbols(warped_gray, geom, debug_dir=debug_dir)

        return NurimazeBoard(
            cells=cells,
            grids=NurimazeGrids(h=h_borders, v=v_borders),
        )

    def _classify_symbols(
        self,
        warped_gray: NDArray,
        geom: BoardGrid,
        debug_dir: str | None = None,
    ) -> list[list[int]]:
        """Classify cell symbols using the LLM recognizer."""
        rows, cols = geom.rows, geom.cols
        cell_crops = [
            [
                crop_cell(
                    warped_gray, geom.h_lines[r], geom.h_lines[r + 1],
                    geom.v_lines[c], geom.v_lines[c + 1], margin=0.1,
                )
                for c in range(cols)
            ]
            for r in range(rows)
        ]

        read = classify_cells(self._recognizer, cell_crops, [_SYMBOLS])
        return [[cls.code if isinstance(cls, Symbol) else 0 for cls in row] for row in read]

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = NurimazeBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows > 0 else 0
            if rows < 2 or cols < 2:
                return False
            for row in board.cells:
                if len(row) != cols:
                    return False
                if not all(0 <= v <= 4 for v in row):
                    return False
            if len(board.grids.h) != rows - 1:
                return False
            for row in board.grids.h:
                if len(row) != cols:
                    return False
                if not all(v in (0, 1) for v in row):
                    return False
            if len(board.grids.v) != rows:
                return False
            for row in board.grids.v:
                if len(row) != cols - 1:
                    return False
                if not all(v in (0, 1) for v in row):
                    return False
            return True
        except Exception:
            return False

    def to_json(self, board: NurimazeBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
