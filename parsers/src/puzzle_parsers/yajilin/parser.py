from __future__ import annotations

from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.yajilin.grid_detector import YajilinGeometry, detect_yajilin_grid
from puzzle_parsers.yajilin.models import YajilinBoard, YajilinClue
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.recognition_schemas import DIRECTED_INT_CELL_PROMPT

EMPTY_THRESHOLD = 0.02


class YajilinParser(PuzzleParser):
    puzzle_type = "yajilin"

    def __init__(self, recognizer: CellRecognizer | None = None, **kwargs) -> None:
        self._recognizer = recognizer or GeminiRecognizer(**kwargs)

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self,
        image_path: str | Path,
        debug_dir: str | None = None,
    ) -> YajilinBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self,
        img_array: NDArray,
        debug_dir: str | None = None,
    ) -> YajilinBoard:
        geom = detect_yajilin_grid(img_array, debug_dir=debug_dir)

        debug_path = Path(debug_dir) if debug_dir else None
        rows = geom.rows
        cols = geom.cols

        # Extract cell crops and identify which cells have content
        cell_crops: list[list[NDArray]] = []
        content_mask: list[list[bool]] = []
        for r in range(rows):
            crop_row = []
            mask_row = []
            for c in range(cols):
                y1 = geom.h_lines[r]
                y2 = geom.h_lines[r + 1]
                x1 = geom.v_lines[c]
                x2 = geom.v_lines[c + 1]
                # Shrink slightly to avoid grid line artifacts
                margin_y = int((y2 - y1) * 0.1)
                margin_x = int((x2 - x1) * 0.1)
                cell = geom.warped_gray[y1 + margin_y:y2 - margin_y, x1 + margin_x:x2 - margin_x]
                _, binary = cv2.threshold(cell, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
                has_content = np.sum(binary > 0) / binary.size > EMPTY_THRESHOLD
                crop_row.append(cell)
                mask_row.append(has_content)
            cell_crops.append(crop_row)
            content_mask.append(mask_row)

        # Collect non-empty cells for LLM recognition
        clue_coords: list[tuple[int, int]] = []
        clue_crops: list[NDArray] = []
        for r in range(rows):
            for c in range(cols):
                if content_mask[r][c]:
                    clue_coords.append((r, c))
                    clue_crops.append(cell_crops[r][c])

        cells: list[list[Optional[YajilinClue]]] = [[None] * cols for _ in range(rows)]

        if clue_crops:
            # Assemble into grid for batch recognition
            cols_per_row = min(10, len(clue_crops))
            crop_grid: list[list[NDArray]] = []
            for i in range(0, len(clue_crops), cols_per_row):
                batch = clue_crops[i:i + cols_per_row]
                while len(batch) < cols_per_row:
                    batch.append(np.ones_like(clue_crops[0]) * 255)
                crop_grid.append(batch)

            raw = self._recognizer.recognize(crop_grid, DIRECTED_INT_CELL_PROMPT)
            flat_results: list[dict] = []
            for grid_row in raw:
                flat_results.extend(grid_row)

            for i, (r, c) in enumerate(clue_coords):
                if i >= len(flat_results):
                    break
                result = flat_results[i]
                if isinstance(result, dict):
                    value = result.get("value", 0)
                    direction = result.get("direction", "")
                    if isinstance(value, int) and direction in ("up", "down", "left", "right"):
                        cells[r][c] = YajilinClue(dir=direction, num=value)
                    elif isinstance(value, int) and value > 0:
                        # Has a number but direction not recognized — mark as clue anyway
                        cells[r][c] = YajilinClue(dir="right", num=value)

        if debug_path:
            vis = geom.warped.copy()
            for r in range(rows):
                for c in range(cols):
                    cx = (geom.v_lines[c] + geom.v_lines[c + 1]) // 2
                    cy = (geom.h_lines[r] + geom.h_lines[r + 1]) // 2
                    clue = cells[r][c]
                    if clue:
                        label = f"{clue.num}{clue.dir[0]}"
                        cv2.putText(
                            vis, label, (cx - 10, cy + 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 255), 1,
                        )
                    else:
                        cv2.putText(
                            vis, ".", (cx - 2, cy + 2),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.3, (0, 200, 0), 1,
                        )
            cv2.imwrite(str(debug_path / "03_classified.png"), vis)

        return YajilinBoard(cells=cells)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = YajilinBoard(**data.grid)
            for row in board.cells:
                for cell in row:
                    if cell is not None:
                        if cell.dir not in ("up", "down", "left", "right"):
                            return False
                        if cell.num < 0:
                            return False
            return True
        except Exception:
            return False
