from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.akari.grid_detector import (
    AkariGeometry,
    detect_akari_grid,
)
from puzzle_parsers.akari.models import AkariBoard
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.recognition_schemas import INT_CELL_PROMPT

# A wall cell is mostly dark. We classify by the *fraction* of dark pixels
# rather than the mean intensity: numbered walls print the digit white-on-black,
# so their mean brightness is pulled up past a mean-based threshold and they
# would be misread as empty. The dark fraction stays high for both plain walls
# (~1.0) and numbered walls (~0.5), while empty cells are ~0.0.
DARK_PIXEL_VALUE = 100
WALL_DARK_FRACTION = 0.35
# A numbered wall's white digit keeps its dark fraction around 0.72-0.77, while
# a plain wall is near-solid (~1.0). Above this cutoff there is no real digit,
# so any LLM-reported number is vetoed as a hallucination.
DIGIT_MAX_DARK_FRACTION = 0.9


class AkariParser(PuzzleParser):
    puzzle_type = "akari"

    def __init__(self, recognizer: CellRecognizer | None = None, **kwargs) -> None:
        self._recognizer = recognizer or GeminiRecognizer(**kwargs)

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> AkariBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> AkariBoard:
        geom = detect_akari_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        cells = self._classify_cells(warped_gray, geom, debug_dir=debug_dir)
        return AkariBoard(cells=cells)

    def _classify_cells(
        self,
        warped_gray: NDArray,
        geom: AkariGeometry,
        debug_dir: str | None = None,
    ) -> list[list[int]]:
        rows, cols = geom.rows, geom.cols
        margin_ratio = 0.2

        cells: list[list[int]] = []
        black_cell_coords: list[tuple[int, int]] = []
        black_cell_crops: list[NDArray] = []
        black_cell_dark_fractions: list[float] = []

        for r in range(rows):
            row: list[int] = []
            for c in range(cols):
                y1 = geom.h_lines[r]
                y2 = geom.h_lines[r + 1]
                x1 = geom.v_lines[c]
                x2 = geom.v_lines[c + 1]

                cell_h = y2 - y1
                cell_w = x2 - x1
                my = int(cell_h * margin_ratio)
                mx = int(cell_w * margin_ratio)

                roi = warped_gray[y1 + my: y2 - my, x1 + mx: x2 - mx]
                dark_fraction = float(np.mean(roi < DARK_PIXEL_VALUE))

                if dark_fraction > WALL_DARK_FRACTION:
                    # Black cell (wall) — need to determine if numbered
                    row.append(5)  # placeholder, will be updated
                    black_cell_coords.append((r, c))
                    black_cell_crops.append(roi)
                    black_cell_dark_fractions.append(dark_fraction)
                else:
                    row.append(-1)  # white/empty
            cells.append(row)

        # Use LLM to classify black cells (numbered vs plain). Numbers on Akari
        # walls are printed white-on-black, so invert the crops first so the
        # digits appear dark on a light background.
        if black_cell_crops:
            inverted_crops = [cv2.bitwise_not(crop) for crop in black_cell_crops]
            # Arrange into a grid with ~10 columns for better LLM interpretation
            cols_per_row = min(10, len(inverted_crops))
            crop_grid: list[list[NDArray]] = []
            for i in range(0, len(inverted_crops), cols_per_row):
                row = inverted_crops[i:i + cols_per_row]
                # Pad last row if needed
                while len(row) < cols_per_row:
                    row.append(np.ones_like(inverted_crops[0]) * 255)
                crop_grid.append(row)

            raw = self._recognizer.recognize(crop_grid, INT_CELL_PROMPT)
            # Flatten the results back
            flat_results: list[int] = []
            for row in raw:
                flat_results.extend(row)

            for i, (r, c) in enumerate(black_cell_coords):
                if i >= len(flat_results):
                    break
                val = flat_results[i]
                # A genuine white-on-black digit occupies a meaningful chunk of
                # the cell, so a numbered wall's dark fraction sits well below a
                # solid wall's (~0.75 vs ~1.0). If the LLM reports a digit but the
                # crop is near-solid black, it's a hallucination — treat as plain.
                if 0 <= val <= 4 and black_cell_dark_fractions[i] < DIGIT_MAX_DARK_FRACTION:
                    cells[r][c] = val
                else:
                    cells[r][c] = 5  # black with no number

        return cells

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = AkariBoard(**data.grid)
            rows = len(board.cells)
            if rows < 1:
                return False
            cols = len(board.cells[0])
            if cols < 1:
                return False
            for row in board.cells:
                if len(row) != cols:
                    return False
                if not all(-1 <= v <= 5 for v in row):
                    return False
            return True
        except Exception:
            return False

    def to_json(self, board: AkariBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
