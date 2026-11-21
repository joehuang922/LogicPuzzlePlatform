"""Country Road parser: walls by the shared thickness classifier, room numbers by the
shared EasyOCR clue reader. A room keeps one number (its top-left read)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser, timed
from puzzle_parsers.cell_ocr import read_grid_clues
from puzzle_parsers.country_road.grid_detector import detect_country_road
from puzzle_parsers.country_road.models import CountryRoadBoard, CountryRoadGrids
from puzzle_parsers.debug_overlay import save_cell_labels
from puzzle_parsers.grid_utils import classify_border_thickness
from puzzle_parsers.models import PuzzleData

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


def room_ids(rows: int, cols: int, h: list[list[int]], v: list[list[int]]) -> list[list[int]]:
    """Room id per cell: cells joined across edges without a wall."""
    ids = [[-1] * cols for _ in range(rows)]
    n = 0
    for sr in range(rows):
        for sc in range(cols):
            if ids[sr][sc] >= 0:
                continue
            ids[sr][sc] = n
            stack = [(sr, sc)]
            while stack:
                r, c = stack.pop()
                for nr, nc, open_ in (
                    (r - 1, c, r > 0 and h[r - 1][c] == 0),
                    (r + 1, c, r < rows - 1 and h[r][c] == 0),
                    (r, c - 1, c > 0 and v[r][c - 1] == 0),
                    (r, c + 1, c < cols - 1 and v[r][c] == 0),
                ):
                    if open_ and ids[nr][nc] < 0:
                        ids[nr][nc] = n
                        stack.append((nr, nc))
            n += 1
    return ids


class CountryRoadParser(PuzzleParser):
    puzzle_type = "country-road"
    locates_board = True

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> CountryRoadBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> CountryRoadBoard:
        with timed("country road grid detect"):
            grid = detect_country_road(img_array, debug_dir=debug_dir)
        if grid.quad is not None:
            self._board_located(img_array, grid.quad)
        gray = cv2.cvtColor(grid.warped, cv2.COLOR_BGR2GRAY)
        h_walls, v_walls = classify_border_thickness(gray, grid, debug_dir=debug_dir)

        # Every room is visited, so a room number is at least 1: 0 isn't a clue.
        with timed("country road clue OCR"):
            reads = read_grid_clues(self._ocr, gray, grid.h_lines, grid.v_lines, allow_multi_digits=True)
        cells = [[max(0, v) for v in row] for row in reads]
        self._one_number_per_room(cells, h_walls, v_walls)

        if debug_dir:
            save_cell_labels(
                grid, [[str(v) if v > 0 else None for v in row] for row in cells], Path(debug_dir) / "03_numbers.png"
            )
        return CountryRoadBoard(cells=cells, grids=CountryRoadGrids(h=h_walls, v=v_walls))

    @staticmethod
    def _one_number_per_room(cells: list[list[int]], h: list[list[int]], v: list[list[int]]) -> None:
        """Keep the first number (row-major) of each room; a second read there is noise."""
        rows, cols = len(cells), len(cells[0])
        ids = room_ids(rows, cols, h, v)
        seen: set[int] = set()
        for r in range(rows):
            for c in range(cols):
                if cells[r][c] <= 0:
                    continue
                if ids[r][c] in seen:
                    cells[r][c] = 0
                else:
                    seen.add(ids[r][c])

    def validate(self, data: PuzzleData) -> bool:
        """Shape, walls that close off rooms, one number per room no bigger than it."""
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = CountryRoadBoard(**data.grid)
            cells = board.cells
            rows = len(cells)
            cols = len(cells[0]) if rows else 0
            if rows < 2 or cols < 2 or any(len(row) != cols or any(x < 0 for x in row) for row in cells):
                return False
            h, v = board.grids.h, board.grids.v
            if len(h) != rows - 1 or any(len(row) != cols or any(x not in (0, 1) for x in row) for row in h):
                return False
            if len(v) != rows or any(len(row) != cols - 1 or any(x not in (0, 1) for x in row) for row in v):
                return False
            ids = room_ids(rows, cols, h, v)
            for r in range(rows):
                for c in range(cols):
                    if r < rows - 1 and h[r][c] == 1 and ids[r][c] == ids[r + 1][c]:
                        return False
                    if c < cols - 1 and v[r][c] == 1 and ids[r][c] == ids[r][c + 1]:
                        return False
            size: dict[int, int] = {}
            for row in ids:
                for i in row:
                    size[i] = size.get(i, 0) + 1
            if len(size) < 2:
                return False
            numbered: set[int] = set()
            for r in range(rows):
                for c in range(cols):
                    n = cells[r][c]
                    if n == 0:
                        continue
                    if ids[r][c] in numbered or n > size[ids[r][c]]:
                        return False
                    numbered.add(ids[r][c])
            return True
        except Exception:
            return False

    def to_json(self, board: CountryRoadBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
