from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.debug_overlay import save_cell_labels
from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.cell_ocr import read_grid_clues
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.nurikabe.grid_detector import detect_nurikabe_grid
from puzzle_parsers.nurikabe.models import NurikabeBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class NurikabeParser(PuzzleParser):
    puzzle_type = "nurikabe"
    locates_board = True

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> NurikabeBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> NurikabeBoard:
        geom = detect_nurikabe_grid(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.quad)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        h_lines = geom.h_lines
        v_lines = geom.v_lines

        debug_path = Path(debug_dir) if debug_dir else None

        cells = read_grid_clues(
            self._ocr, warped_gray, h_lines, v_lines, allow_multi_digits=True
        )

        if debug_path:
            save_cell_labels(
                geom, [[str(v) if v > 0 else None for v in row] for row in cells],
                debug_path / "04_cells.png",
            )

        return NurikabeBoard(cells=cells)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = NurikabeBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows > 0 else 0
            if rows < 2 or cols < 2:
                return False
            has_clue = False
            for row in board.cells:
                if len(row) != cols:
                    return False
                for val in row:
                    if val < 0:
                        return False
                    if val > 0:
                        has_clue = True
            # A Nurikabe with no clues is unsolvable; at least one island clue is
            # required. We do not hard-fail on OCR misses beyond this, so an
            # imperfect parse still yields a hand-correctable board.
            return has_clue
        except Exception:
            return False

    def to_json(self, board: NurikabeBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
