from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.kakuro.grid_detector import (
    KakuroGeometry,
    detect_kakuro_grid,
)
from puzzle_parsers.kakuro.models import KakuroBoard, KakuroClueCell, KakuroEmptyCell
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.recognition_schemas import DUAL_INT_CELL_PROMPT

BLACK_THRESHOLD = 100


class KakuroParser(PuzzleParser):
    puzzle_type = "kakuro"

    def __init__(self, recognizer: CellRecognizer | None = None, **kwargs) -> None:
        self._recognizer = recognizer or GeminiRecognizer(**kwargs)

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> KakuroBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> KakuroBoard:
        geom = detect_kakuro_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        cells = self._classify_cells(warped_gray, geom, debug_dir=debug_dir)
        return KakuroBoard(cells=cells)

    def _classify_cells(
        self,
        warped_gray: NDArray,
        geom: KakuroGeometry,
        debug_dir: str | None = None,
    ) -> list[list[KakuroClueCell | KakuroEmptyCell]]:
        rows, cols = geom.rows, geom.cols
        margin_ratio = 0.15

        cells: list[list[KakuroClueCell | KakuroEmptyCell]] = []
        clue_cell_coords: list[tuple[int, int]] = []
        clue_cell_crops: list[NDArray] = []

        for r in range(rows):
            row: list[KakuroClueCell | KakuroEmptyCell] = []
            for c in range(cols):
                y1 = geom.h_lines[r]
                y2 = geom.h_lines[r + 1]
                x1 = geom.v_lines[c]
                x2 = geom.v_lines[c + 1]

                cell_h = y2 - y1
                cell_w = x2 - x1
                my = int(cell_h * margin_ratio)
                mx = int(cell_w * margin_ratio)

                roi = warped_gray[y1 + my : y2 - my, x1 + mx : x2 - mx]
                mean_val = np.mean(roi)

                if mean_val < BLACK_THRESHOLD:
                    # Dark cell = clue cell (may have numbers)
                    row.append(KakuroClueCell())  # placeholder
                    clue_cell_coords.append((r, c))
                    # Use the full cell (not margined) for number reading
                    clue_cell_crops.append(warped_gray[y1:y2, x1:x2])
                else:
                    row.append(KakuroEmptyCell())
            cells.append(row)

        # Use LLM to read numbers in clue cells
        if clue_cell_crops:
            inverted_crops = [cv2.bitwise_not(crop) for crop in clue_cell_crops]
            cols_per_row = min(10, len(inverted_crops))
            crop_grid: list[list[NDArray]] = []
            for i in range(0, len(inverted_crops), cols_per_row):
                batch = inverted_crops[i : i + cols_per_row]
                while len(batch) < cols_per_row:
                    batch.append(np.ones_like(inverted_crops[0]) * 255)
                crop_grid.append(batch)

            raw = self._recognizer.recognize(crop_grid, DUAL_INT_CELL_PROMPT)
            flat_results: list[dict] = []
            for grid_row in raw:
                flat_results.extend(grid_row)

            for i, (r, c) in enumerate(clue_cell_coords):
                if i >= len(flat_results):
                    break
                result = flat_results[i]
                if isinstance(result, dict):
                    top_right = result.get("top_right", 0)
                    bottom_left = result.get("bottom_left", 0)
                    right_val = top_right if isinstance(top_right, int) and top_right > 0 else None
                    down_val = bottom_left if isinstance(bottom_left, int) and bottom_left > 0 else None
                    cells[r][c] = KakuroClueCell(right=right_val, down=down_val)

        return cells

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = KakuroBoard(**data.grid)
            rows = len(board.cells)
            if rows < 2:
                return False
            cols = len(board.cells[0])
            if cols < 2:
                return False
            for row in board.cells:
                if len(row) != cols:
                    return False
                for cell in row:
                    if cell.type == "clue":
                        if cell.right is not None and not (1 <= cell.right <= 45):
                            return False
                        if cell.down is not None and not (1 <= cell.down <= 45):
                            return False
                    elif cell.type != "empty":
                        return False
            return True
        except Exception:
            return False

    def to_json(self, board: KakuroBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
