from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.cell_ocr import read_grid_clues
from puzzle_parsers.grid_utils import find_grid_lines, rectify_board
from puzzle_parsers.recognition import GeminiOcrBackend, OcrBackend
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.sudoku.models import SudokuBoard


class SudokuParser(PuzzleParser):
    puzzle_type = "sudoku"

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    @property
    def ocr(self) -> OcrBackend:
        if self._ocr is None:
            self._ocr = GeminiOcrBackend()
        return self._ocr

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> SudokuBoard:
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
    ) -> SudokuBoard:
        if self.ocr.supports_full_image and image_path:
            return self._parse_via_full_image(image_path)
        return self._parse_via_grid_detection(img_array, debug_dir=debug_dir)

    def _parse_via_full_image(self, image_path: str) -> SudokuBoard:
        all_hints = self.ocr.recognize_full_image(image_path, num_subboards=1)
        return SudokuBoard(hints=all_hints[0])

    def _parse_via_grid_detection(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> SudokuBoard:
        debug_path = Path(debug_dir) if debug_dir else None
        if debug_path:
            debug_path.mkdir(parents=True, exist_ok=True)

        board = rectify_board(img_array)
        if debug_path:
            vis = img_array.copy()
            cv2.polylines(vis, [board.quad.astype(int)], True, (0, 255, 0), 3)
            cv2.imwrite(str(debug_path / "01_border.png"), vis)
            cv2.imwrite(str(debug_path / "02_warped.png"), board.warped)

        warped_gray = cv2.cvtColor(board.warped, cv2.COLOR_BGR2GRAY)
        h_lines, v_lines = find_grid_lines(warped_gray, size=(9, 9))
        grid = board.to_native(BoardGrid(warped=board.warped, h_lines=h_lines, v_lines=v_lines))

        if debug_path:
            vis = grid.warped.copy()
            gh, gw = vis.shape[:2]
            for y in grid.h_lines:
                cv2.line(vis, (0, y), (gw, y), (0, 180, 0), 1)
            for x in grid.v_lines:
                cv2.line(vis, (x, 0), (x, gh), (180, 0, 0), 1)
            cv2.imwrite(str(debug_path / "03_gridlines.png"), vis)

        native_gray = cv2.cvtColor(grid.warped, cv2.COLOR_BGR2GRAY)
        hints = read_grid_clues(
            self.ocr, native_gray, grid.h_lines, grid.v_lines, allow_multi_digits=False,
        )
        return SudokuBoard(hints=hints)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = SudokuBoard(**data.grid)
            if len(board.hints) != 9:
                return False
            for row in board.hints:
                if len(row) != 9:
                    return False
                if not all(0 <= v <= 9 for v in row):
                    return False
            return True
        except Exception:
            return False

