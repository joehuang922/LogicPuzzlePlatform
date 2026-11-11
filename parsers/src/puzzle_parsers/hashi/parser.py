"""Hashi parser: circled islands on an implicit lattice, numbers by EasyOCR.

``grid_detector`` finds the islands and their lattice coordinates (no grid
lines to rectify). Each island's number is a plain dark digit inside its ring;
the crop is a square inside the ring so the ring itself never reaches the OCR.
Numbers are single digits 1-8 by rule.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.cell_ocr import crop_cell, read_cells
from puzzle_parsers.hashi.grid_detector import HashiGeometry, detect_hashi_islands
from puzzle_parsers.hashi.models import HashiBoard
from puzzle_parsers.models import PuzzleData

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend

EMPTY = 0
MAX_CLUE = 8
# Half-side of the digit crop, as a fraction of the ring's outer radius: the
# crop's corners stay inside the ring's stroke.
DIGIT_HALF = 0.6


class HashiParser(PuzzleParser):
    puzzle_type = "hashi"
    locates_board = True

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> HashiBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> HashiBoard:
        geom = detect_hashi_islands(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.quad)
        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
        return HashiBoard(cells=self._read_numbers(gray, geom))

    def _read_numbers(self, gray: np.ndarray, geom: HashiGeometry) -> list[list[int]]:
        crops = []
        for island in geom.islands:
            half = DIGIT_HALF * geom.radius
            crops.append(crop_cell(
                gray, island.y - half, island.y + half, island.x - half, island.x + half, margin=0,
            ))
        numbers = read_cells(self._ocr, [crops], allow_multi_digits=False, max_value=MAX_CLUE)[0]
        cells = [[EMPTY] * geom.cols for _ in range(geom.rows)]
        for island, n in zip(geom.islands, numbers):
            cells[island.row][island.col] = n
        return cells

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = HashiBoard(**data.grid)
            cells = board.cells
            rows = len(cells)
            cols = len(cells[0]) if rows else 0
            if rows < 2 or cols < 2:
                return False
            if not all(len(row) == cols and all(EMPTY <= v <= MAX_CLUE for v in row) for row in cells):
                return False
            # The lattice spans the outermost islands.
            return (
                any(cells[0]) and any(cells[-1])
                and any(row[0] for row in cells) and any(row[-1] for row in cells)
            )
        except Exception:
            return False

    def to_json(self, board: HashiBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
