from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.norinori.grid_detector import (
    classify_borders,
    detect_norinori_grid,
)
from puzzle_parsers.norinori.models import NorinoriBoard, NorinoriGrids
from puzzle_parsers.models import PuzzleData


class NorinoriParser(PuzzleParser):
    puzzle_type = "norinori"

    def __init__(self, **kwargs) -> None:
        # Norinori carries no numbers or symbols, so no OCR/recognizer is needed.
        # Accept and ignore backend kwargs for a uniform constructor signature.
        pass

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> NorinoriBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> NorinoriBoard:
        geom = detect_norinori_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        h_borders, v_borders = classify_borders(warped_gray, geom, debug_dir=debug_dir)

        return NorinoriBoard(grids=NorinoriGrids(h=h_borders, v=v_borders))

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = NorinoriBoard(**data.grid)
            h = board.grids.h
            v = board.grids.v
            rows = len(h) + 1
            cols = (len(v[0]) + 1) if v and v[0] is not None else 0
            if rows < 2 or cols < 2:
                return False
            if len(h) != rows - 1:
                return False
            for row in h:
                if len(row) != cols:
                    return False
                if not all(val in (0, 1) for val in row):
                    return False
            if len(v) != rows:
                return False
            for row in v:
                if len(row) != cols - 1:
                    return False
                if not all(val in (0, 1) for val in row):
                    return False
            return True
        except Exception:
            return False

    def to_json(self, board: NorinoriBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
