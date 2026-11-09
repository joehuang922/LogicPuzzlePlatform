"""Balance Link parser: black cells by a fill test, symbols by Gemini.

* **Black cells** — dark across the cell *and* in all four corners. A filled symbol
  (black circle, square, diamond) can darken most of a cell's centre, which the shared
  ``is_filled`` centre test would call black; only a black cell reaches the corners.
* **Symbols** — every other cell goes to ``cell_classify.classify_cells`` with one
  ``SymbolTarget`` code per shape and colour, the canon codes themselves (tens = shape,
  ones = 0 outlined / 1 filled). Black cells are blanked to white so they stay out;
  the shared empty-cell test drops blank cells.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.balance_link.grid_detector import detect_balance_link_grid
from puzzle_parsers.balance_link.models import BalanceLinkBoard
from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.cell_classify import Symbol, SymbolTarget, classify_cells
from puzzle_parsers.cell_fill import dark_fraction
from puzzle_parsers.cell_ocr import crop_cell
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer

WHITE, BLACK = 0, 1

_SHAPES = {
    1: "circle",
    2: "square (axis-aligned)",
    3: "diamond (a square rotated 45 degrees)",
    4: "triangle pointing up",
    5: "triangle pointing down",
    6: "five-pointed star",
    7: "four-pointed star with concave sides (like a sparkle)",
}
SYMBOL_CODES = {
    shape * 10 + black: f"{'solid black (filled)' if black else 'white (outline only)'} {name}"
    for shape, name in _SHAPES.items()
    for black in (0, 1)
}
_SYMBOLS = SymbolTarget(SYMBOL_CODES)

# Inner part of the cell sampled for the black test, and its corner patches.
_BLACK_MARGIN = 0.08
_CORNER = 0.2
_BLACK_DARK = 0.6


def is_black_cell(crop: NDArray) -> bool:
    """True when ``crop`` (a cell with a small margin) is dark overall and in every corner."""
    if dark_fraction(crop) <= _BLACK_DARK:
        return False
    h, w = crop.shape[:2]
    ch, cw = max(1, int(h * _CORNER)), max(1, int(w * _CORNER))
    corners = (crop[:ch, :cw], crop[:ch, -cw:], crop[-ch:, :cw], crop[-ch:, -cw:])
    return all(dark_fraction(c) > _BLACK_DARK for c in corners)


class BalanceLinkParser(PuzzleParser):
    puzzle_type = "balance-link"
    locates_board = True

    def __init__(self, recognizer: CellRecognizer | None = None, **kwargs) -> None:
        self._recognizer = recognizer or GeminiRecognizer(**kwargs)

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> BalanceLinkBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> BalanceLinkBoard:
        geom = detect_balance_link_grid(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.quad)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)
        black = self.find_black(warped_gray, geom)
        cells = self._classify_symbols(warped_gray, geom, black)
        return BalanceLinkBoard(cells=cells)

    @staticmethod
    def find_black(warped_gray: NDArray, geom: BoardGrid) -> set[tuple[int, int]]:
        return {
            (r, c)
            for r in range(geom.rows)
            for c in range(geom.cols)
            if is_black_cell(crop_cell(
                warped_gray, geom.h_lines[r], geom.h_lines[r + 1],
                geom.v_lines[c], geom.v_lines[c + 1], margin=_BLACK_MARGIN,
            ))
        }

    def _classify_symbols(
        self, warped_gray: NDArray, geom: BoardGrid, black: set[tuple[int, int]]
    ) -> list[list[int]]:
        crops = []
        for r in range(geom.rows):
            row = []
            for c in range(geom.cols):
                crop = crop_cell(
                    warped_gray, geom.h_lines[r], geom.h_lines[r + 1],
                    geom.v_lines[c], geom.v_lines[c + 1], margin=0.1,
                )
                # Keep black cells out of the montage.
                row.append(np.full_like(crop, 255) if (r, c) in black else crop)
            crops.append(row)
        read = classify_cells(self._recognizer, crops, [_SYMBOLS])
        return [
            [
                BLACK if (r, c) in black
                else cls.code if isinstance(cls, Symbol) and cls.code in SYMBOL_CODES
                else WHITE
                for c, cls in enumerate(row)
            ]
            for r, row in enumerate(read)
        ]

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = BalanceLinkBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows else 0
            if rows < 2 or cols < 2:
                return False
            allowed = {WHITE, BLACK, *SYMBOL_CODES}
            return all(len(row) == cols and all(v in allowed for v in row) for row in board.cells)
        except Exception:
            return False

    def to_json(self, board: BalanceLinkBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
