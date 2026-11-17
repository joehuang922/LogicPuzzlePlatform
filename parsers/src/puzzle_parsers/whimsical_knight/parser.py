"""Whimsical Knight parser: dot lattice, gray squares, white circles and squares; no OCR.

See ``grid_detector`` for the detection design and measured thresholds.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.whimsical_knight.grid_detector import detect_whimsical_knight
from puzzle_parsers.whimsical_knight.models import WhimsicalKnightBoard, WhimsicalKnightPoint

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class WhimsicalKnightParser(PuzzleParser):
    puzzle_type = "whimsical-knight"
    locates_board = True

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        # No OCR needed (no numbers); the backend is accepted for a uniform signature.
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> WhimsicalKnightBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> WhimsicalKnightBoard:
        geom = detect_whimsical_knight(img_array, debug_dir=debug_dir)
        if geom.quad is not None:
            self._board_located(img_array, geom.quad)
        return WhimsicalKnightBoard(
            rows=geom.rows,
            cols=geom.cols,
            gray=geom.gray,
            circles=[WhimsicalKnightPoint(dr=dr, dc=dc) for dr, dc in geom.circles],
            squares=[WhimsicalKnightPoint(dr=dr, dc=dc) for dr, dc in geom.squares],
        )

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = WhimsicalKnightBoard(**data.grid)
            rows, cols = board.rows, board.cols
            if rows < 2 or cols < 2:
                return False
            if len(board.gray) != rows - 1 or any(len(r) != cols - 1 or any(v not in (0, 1) for v in r) for r in board.gray):
                return False
            seen: set[tuple[int, int]] = set()
            for kind, points in (("circle", board.circles), ("square", board.squares)):
                for p in points:
                    if not (0 <= p.dr <= 2 * (rows - 1) and 0 <= p.dc <= 2 * (cols - 1)):
                        return False
                    if p.dr % 2 == 1 and p.dc % 2 == 1:
                        return False
                    if kind == "square" and (p.dr % 2 or p.dc % 2):
                        return False
                    if (p.dr, p.dc) in seen:
                        return False
                    seen.add((p.dr, p.dc))
            return True
        except Exception:
            return False

    def to_json(self, board: WhimsicalKnightBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
