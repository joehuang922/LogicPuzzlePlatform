"""Tetro Chain K parser: a plain grid with circles on its lines, no OCR or Gemini."""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.tetro_chain_k.grid_detector import detect_tetro_chain_k
from puzzle_parsers.tetro_chain_k.models import TetroChainKBoard


class TetroChainKParser(PuzzleParser):
    puzzle_type = "tetro-chain-k"
    locates_board = True

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> TetroChainKBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> TetroChainKBoard:
        geom = detect_tetro_chain_k(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.grid.quad)
        return TetroChainKBoard(
            width=geom.grid.cols,
            height=geom.grid.rows,
            circles=[{"dr": k.dr, "dc": k.dc, "color": k.color} for k in geom.circles],
        )

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = TetroChainKBoard(**data.grid)
            rows, cols = board.height, board.width
            if rows < 2 or cols < 2:
                return False
            spots = set()
            for k in board.circles:
                if not (1 <= k.dr <= 2 * rows - 1 and 1 <= k.dc <= 2 * cols - 1):
                    return False
                if (k.dr % 2 == 1 and k.dc % 2 == 1) or k.color not in (0, 1, 2) or (k.dr, k.dc) in spots:
                    return False
                spots.add((k.dr, k.dc))
            return True
        except Exception:
            return False

    def to_json(self, board: TetroChainKBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
