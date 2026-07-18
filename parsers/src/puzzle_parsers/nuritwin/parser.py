from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.nuritwin.grid_detector import (
    NuritwinGeometry,
    classify_borders,
    detect_nuritwin_grid,
)
from puzzle_parsers.nuritwin.models import NuritwinBoard, NuritwinGrids
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.recognition_schemas import INT_CELL_PROMPT


class NuritwinParser(PuzzleParser):
    puzzle_type = "nuritwin"

    def __init__(self, recognizer: CellRecognizer | None = None, **kwargs) -> None:
        self._recognizer = recognizer or GeminiRecognizer(**kwargs)

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> NuritwinBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> NuritwinBoard:
        geom = detect_nuritwin_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        h_borders, v_borders = classify_borders(warped_gray, geom, debug_dir=debug_dir)
        cells = self._classify_cells(warped_gray, geom, debug_dir=debug_dir)

        return NuritwinBoard(
            cells=cells,
            grids=NuritwinGrids(h=h_borders, v=v_borders),
        )

    def _classify_cells(
        self,
        warped_gray: NDArray,
        geom: NuritwinGeometry,
        debug_dir: str | None = None,
    ) -> list[list[int]]:
        """Classify cell numbers using the LLM recognizer."""
        rows, cols = geom.rows, geom.cols
        margin_ratio = 0.2

        cell_crops: list[list[NDArray]] = []
        for r in range(rows):
            row_crops: list[NDArray] = []
            for c in range(cols):
                y1 = geom.h_lines[r]
                y2 = geom.h_lines[r + 1]
                x1 = geom.v_lines[c]
                x2 = geom.v_lines[c + 1]

                cell_h = y2 - y1
                cell_w = x2 - x1
                my = int(cell_h * margin_ratio)
                mx = int(cell_w * margin_ratio)

                roi = warped_gray[y1 + my: y2 - my, x1 + mx: x2 - mx]
                row_crops.append(roi)
            cell_crops.append(row_crops)

        raw = self._recognizer.recognize(cell_crops, INT_CELL_PROMPT)
        # Convert -1 (empty) to 0 for the canon format
        return [[max(0, v) for v in row] for row in raw]

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = NuritwinBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows > 0 else 0
            if rows < 2 or cols < 2:
                return False
            for row in board.cells:
                if len(row) != cols:
                    return False
                if not all(v >= 0 for v in row):
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

    def to_json(self, board: NuritwinBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
