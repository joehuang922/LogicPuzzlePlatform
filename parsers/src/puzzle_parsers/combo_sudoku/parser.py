from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.combo_sudoku.grid_detector import (
    CROSS_LAYOUT,
    detect_grid_geometry,
    extract_cells_for_subboard,
    save_cell_debug,
)
from puzzle_parsers.combo_sudoku.models import ComboSudokuBoard, SubBoard
from puzzle_parsers.combo_sudoku.ocr import ClaudeOcrBackend, OcrBackend
from puzzle_parsers.models import PuzzleData


class ComboSudokuParser(PuzzleParser):
    puzzle_type = "combo_sudoku"

    def __init__(
        self,
        ocr_backend: OcrBackend | None = None,
        layout: list[tuple[int, int]] | None = None,
    ) -> None:
        self._ocr = ocr_backend
        self._layout = layout or CROSS_LAYOUT

    @property
    def ocr(self) -> OcrBackend:
        if self._ocr is None:
            self._ocr = ClaudeOcrBackend()
        return self._ocr

    def parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(
            puzzle_type=self.puzzle_type,
            grid=board.model_dump(),
        )

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> ComboSudokuBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, image_path=str(image_path), debug_dir=debug_dir)

    def _parse_image(
        self,
        img_array: np.ndarray,
        image_path: str | None = None,
        debug_dir: str | None = None,
    ) -> ComboSudokuBoard:
        if self.ocr.supports_full_image and image_path:
            return self._parse_via_full_image(image_path)
        return self._parse_via_grid_detection(img_array, debug_dir=debug_dir)

    def _parse_via_full_image(self, image_path: str) -> ComboSudokuBoard:
        num_subboards = len(self._layout)
        all_hints = self.ocr.recognize_full_image(image_path, num_subboards)

        subboards = []
        for i, hints in enumerate(all_hints):
            pos = self._layout[i] if i < len(self._layout) else (0, 0)
            subboards.append(SubBoard(x=pos[0], y=pos[1], hints=hints))
        return ComboSudokuBoard(room_width=3, room_height=3, subboards=subboards)

    def _parse_via_grid_detection(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> ComboSudokuBoard:
        geometry = detect_grid_geometry(img_array, self._layout, debug_dir=debug_dir)

        if debug_dir:
            save_cell_debug(debug_dir, geometry, self._layout)

        subboards: list[SubBoard] = []
        for room_x, room_y in self._layout:
            cells = extract_cells_for_subboard(geometry.warped, geometry, room_x, room_y)
            hints = self.ocr.recognize_cells(cells)
            subboards.append(SubBoard(x=room_x, y=room_y, hints=hints))

        return ComboSudokuBoard(room_width=3, room_height=3, subboards=subboards)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = ComboSudokuBoard(**data.grid)
            for sub in board.subboards:
                if len(sub.hints) != 9:
                    return False
                for row in sub.hints:
                    if len(row) != 9:
                        return False
                    if not all(0 <= v <= 9 for v in row):
                        return False
            return True
        except Exception:
            return False

    def to_json(self, board: ComboSudokuBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
