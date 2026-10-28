from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.kuralin.grid_detector import detect_kuralin_grid
from puzzle_parsers.kuralin.models import KuralinBoard, KuralinCircle
from puzzle_parsers.models import PuzzleData

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class KuralinParser(PuzzleParser):
    puzzle_type = "kuralin"

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        # No OCR needed (no numbers), but accept the backend for a uniform
        # constructor signature across parsers.
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> KuralinBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> KuralinBoard:
        geom = detect_kuralin_grid(img_array, debug_dir=debug_dir)
        circles = [
            KuralinCircle(dr=c.dr, dc=c.dc, color=c.color)
            for c in sorted(geom.circles, key=lambda c: (c.dr, c.dc))
        ]
        return KuralinBoard(width=geom.cols, height=geom.rows, circles=circles)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = KuralinBoard(**data.grid)
            if board.width < 2 or board.height < 2:
                return False
            if not board.circles:
                return False
            seen: set[tuple[int, int]] = set()
            for circle in board.circles:
                if circle.color not in (0, 1, 2):
                    return False
                if circle.dr < 1 or circle.dr > 2 * board.height - 1:
                    return False
                if circle.dc < 1 or circle.dc > 2 * board.width - 1:
                    return False
                # Circles sit on grid lines, never at a cell center.
                if circle.dr % 2 == 1 and circle.dc % 2 == 1:
                    return False
                key = (circle.dr, circle.dc)
                if key in seen:
                    return False
                seen.add(key)
            return True
        except Exception:
            return False

    def to_json(self, board: KuralinBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
