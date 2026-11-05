from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.debug_overlay import save_cell_labels
from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.cell_fill import shaded_cells
from puzzle_parsers.cell_ocr import crop_cell, read_cells
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.double_choco.grid_detector import detect_double_choco_grid
from puzzle_parsers.double_choco.models import DoubleChocoBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class DoubleChocoParser(PuzzleParser):
    puzzle_type = "double-choco"

    _COLOR_MARGIN = 0.2

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> DoubleChocoBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> DoubleChocoBoard:
        from pathlib import Path as _Path

        geom = detect_double_choco_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        rows = geom.rows
        cols = geom.cols
        h_lines = geom.h_lines
        v_lines = geom.v_lines

        debug_path = _Path(debug_dir) if debug_dir else None

        # Colour crops (centre of each cell) for the shared grey/white split,
        # and the shared OCR crop for the clue.
        color_rois = [
            [crop_cell(warped_gray, h_lines[r], h_lines[r + 1], v_lines[c], v_lines[c + 1],
                       margin=self._COLOR_MARGIN) for c in range(cols)]
            for r in range(rows)
        ]
        ocr_rois = [
            [crop_cell(warped_gray, h_lines[r], h_lines[r + 1], v_lines[c], v_lines[c + 1])
             for c in range(cols)]
            for r in range(rows)
        ]
        colors = shaded_cells(color_rois)

        # Clues can exceed 9 ("11", "12", ...).
        numbers = read_cells(self._ocr, ocr_rois, allow_multi_digits=True)

        cells = [
            [[colors[r][c], numbers[r][c]] for c in range(cols)] for r in range(rows)
        ]

        if debug_path:
            labels = [[('G' if col else 'W') + (str(n) if n > 0 else '') for col, n in row] for row in cells]
            save_cell_labels(geom, labels, debug_path / "04_cells.png")

        return DoubleChocoBoard(cells=cells)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = DoubleChocoBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows > 0 else 0
            if rows < 2 or cols < 2:
                return False
            for row in board.cells:
                if len(row) != cols:
                    return False
                for cell in row:
                    if len(cell) != 2:
                        return False
                    if cell[0] not in (0, 1):
                        return False
                    if cell[1] < 0:
                        return False
            return True
        except Exception:
            return False

    def to_json(self, board: DoubleChocoBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
