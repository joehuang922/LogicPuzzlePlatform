"""Yajilix parser: letter + number + arrow clues by Gemini.

Every cell goes to ``cell_classify.classify_cells`` with a
``LetteredDirectedIntegerTarget`` (L / I / X). A clue mixes an arrow and a letter with
its number, which EasyOCR can't represent, so per CLAUDE.md it goes to Gemini; the
shared empty-cell test drops blank cells. A read with an unknown letter or direction is
kept out (the cell reads as empty) rather than guessed.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.cell_classify import LetteredDirectedInteger, LetteredDirectedIntegerTarget, classify_cells
from puzzle_parsers.cell_ocr import crop_cell
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.yajilix.grid_detector import detect_yajilix_grid
from puzzle_parsers.yajilix.models import YajilixBoard, YajilixClue

LETTERS = {
    "L": "capital L (the loop turns)",
    "I": "capital I, printed as a plain vertical bar like a lowercase l or |; never the digit 1 "
         "when a number follows it",
    "X": "capital X",
}
DIRECTIONS = {"up", "down", "left", "right"}
_CLUES = LetteredDirectedIntegerTarget(LETTERS)


class YajilixParser(PuzzleParser):
    puzzle_type = "yajilix"
    locates_board = True

    def __init__(self, recognizer: CellRecognizer | None = None, **kwargs) -> None:
        self._recognizer = recognizer or GeminiRecognizer(**kwargs)

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> YajilixBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> YajilixBoard:
        geom = detect_yajilix_grid(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.quad)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)
        return YajilixBoard(cells=self._classify_clues(warped_gray, geom))

    def _classify_clues(self, warped_gray: np.ndarray, geom: BoardGrid) -> list[list[YajilixClue | None]]:
        # Full cells: the arrow over a left/right clue often reaches the cell's top edge.
        crops = [
            [
                crop_cell(
                    warped_gray, geom.h_lines[r], geom.h_lines[r + 1],
                    geom.v_lines[c], geom.v_lines[c + 1], margin=0,
                )
                for c in range(geom.cols)
            ]
            for r in range(geom.rows)
        ]
        read = classify_cells(self._recognizer, crops, [_CLUES])
        return [[_clue(cls) for cls in row] for row in read]

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = YajilixBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows else 0
            if rows < 2 or cols < 2:
                return False
            return all(
                len(row) == cols and all(c is None or c.num >= 0 for c in row) for row in board.cells
            )
        except Exception:
            return False

    def to_json(self, board: YajilixBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")


def _clue(cls: object) -> YajilixClue | None:
    if not isinstance(cls, LetteredDirectedInteger):
        return None
    if cls.letter not in LETTERS or cls.direction not in DIRECTIONS:
        return None
    return YajilixClue(kind=cls.letter, num=cls.value, dir=cls.direction)
