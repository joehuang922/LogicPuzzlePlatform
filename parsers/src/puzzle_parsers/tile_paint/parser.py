"""Tile Paint parser: clue cells by their diagonal, walls by the shared thickness
classifier, clue numbers by the shared cell classifier (two per cell, like Kakuro).

See ``grid_detector`` for how clue cells and number crops are found.
"""
from __future__ import annotations

import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser, timed
from puzzle_parsers.cell_classify import DualInteger, DualIntegerTarget, classify_cells
from puzzle_parsers.debug_overlay import save_cell_labels
from puzzle_parsers.grid_utils import classify_border_thickness
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.tile_paint.grid_detector import clue_crop, detect_tile_paint, find_clue_cells, half_ink
from puzzle_parsers.tile_paint.models import TilePaintBoard, TilePaintClue, TilePaintGrids


def normalize_clue_walls(
    clue: list[list[bool]], h: list[list[int]], v: list[list[int]]
) -> tuple[list[list[int]], list[list[int]]]:
    """1 between a clue cell and a tile cell, 0 between two clue cells, else as read."""
    rows, cols = len(clue), len(clue[0])
    h2 = [
        [h[r][c] if not clue[r][c] and not clue[r + 1][c] else int(clue[r][c] != clue[r + 1][c]) for c in range(cols)]
        for r in range(rows - 1)
    ]
    v2 = [
        [v[r][c] if not clue[r][c] and not clue[r][c + 1] else int(clue[r][c] != clue[r][c + 1]) for c in range(cols - 1)]
        for r in range(rows)
    ]
    return h2, v2


class TilePaintParser(PuzzleParser):
    puzzle_type = "tile-paint"
    locates_board = True

    def __init__(self, recognizer: CellRecognizer | None = None, **kwargs) -> None:
        self._recognizer = recognizer or GeminiRecognizer(**kwargs)

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> TilePaintBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> TilePaintBoard:
        with timed("tile paint grid detect"):
            geom = detect_tile_paint(img_array, debug_dir=debug_dir)
        grid = geom.grid
        if grid.quad is not None:
            self._board_located(img_array, grid.quad)

        clue = find_clue_cells(geom.gray, grid)
        h_walls, v_walls = classify_border_thickness(geom.gray, grid, debug_dir=debug_dir)
        h_walls, v_walls = normalize_clue_walls(clue, h_walls, v_walls)

        cells: list[list[TilePaintClue | None]] = [
            [TilePaintClue() if clue[r][c] else None for c in range(grid.cols)] for r in range(grid.rows)
        ]
        with timed("tile paint clue read"):
            self._read_numbers(geom.gray, grid, clue, cells)
        self._drop_runless(cells)

        if debug_dir:
            save_cell_labels(
                grid,
                [
                    [
                        None if cell is None else f"{'' if cell.down is None else cell.down}\\{'' if cell.right is None else cell.right}"
                        for cell in row
                    ]
                    for row in cells
                ],
                Path(debug_dir) / "03_clues.png",
            )
        return TilePaintBoard(cells=cells, grids=TilePaintGrids(h=h_walls, v=v_walls))

    def _read_numbers(self, gray, grid, clue: list[list[bool]], cells: list[list[TilePaintClue | None]]) -> None:
        """Both numbers of every clue cell; a half without ink has none (the classifier
        reports it as 0, like a printed 0). Tile cells are blanked so it skips them."""
        spots = [(r, c) for r in range(grid.rows) for c in range(grid.cols) if clue[r][c]]
        inked = {(r, c): half_ink(gray, grid, r, c) for r, c in spots}
        spots = [rc for rc in spots if any(inked[rc])]
        if not spots:
            return
        crops = {rc: clue_crop(gray, grid, *rc) for rc in spots}
        blank = np.full_like(next(iter(crops.values())), 255)
        grid_crops = [[crops.get((r, c), blank) for c in range(grid.cols)] for r in range(grid.rows)]
        read = classify_cells(self._recognizer, grid_crops, [DualIntegerTarget()])
        for r, c in spots:
            cls = read[r][c]
            if not isinstance(cls, DualInteger):
                continue
            has_right, has_down = inked[(r, c)]
            cells[r][c].right = cls.top_right if has_right else None
            cells[r][c].down = cls.bottom_left if has_down else None

    @staticmethod
    def _drop_runless(cells: list[list[TilePaintClue | None]]) -> None:
        """A number can't count an empty run: one read there is noise (e.g. edge bleed)."""
        rows, cols = len(cells), len(cells[0])
        for r in range(rows):
            for c in range(cols):
                cell = cells[r][c]
                if cell is None:
                    continue
                if cell.right is not None and (c + 1 >= cols or cells[r][c + 1] is not None):
                    cell.right = None
                if cell.down is not None and (r + 1 >= rows or cells[r + 1][c] is not None):
                    cell.down = None

    def validate(self, data: PuzzleData) -> bool:
        """Shape, walls that close off tiles, and clue numbers within their runs."""
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = TilePaintBoard(**data.grid)
            cells = board.cells
            rows = len(cells)
            cols = len(cells[0]) if rows else 0
            if rows < 2 or cols < 2 or any(len(row) != cols for row in cells):
                return False
            h, v = board.grids.h, board.grids.v
            if len(h) != rows - 1 or any(len(row) != cols or any(x not in (0, 1) for x in row) for row in h):
                return False
            if len(v) != rows or any(len(row) != cols - 1 or any(x not in (0, 1) for x in row) for row in v):
                return False

            def tile(r: int, c: int) -> bool:
                return 0 <= r < rows and 0 <= c < cols and cells[r][c] is None

            # Tiles: flood tile cells across open edges.
            ids = [[-1] * cols for _ in range(rows)]
            n = 0
            for sr in range(rows):
                for sc in range(cols):
                    if not tile(sr, sc) or ids[sr][sc] >= 0:
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
                            if open_ and tile(nr, nc) and ids[nr][nc] < 0:
                                ids[nr][nc] = n
                                stack.append((nr, nc))
                    n += 1
            if n == 0:
                return False
            any_number = False
            for r in range(rows):
                for c in range(cols):
                    if tile(r, c) and tile(r + 1, c) and h[r][c] == 1 and ids[r][c] == ids[r + 1][c]:
                        return False
                    if tile(r, c) and tile(r, c + 1) and v[r][c] == 1 and ids[r][c] == ids[r][c + 1]:
                        return False
                    cell = cells[r][c]
                    if cell is None:
                        continue
                    for value, dr, dc in ((cell.right, 0, 1), (cell.down, 1, 0)):
                        if value is None:
                            continue
                        any_number = True
                        run = 0
                        rr, cc = r + dr, c + dc
                        while tile(rr, cc):
                            run += 1
                            rr, cc = rr + dr, cc + dc
                        if run == 0 or not 0 <= value <= run:
                            return False
            return any_number
        except Exception:
            return False

    def to_json(self, board: TilePaintBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
