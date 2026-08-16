from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import GeminiRecognizer, CellRecognizer
from puzzle_parsers.recognition_schemas import PENCILS_CLUE_PROMPT
from puzzle_parsers.pencils.grid_detector import detect_pencils_grid
from puzzle_parsers.pencils.models import PencilsBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class PencilsParser(PuzzleParser):
    puzzle_type = "pencils"

    def __init__(
        self,
        ocr_backend: OcrBackend | None = None,
        recognizer: CellRecognizer | None = None,
    ) -> None:
        self._ocr = ocr_backend
        self._recognizer = recognizer

    @property
    def recognizer(self) -> CellRecognizer:
        if self._recognizer is None:
            self._recognizer = GeminiRecognizer()
        return self._recognizer

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self,
        image_path: str | Path,
        expected_rows: int | None = None,
        expected_cols: int | None = None,
        debug_dir: str | None = None,
    ) -> PencilsBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(
            img_array,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
            debug_dir=debug_dir,
        )

    def _parse_image(
        self,
        img_array: np.ndarray,
        expected_rows: int | None = None,
        expected_cols: int | None = None,
        debug_dir: str | None = None,
    ) -> PencilsBoard:
        geom = detect_pencils_grid(
            img_array,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
            debug_dir=debug_dir,
        )

        debug_path = Path(debug_dir) if debug_dir else None
        rows = geom.rows
        cols = geom.cols

        # Extract cell crops for batch LLM recognition (full cell, no margin reduction)
        cell_crops: list[list[np.ndarray]] = []
        for r in range(rows):
            row_crops: list[np.ndarray] = []
            for c in range(cols):
                x1 = geom.v_lines[c]
                x2 = geom.v_lines[c + 1]
                y1 = geom.h_lines[r]
                y2 = geom.h_lines[r + 1]
                cell_roi = geom.warped_gray[y1:y2, x1:x2]
                row_crops.append(cell_roi)
            cell_crops.append(row_crops)

        # Recognize all cells via LLM using custom montage with red borders
        cells = self._recognize_with_montage(cell_crops)

        if debug_path:
            vis = geom.warped.copy()
            for r in range(rows):
                for c in range(cols):
                    val = cells[r][c]
                    if val == 0:
                        label = "."
                    elif val > 0:
                        label = str(val)
                    else:
                        label = {-1: "^", -2: "v", -3: "<", -4: ">"}[val]
                    cx = (geom.v_lines[c] + geom.v_lines[c + 1]) // 2
                    cy = (geom.h_lines[r] + geom.h_lines[r + 1]) // 2
                    cv2.putText(
                        vis, label, (cx - 5, cy + 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1,
                    )
            cv2.imwrite(str(debug_path / "04_classified.png"), vis)

        return PencilsBoard(cells=cells)

    def _recognize_with_montage(self, cell_crops: list[list[np.ndarray]]) -> list[list[int]]:
        """Recognize cells using the shared filtered-montage strategy.

        Filters out empty cells using a pixel heuristic, packs the non-empty
        crops into a compact rectangular montage, and delegates to the shared
        ``recognizer.recognize`` path (row-batched, per-row length-validated).
        Results are mapped back to the full grid by coordinate. This mirrors the
        shikaku/heyawake parsers and avoids the fragility of asking the model to
        emit one exact-length flat array for hundreds of tiles at once.
        """
        num_rows = len(cell_crops)
        num_cols = len(cell_crops[0])

        # Identify non-empty cells using central ROI pixel density.
        non_empty_coords: list[tuple[int, int]] = []
        non_empty_crops: list[np.ndarray] = []
        for r in range(num_rows):
            for c in range(num_cols):
                cell = cell_crops[r][c]
                h, w = cell.shape[:2]
                margin_y = int(h * 0.15)
                margin_x = int(w * 0.15)
                center = cell[margin_y:h - margin_y, margin_x:w - margin_x]
                if center.size == 0:
                    continue
                nonwhite = np.sum(center < 200)
                if nonwhite / center.size > 0.02:
                    non_empty_coords.append((r, c))
                    non_empty_crops.append(cell)

        # Initialize grid with zeros (empty cells).
        grid = [[0] * num_cols for _ in range(num_rows)]

        if not non_empty_crops:
            return grid

        # Pack candidate crops into a compact grid montage (~10 columns). The
        # last row is padded to a full rectangle by repeating a real crop (never
        # a blank tile): PENCILS_CLUE_PROMPT tells the model every cell has
        # content, so padding with blanks would make the model return a short
        # final row and fail recognize()'s rectangularity check. The extra
        # recognized values map past non_empty_coords and are ignored below.
        cols_per_row = min(10, len(non_empty_crops))
        crop_grid: list[list[np.ndarray]] = []
        for i in range(0, len(non_empty_crops), cols_per_row):
            row_crops = non_empty_crops[i : i + cols_per_row]
            while len(row_crops) < cols_per_row:
                row_crops.append(non_empty_crops[0])
            crop_grid.append(row_crops)

        raw = self.recognizer.recognize(crop_grid, PENCILS_CLUE_PROMPT)
        flat: list[int] = []
        for row in raw:
            flat.extend(row)

        for i, (r, c) in enumerate(non_empty_coords):
            if i >= len(flat):
                break
            val = flat[i]
            if isinstance(val, int) and val >= -4 and val != 0:
                grid[r][c] = val

        return grid

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = PencilsBoard(**data.grid)
            for row in board.cells:
                if not all(v >= -4 for v in row):
                    return False
            return True
        except Exception:
            return False
