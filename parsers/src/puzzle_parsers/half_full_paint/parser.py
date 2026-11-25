"""Half-Full Paint parser: walls and circles, no OCR or Gemini.

Walls come from the shared ``classify_border_thickness`` and circles from the shared
``lattice_circles`` probe (Kuralin's), so the whole read is deterministic.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.half_full_paint.grid_detector import detect_half_full_paint
from puzzle_parsers.half_full_paint.models import HalfFullPaintBoard
from puzzle_parsers.models import PuzzleData


class HalfFullPaintParser(PuzzleParser):
    puzzle_type = "half-full-paint"
    locates_board = True

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> HalfFullPaintBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> HalfFullPaintBoard:
        geom = detect_half_full_paint(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.grid.quad)
        return HalfFullPaintBoard(
            width=geom.grid.cols,
            height=geom.grid.rows,
            grids={"h": geom.h_walls, "v": geom.v_walls},
            circles=[{"dr": c.dr, "dc": c.dc, "color": c.color} for c in geom.circles],
        )

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = HalfFullPaintBoard(**data.grid)
            rows, cols = board.height, board.width
            if rows < 2 or cols < 2:
                return False
            fits = lambda g, hh, ww: len(g) == hh and all(len(line) == ww and set(line) <= {0, 1} for line in g)  # noqa: E731
            if not fits(board.grids.h, rows - 1, cols) or not fits(board.grids.v, rows, cols - 1):
                return False
            spots = set()
            for c in board.circles:
                if not (1 <= c.dr <= 2 * rows - 1 and 1 <= c.dc <= 2 * cols - 1):
                    return False
                if c.dr % 2 == 1 and c.dc % 2 == 1 or c.color not in (0, 1, 2) or (c.dr, c.dc) in spots:
                    return False
                spots.add((c.dr, c.dc))
            return True
        except Exception:
            return False

    def to_json(self, board: HalfFullPaintBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
