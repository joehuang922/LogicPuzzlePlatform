from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.grid_utils import classify_border_thickness
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.nuritwin.grid_detector import (
    detect_nuritwin_grid,
)
from puzzle_parsers.nuritwin.models import NuritwinBoard, NuritwinGrids
from puzzle_parsers.cell_ocr import read_grid_clues

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class NuritwinParser(PuzzleParser):
    puzzle_type = "nuritwin"

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

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

        h_borders, v_borders = classify_border_thickness(warped_gray, geom, debug_dir=debug_dir)
        cells = self._classify_cells(warped_gray, geom, debug_dir=debug_dir)

        return NuritwinBoard(
            cells=cells,
            grids=NuritwinGrids(h=h_borders, v=v_borders),
        )

    def _classify_cells(
        self,
        warped_gray: NDArray,
        geom: BoardGrid,
        debug_dir: str | None = None,
    ) -> list[list[int]]:
        """Read the printed clue numbers (0 where blank)."""
        return read_grid_clues(
            self._ocr, warped_gray, geom.h_lines, geom.v_lines, allow_multi_digits=True
        )

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
