from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.cell_ocr import read_grid_clues
from puzzle_parsers.grid_utils import classify_border_thickness, find_grid_lines, rectify_board
from puzzle_parsers.recognition import GeminiOcrBackend, OcrBackend
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.sudoku.models import SudokuBoard


# Largest board the solver takes: candidate sets are bit masks over digits 1..N.
MAX_SIZE = 30


def infer_rooms(size: int, h_walls: list[list[int]], v_walls: list[list[int]]) -> tuple[int, int]:
    """``(room_width, room_height)`` of an N x N board from its thick walls.

    Each interior grid line votes with the fraction of its segments read thick.
    Of the factorizations N = width x height (both 2+), keep the one whose
    room lines best match the votes: a stray thick read (a page fold near a
    line) costs one line's vote, not the whole board.
    """
    v_votes = [sum(row[c] for row in v_walls) / len(v_walls) for c in range(size - 1)]
    h_votes = [sum(h_walls[r]) / len(h_walls[r]) for r in range(size - 1)]

    def fit(votes: list[float], room: int) -> float:
        return sum(f if (k + 1) % room == 0 else 1 - f for k, f in enumerate(votes))

    pairs = [(w, size // w) for w in range(2, size // 2 + 1) if size % w == 0]
    if not pairs:
        raise ValueError(f"A {size}x{size} board can't be split into rooms")
    return max(pairs, key=lambda p: fit(v_votes, p[0]) + fit(h_votes, p[1]))


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
        # A 9x9 board leaves the room size out, so its canon is unchanged.
        grid = board.model_dump(exclude_defaults=True)
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

        # Boards are N x N: 9x9 with 3x3 rooms, or bigger (16x16 4x4 rooms, 25x25,
        # 30x30 with 6-wide, 5-tall rooms). Count the lines, then read the room
        # size off the thick walls.
        warped_gray = cv2.cvtColor(board.warped, cv2.COLOR_BGR2GRAY)
        h_lines, v_lines = find_grid_lines(warped_gray)
        rows, cols = len(h_lines) - 1, len(v_lines) - 1
        if rows != cols:
            raise ValueError(f"Sudoku board must be square; found {rows}x{cols} cells")
        size = rows
        if size > MAX_SIZE:
            raise ValueError(f"Found a {size}x{size} board; at most {MAX_SIZE}x{MAX_SIZE} is supported")
        grid = board.to_native(BoardGrid(warped=board.warped, h_lines=h_lines, v_lines=v_lines))
        native_gray = cv2.cvtColor(grid.warped, cv2.COLOR_BGR2GRAY)
        if size == 9:
            room_width, room_height = 3, 3
        else:
            h_walls, v_walls = classify_border_thickness(native_gray, grid)
            room_width, room_height = infer_rooms(size, h_walls, v_walls)

        if debug_path:
            vis = grid.warped.copy()
            gh, gw = vis.shape[:2]
            for y in grid.h_lines:
                cv2.line(vis, (0, y), (gw, y), (0, 180, 0), 1)
            for x in grid.v_lines:
                cv2.line(vis, (x, 0), (x, gh), (180, 0, 0), 1)
            cv2.imwrite(str(debug_path / "03_gridlines.png"), vis)

        # Clues are single digits only on a 9x9 board.
        hints = read_grid_clues(
            self.ocr, native_gray, grid.h_lines, grid.v_lines,
            allow_multi_digits=size > 9, max_value=size,
        )
        return SudokuBoard(room_width=room_width, room_height=room_height, hints=hints)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = SudokuBoard(**data.grid)
            size = board.room_width * board.room_height
            if size > MAX_SIZE or len(board.hints) != size:
                return False
            for row in board.hints:
                if len(row) != size:
                    return False
                if not all(0 <= v <= size for v in row):
                    return False
            return True
        except Exception:
            return False

