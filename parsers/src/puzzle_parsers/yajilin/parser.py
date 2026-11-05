from __future__ import annotations

from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.debug_overlay import save_cell_labels, RED, GREEN
from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.yajilin.grid_detector import detect_yajilin_grid
from puzzle_parsers.yajilin.models import YajilinBoard, YajilinClue
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.cell_classify import (
    DirectedInteger,
    DirectedIntegerTarget,
    Integer,
    IntegerTarget,
    classify_cells,
)
from puzzle_parsers.cell_ocr import crop_cell

_DIRECTIONS = ("up", "down", "left", "right")


class YajilinParser(PuzzleParser):
    puzzle_type = "yajilin"

    def __init__(self, recognizer: CellRecognizer | None = None, **kwargs) -> None:
        self._recognizer = recognizer or GeminiRecognizer(**kwargs)

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self,
        image_path: str | Path,
        debug_dir: str | None = None,
    ) -> YajilinBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self,
        img_array: NDArray,
        debug_dir: str | None = None,
    ) -> YajilinBoard:
        geom = detect_yajilin_grid(img_array, debug_dir=debug_dir)

        debug_path = Path(debug_dir) if debug_dir else None
        rows = geom.rows
        cols = geom.cols

        # Shrink slightly to avoid grid line artifacts.
        cell_crops = [
            [
                crop_cell(
                    geom.warped_gray, geom.h_lines[r], geom.h_lines[r + 1],
                    geom.v_lines[c], geom.v_lines[c + 1], margin=0.1,
                )
                for c in range(cols)
            ]
            for r in range(rows)
        ]
        read = classify_cells(
            self._recognizer, cell_crops, [DirectedIntegerTarget(), IntegerTarget()]
        )
        cells: list[list[Optional[YajilinClue]]] = [[None] * cols for _ in range(rows)]
        for r in range(rows):
            for c in range(cols):
                cls = read[r][c]
                if isinstance(cls, DirectedInteger) and cls.direction in _DIRECTIONS:
                    cells[r][c] = YajilinClue(dir=cls.direction, num=cls.value)
                elif isinstance(cls, (DirectedInteger, Integer)) and cls.value > 0:
                    # A number whose arrow wasn't read: keep the clue, the
                    # editor fixes the direction.
                    cells[r][c] = YajilinClue(dir="right", num=cls.value)

        if debug_path:
            save_cell_labels(
                geom,
                [[f"{v.num}{v.dir[0]}" if v else '.' for v in row] for row in cells],
                debug_path / "03_classified.png",
                colors=[[RED if v else GREEN for v in row] for row in cells],
            )

        return YajilinBoard(cells=cells)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = YajilinBoard(**data.grid)
            for row in board.cells:
                for cell in row:
                    if cell is not None:
                        if cell.dir not in ("up", "down", "left", "right"):
                            return False
                        if cell.num < 0:
                            return False
            return True
        except Exception:
            return False
