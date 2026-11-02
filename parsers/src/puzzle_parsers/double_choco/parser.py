from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.cell_ocr import crop_cell, read_cells
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.double_choco.grid_detector import detect_double_choco_grid
from puzzle_parsers.double_choco.models import DoubleChocoBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class DoubleChocoParser(PuzzleParser):
    puzzle_type = "double-choco"

    _COLOR_MARGIN = 0.2

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> DoubleChocoBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> DoubleChocoBoard:
        from pathlib import Path as _Path

        geom = detect_double_choco_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        rows = geom.rows
        cols = geom.cols
        h_lines = geom.h_lines
        v_lines = geom.v_lines

        debug_path = _Path(debug_dir) if debug_dir else None

        # First pass: for each cell compute the mean intensity over a tight crop
        # (for color classification) and collect the shared OCR crop.
        ocr_rois: list[list[np.ndarray]] = []
        cell_means: list[float] = []
        for r in range(rows):
            row_ocr: list[np.ndarray] = []
            for c in range(cols):
                y1 = h_lines[r]
                y2 = h_lines[r + 1]
                x1 = v_lines[c]
                x2 = v_lines[c + 1]

                margin_y = int((y2 - y1) * self._COLOR_MARGIN)
                margin_x = int((x2 - x1) * self._COLOR_MARGIN)
                color_roi = warped_gray[y1 + margin_y : y2 - margin_y, x1 + margin_x : x2 - margin_x]
                cell_means.append(float(np.mean(color_roi)))

                row_ocr.append(crop_cell(warped_gray, y1, y2, x1, x2))
            ocr_rois.append(row_ocr)

        # Adaptive color threshold using Otsu on cell mean intensities
        means_arr = np.array(cell_means)
        scaled = ((means_arr - means_arr.min()) / (means_arr.max() - means_arr.min() + 1e-6) * 255).astype(np.uint8)
        otsu_val, _ = cv2.threshold(scaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        color_threshold = means_arr.min() + (otsu_val / 255) * (means_arr.max() - means_arr.min())

        # Clues can exceed 9 ("11", "12", ...).
        numbers = read_cells(self._ocr, ocr_rois, allow_multi_digits=True)

        # Second pass: classify color and attach the clue
        cells: list[list[list[int]]] = []
        idx = 0
        for r in range(rows):
            row: list[list[int]] = []
            for c in range(cols):
                color = 1 if cell_means[idx] < color_threshold else 0
                number = numbers[r][c]
                row.append([color, number])
                idx += 1
            cells.append(row)

        if debug_path:
            vis = geom.warped.copy()
            for r in range(rows):
                for c in range(cols):
                    color, num = cells[r][c]
                    y1 = h_lines[r]
                    x1 = v_lines[c]
                    label = f"{'G' if color == 1 else 'W'}{num if num > 0 else ''}"
                    cv2.putText(vis, label, (x1 + 5, y1 + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)
            cv2.imwrite(str(debug_path / "04_cells.png"), vis)

        return DoubleChocoBoard(cells=cells)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = DoubleChocoBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows > 0 else 0
            if rows < 2 or cols < 2:
                return False
            for row in board.cells:
                if len(row) != cols:
                    return False
                for cell in row:
                    if len(cell) != 2:
                        return False
                    if cell[0] not in (0, 1):
                        return False
                    if cell[1] < 0:
                        return False
            return True
        except Exception:
            return False

    def to_json(self, board: DoubleChocoBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
