"""Melon Pie parser: a dashed lattice with no border and circles on its points.

Deterministic, no OCR or Gemini: see ``grid_detector`` for how the board is located
without a border and how the lattice and circles are read.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.melon_pie.grid_detector import detect_melon_pie
from puzzle_parsers.melon_pie.models import MelonPieBoard
from puzzle_parsers.models import PuzzleData


class MelonPieParser(PuzzleParser):
    puzzle_type = "melon-pie"
    locates_board = True

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> MelonPieBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> MelonPieBoard:
        geom = detect_melon_pie(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.quad)
        if geom.width < 1 or geom.height < 1:
            raise ValueError("Could not find the Melon Pie lattice")
        return MelonPieBoard(
            width=geom.width,
            height=geom.height,
            circles=[{"r": k.dr, "c": k.dc, "color": k.color} for k in geom.circles],
        )

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = MelonPieBoard(**data.grid)
            if board.width < 1 or board.height < 1:
                return False
            seen = set()
            for k in board.circles:
                if not (0 <= k.r <= board.height and 0 <= k.c <= board.width) or k.color not in (0, 1, 2):
                    return False
                if (k.r, k.c) in seen:
                    return False
                seen.add((k.r, k.c))
            return True
        except Exception:
            return False

    def to_json(self, board: MelonPieBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
