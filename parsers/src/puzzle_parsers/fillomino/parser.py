from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.fillomino.grid_detector import detect_fillomino_grid
from puzzle_parsers.fillomino.models import FillominoBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class FillominoParser(PuzzleParser):
    puzzle_type = "fillomino"

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> FillominoBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> FillominoBoard:
        from pathlib import Path as _Path

        geom = detect_fillomino_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        rows = geom.rows
        cols = geom.cols
        h_lines = geom.h_lines
        v_lines = geom.v_lines

        debug_path = _Path(debug_dir) if debug_dir else None

        # Extract cell ROIs
        cell_rois: list[list[np.ndarray]] = []
        for r in range(rows):
            row_rois: list[np.ndarray] = []
            for c in range(cols):
                y1 = h_lines[r]
                y2 = h_lines[r + 1]
                x1 = v_lines[c]
                x2 = v_lines[c + 1]

                margin_y = int((y2 - y1) * 0.2)
                margin_x = int((x2 - x1) * 0.2)
                cell_roi = warped_gray[
                    y1 + margin_y : y2 - margin_y, x1 + margin_x : x2 - margin_x
                ]
                row_rois.append(cell_roi)
            cell_rois.append(row_rois)

        # Recognize numbers via batch OCR
        if self._ocr is not None:
            cells = self._ocr.recognize_cells(cell_rois)
        else:
            cells = [[0] * cols for _ in range(rows)]

        if debug_path:
            vis = geom.warped.copy()
            for r in range(rows):
                for c in range(cols):
                    num = cells[r][c]
                    if num > 0:
                        y1 = h_lines[r]
                        x1 = v_lines[c]
                        cv2.putText(
                            vis,
                            str(num),
                            (x1 + 5, y1 + 20),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.4,
                            (0, 0, 255),
                            1,
                        )
            cv2.imwrite(str(debug_path / "04_cells.png"), vis)

        return FillominoBoard(cells=cells)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = FillominoBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows > 0 else 0
            if rows < 2 or cols < 2:
                return False
            for row in board.cells:
                if len(row) != cols:
                    return False
                for val in row:
                    if val < 0:
                        return False
            return True
        except Exception:
            return False

    def to_json(self, board: FillominoBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
