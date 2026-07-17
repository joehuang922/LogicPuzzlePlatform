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
        """Recognize cells using filtered non-empty montage strategy.

        Filters out empty cells using a pixel heuristic, sends only non-empty
        cells in a compact montage, then maps results back to the full grid.
        """
        import io as _io

        num_rows = len(cell_crops)
        num_cols = len(cell_crops[0])

        # Identify non-empty cells using central ROI pixel density
        non_empty: list[tuple[int, int, np.ndarray]] = []
        for r in range(num_rows):
            for c in range(num_cols):
                cell = cell_crops[r][c]
                h, w = cell.shape[:2]
                margin_y = int(h * 0.15)
                margin_x = int(w * 0.15)
                center = cell[margin_y:h - margin_y, margin_x:w - margin_x]
                nonwhite = np.sum(center < 200)
                if nonwhite / center.size > 0.02:
                    non_empty.append((r, c, cell))

        # Initialize grid with zeros (empty cells)
        grid = [[0] * num_cols for _ in range(num_rows)]

        if not non_empty:
            return grid

        # Build compact montage of only non-empty cells (10 columns)
        cols_per_row = 10
        num_cells = len(non_empty)
        num_montage_rows = (num_cells + cols_per_row - 1) // cols_per_row

        sample = non_empty[0][2]
        native_h, native_w = sample.shape[:2]
        tile_size = min(64, native_h, native_w)
        border = 2
        label_h = 14
        cell_w = tile_size + border * 2
        cell_h = tile_size + border * 2 + label_h

        canvas_h = num_montage_rows * cell_h
        canvas_w = cols_per_row * cell_w
        canvas = np.ones((canvas_h, canvas_w, 3), dtype=np.uint8) * 255

        for idx, (orig_r, orig_c, cell) in enumerate(non_empty):
            mr = idx // cols_per_row
            mc = idx % cols_per_row
            x0 = mc * cell_w
            y0 = mr * cell_h

            label = f"{orig_r},{orig_c}"
            (tw, _), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1)
            label_x = x0 + (cell_w - tw) // 2
            cv2.putText(
                canvas, label, (label_x, y0 + label_h - 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (200, 0, 0), 1,
            )

            bx0, by0 = x0, y0 + label_h
            bx1, by1 = x0 + cell_w - 1, y0 + cell_h - 1
            cv2.rectangle(canvas, (bx0, by0), (bx1, by1), (0, 0, 200), border)

            ch, cw = cell.shape[:2]
            if ch > tile_size or cw > tile_size:
                scale = min(tile_size / ch, tile_size / cw)
                resized = cv2.resize(cell, (int(cw * scale), int(ch * scale)))
            else:
                resized = cell
            if len(resized.shape) == 2:
                resized = cv2.cvtColor(resized, cv2.COLOR_GRAY2BGR)
            new_h, new_w = resized.shape[:2]
            dy = (tile_size - new_h) // 2
            dx = (tile_size - new_w) // 2
            py = by0 + border + dy
            px = bx0 + border + dx
            canvas[py:py + new_h, px:px + new_w] = resized

        montage_image = Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB))

        prompt = (
            "This image shows a montage of non-empty cells cropped from a Pencils puzzle grid. "
            "Each cell is enclosed in a red border. The coordinate label (row,col) above each red box "
            "indicates the position of the cell in the original grid. "
            "Cells are arranged sequentially left-to-right, top-to-bottom. "
            "Ignore any faint dashed lines or partial ink at cell edges — those are grid artifacts, not content. "
            "Focus only on the main content INSIDE each red box. Each cell contains one of: "
            "  - A positive integer (1, 2, 3, 4, 5, 6, 7, 8, 9, or larger) representing a number clue. "
            "  - A pencil head icon: a small filled triangular arrowhead pointing in one direction. "
            "    The head BELONGS TO the cell where the FLAT BASE of the triangle sits, NOT the cell the tip points toward. "
            "    Output -1 if the tip points UP, -2 if DOWN, -3 if LEFT, -4 if RIGHT. "
            "  - Empty (no meaningful content). Output 0 for empty cells. "
            f"There are {num_cells} non-empty cells. "
            f"Respond with ONLY a flat JSON array of {num_cells} integers, in the order shown (left-to-right, top-to-bottom). "
            "No explanation, just the JSON array."
        )

        recognizer = self.recognizer
        response = recognizer._model.generate_content([montage_image, prompt])
        result = parse_json_response(response.text)

        if not isinstance(result, list) or len(result) != num_cells:
            raise ValueError(
                f"Expected {num_cells} values, got {len(result) if isinstance(result, list) else type(result)}"
            )

        # Map results back to grid positions
        for idx, (r, c, _) in enumerate(non_empty):
            grid[r][c] = result[idx]

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
