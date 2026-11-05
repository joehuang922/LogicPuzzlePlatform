from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.base import PuzzleParser, timed
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.kakuro.grid_detector import (
    detect_kakuro_grid,
)
from puzzle_parsers.kakuro.models import KakuroBoard, KakuroClueCell, KakuroEmptyCell
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.cell_classify import DualInteger, DualIntegerTarget, classify_cells
from puzzle_parsers.cell_ocr import crop_cell

# A clue cell is grey-shaded (with a white diagonal and white clue discs), not
# black, so cell_fill.is_filled does not apply: only 13-31% of its pixels are
# black-dark. Mean brightness separates the two cleanly: shaded cells <= ~171,
# plain >= ~241 on every sample at full and Android size.
BLACK_THRESHOLD = 200


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
        with timed("kakuro grid detect"):
            geom = detect_kakuro_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        with timed("kakuro classify + recognize"):
            cells = self._classify_cells(warped_gray, geom, debug_dir=debug_dir)
        return KakuroBoard(cells=cells)

    def _classify_cells(
        self,
        warped_gray: NDArray,
        geom: BoardGrid,
        debug_dir: str | None = None,
    ) -> list[list[KakuroClueCell | KakuroEmptyCell]]:
        rows, cols = geom.rows, geom.cols
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

                mean_val = np.mean(crop_cell(warped_gray, y1, y2, x1, x2, margin=0.15))

                if mean_val < BLACK_THRESHOLD:
                    # Dark cell = clue cell (may have numbers)
                    row.append(KakuroClueCell())  # placeholder
                    clue_cell_coords.append((r, c))
                    # Use the full cell (not margined) for number reading
                    clue_cell_crops.append(crop_cell(warped_gray, y1, y2, x1, x2, margin=0))
                else:
                    row.append(KakuroEmptyCell())
            cells.append(row)

        # Read the clue numbers with the shared classifier. Crops are inverted
        # (white-on-grey clue -> dark-on-light) but NOT binarized: Otsu
        # destroys the faint, soft-focus strokes of multi-digit clues (18->1,
        # 29->2), and inversion turns dark edge-bleed from neighbouring cells
        # into white rather than readable strokes. Plain cells stay blank so
        # the classifier skips them.
        if clue_cell_crops:
            blank = np.full_like(clue_cell_crops[0], 255)
            crops = [[blank] * cols for _ in range(rows)]
            for (r, c), crop in zip(clue_cell_coords, clue_cell_crops):
                crops[r][c] = cv2.bitwise_not(crop)
            read = classify_cells(self._recognizer, crops, [DualIntegerTarget()])
            for r, c in clue_cell_coords:
                cls = read[r][c]
                if isinstance(cls, DualInteger):
                    cells[r][c] = KakuroClueCell(
                        right=cls.top_right or None, down=cls.bottom_left or None
                    )

        # Post-process: fix single-number clue cells using structural constraints.
        # A cell can only have right if there's an empty cell to its right,
        # and can only have down if there's an empty cell below it.
        for r in range(rows):
            for c in range(cols):
                cell = cells[r][c]
                if cell.type != "clue":
                    continue
                has_empty_right = (c + 1 < cols and cells[r][c + 1].type == "empty")
                has_empty_below = (r + 1 < rows and cells[r + 1][c].type == "empty")

                if cell.right is not None and cell.down is None:
                    # Single number claimed as right — verify
                    if not has_empty_right and has_empty_below:
                        cells[r][c] = KakuroClueCell(right=None, down=cell.right)
                elif cell.right is None and cell.down is not None:
                    # Single number claimed as down — verify
                    if not has_empty_below and has_empty_right:
                        cells[r][c] = KakuroClueCell(right=cell.down, down=None)

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
