"""Zebra Rope parser: ropes through cell centres and circles on grid lines, no OCR.

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
from puzzle_parsers.zebra_rope.grid_detector import detect_zebra_rope
from puzzle_parsers.zebra_rope.models import ZebraRopeBoard, ZebraRopeCircle

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class ZebraRopeParser(PuzzleParser):
    puzzle_type = "zebra-rope"
    locates_board = True

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        # No OCR needed (no numbers); the backend is accepted for a uniform signature.
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> ZebraRopeBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> ZebraRopeBoard:
        geom = detect_zebra_rope(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.grid.quad)
        circles = [
            ZebraRopeCircle(dr=c.dr, dc=c.dc, color=c.color)
            for c in sorted(geom.circles, key=lambda c: (c.dr, c.dc))
        ]
        ropes = [[[r, c] for r, c in rope] for rope in geom.ropes]
        return ZebraRopeBoard(width=geom.cols, height=geom.rows, ropes=ropes, circles=circles)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = ZebraRopeBoard(**data.grid)
            if board.width < 2 or board.height < 2:
                return False
            if not board.ropes and not board.circles:
                return False
            for rope in board.ropes:
                if len(rope) < 2 or len({tuple(cell) for cell in rope}) != len(rope):
                    return False
                for j, (r, c) in enumerate(rope):
                    if not (0 <= r < board.height and 0 <= c < board.width):
                        return False
                    if j and max(abs(rope[j - 1][0] - r), abs(rope[j - 1][1] - c)) != 1:
                        return False
            seen: set[tuple[int, int]] = set()
            for circle in board.circles:
                if circle.color not in (0, 1, 2):
                    return False
                if not (1 <= circle.dr <= 2 * board.height - 1 and 1 <= circle.dc <= 2 * board.width - 1):
                    return False
                if circle.dr % 2 == 1 and circle.dc % 2 == 1:
                    return False
                if (circle.dr, circle.dc) in seen:
                    return False
                seen.add((circle.dr, circle.dc))
            return True
        except Exception:
            return False

    def to_json(self, board: ZebraRopeBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
