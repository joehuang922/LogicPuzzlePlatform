from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import GeminiRecognizer, CellRecognizer
from puzzle_parsers.llm_vision import cells_to_png_bytes, parse_json_response
from puzzle_parsers.pencils.grid_detector import detect_pencils_grid
from puzzle_parsers.pencils.models import PencilsBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


PENCILS_PROMPT = (
    "This image shows a montage of cells cropped from a 'Pencils' puzzle. "
    "Each cell is enclosed in a red border. The coordinate label (row,col) above each red box "
    "indicates the position of the cell directly below it. "
    "Ignore any faint dashed lines or partial ink at cell edges — those are grid artifacts, not content. "
    "Focus only on the main content INSIDE each red box. Each cell contains one of: "
    "  - A positive integer (1, 2, 3, 4, 5, 6, 7, 8, 9, or larger) representing a number clue. "
    "  - A pencil head icon: a small filled triangular arrowhead pointing in one direction. "
    "    The head BELONGS TO the cell where the FLAT BASE of the triangle sits, NOT the cell the tip points toward. "
    "    Output -1 if the tip points UP, -2 if DOWN, -3 if LEFT, -4 if RIGHT. "
    "  - Empty (no meaningful content). Output 0 for empty cells. "
    "Respond with ONLY a JSON array of arrays (rows of integers). "
    "Example for a 3x3: [[0,-4,3],[0,5,0],[0,0,-1]]. No explanation, just the JSON."
)


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
        """Recognize cells using montage with red borders."""
        import io as _io

        png_bytes = cells_to_png_bytes(cell_crops)
        montage_image = Image.open(_io.BytesIO(png_bytes))

        num_rows = len(cell_crops)
        num_cols = len(cell_crops[0])
        prompt = PENCILS_PROMPT + f"\n\nThe grid has {num_rows} rows and {num_cols} columns."

        # Access the underlying Gemini model directly
        recognizer = self.recognizer
        response = recognizer._model.generate_content([montage_image, prompt])
        result = parse_json_response(response.text)

        if not isinstance(result, list) or len(result) != num_rows:
            raise ValueError(
                f"Expected {num_rows} rows, got {len(result) if isinstance(result, list) else type(result)}"
            )
        for r, row in enumerate(result):
            if not isinstance(row, list) or len(row) != num_cols:
                raise ValueError(
                    f"Expected {num_cols} cols in row {r}, got {len(row) if isinstance(row, list) else type(row)}"
                )
        return result

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
