"""L-Ring parser: arrows by Gemini.

Every cell goes to ``cell_classify.classify_cells`` with a ``SymbolTarget`` whose codes
are the canon's arrow codes (1 up, 2 right, 3 down, 4 left). Arrows are symbols EasyOCR
can't represent, so per CLAUDE.md they go to Gemini; the shared empty-cell test drops
blank cells.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.cell_classify import Symbol, SymbolTarget, classify_cells
from puzzle_parsers.cell_ocr import crop_cell
from puzzle_parsers.l_ring.grid_detector import detect_l_ring_grid
from puzzle_parsers.l_ring.models import LRingBoard
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer

EMPTY = 0
ARROW_CODES = {
    1: "bold black arrow pointing up",
    2: "bold black arrow pointing right",
    3: "bold black arrow pointing down",
    4: "bold black arrow pointing left",
}
_ARROWS = SymbolTarget(ARROW_CODES)


class LRingParser(PuzzleParser):
    puzzle_type = "l-ring"
    locates_board = True

    def __init__(self, recognizer: CellRecognizer | None = None, **kwargs) -> None:
        self._recognizer = recognizer or GeminiRecognizer(**kwargs)

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> LRingBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> LRingBoard:
        geom = detect_l_ring_grid(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.quad)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)
        return LRingBoard(cells=self._classify_arrows(warped_gray, geom))

    def _classify_arrows(self, warped_gray: np.ndarray, geom: BoardGrid) -> list[list[int]]:
        crops = [
            [
                crop_cell(
                    warped_gray, geom.h_lines[r], geom.h_lines[r + 1],
                    geom.v_lines[c], geom.v_lines[c + 1], margin=0.1,
                )
                for c in range(geom.cols)
            ]
            for r in range(geom.rows)
        ]
        read = classify_cells(self._recognizer, crops, [_ARROWS])
        return [
            [
                cls.code if isinstance(cls, Symbol) and cls.code in ARROW_CODES else EMPTY
                for cls in row
            ]
            for row in read
        ]

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = LRingBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows else 0
            if rows < 2 or cols < 2:
                return False
            allowed = {EMPTY, *ARROW_CODES}
            return all(len(row) == cols and all(v in allowed for v in row) for row in board.cells)
        except Exception:
            return False

    def to_json(self, board: LRingBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
