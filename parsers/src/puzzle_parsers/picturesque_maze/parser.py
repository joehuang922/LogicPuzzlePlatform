"""Picturesque Maze (浮き出しメイロ) parser: walls on an unprinted lattice, no OCR.

See ``grid_detector`` for the detection design and measured results.
"""
from __future__ import annotations

import json
from collections import deque
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.picturesque_maze.grid_detector import detect_maze
from puzzle_parsers.picturesque_maze.models import MazeOpening, MazeWalls, PicturesqueMazeBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class PicturesqueMazeParser(PuzzleParser):
    puzzle_type = "picturesque-maze"
    locates_board = True

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        # No OCR needed (no numbers); the backend is accepted for a uniform signature.
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> PicturesqueMazeBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> PicturesqueMazeBoard:
        geom = detect_maze(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.quad)
        if len(geom.openings) < 2:
            raise ValueError("Could not find the maze's entrance and exit")
        (s_side, s_idx), (e_side, e_idx) = geom.openings[0], geom.openings[-1]
        board = PicturesqueMazeBoard(
            width=geom.cols,
            height=geom.rows,
            walls=MazeWalls(h=geom.walls_h, v=geom.walls_v),
            entrance=MazeOpening(side=s_side, index=s_idx),
            exit=MazeOpening(side=e_side, index=e_idx),
        )
        loops, unreachable = maze_imperfections(board)
        if loops or unreachable:
            # Legal, but on these publishers a misread wall: the review flags it.
            print(f"  [picturesque-maze] not a perfect maze: {loops} loops, {unreachable} unreachable cells")
        return board

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = PicturesqueMazeBoard(**data.grid)
        except Exception:
            return False
        w, h = board.width, board.height
        if w < 2 or h < 2:
            return False
        if len(board.walls.h) != h - 1 or any(len(row) != w for row in board.walls.h):
            return False
        if len(board.walls.v) != h or any(len(row) != w - 1 for row in board.walls.v):
            return False
        for o in (board.entrance, board.exit):
            limit = w if o.side in ("top", "bottom") else h
            if not 0 <= o.index < limit:
                return False
        if (board.entrance.side, board.entrance.index) == (board.exit.side, board.exit.index):
            return False
        return route_length(board) is not None

    def to_json(self, board: PicturesqueMazeBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")


def _opening_cell(o: MazeOpening, w: int, h: int) -> tuple[int, int]:
    return {"top": (0, o.index), "bottom": (h - 1, o.index), "left": (o.index, 0), "right": (o.index, w - 1)}[o.side]


def _neighbours(board: PicturesqueMazeBoard, r: int, c: int):
    wh, wv = board.walls.h, board.walls.v
    if r > 0 and not wh[r - 1][c]:
        yield r - 1, c
    if r < board.height - 1 and not wh[r][c]:
        yield r + 1, c
    if c > 0 and not wv[r][c - 1]:
        yield r, c - 1
    if c < board.width - 1 and not wv[r][c]:
        yield r, c + 1


def route_length(board: PicturesqueMazeBoard) -> int | None:
    """Cells on the shortest entrance-to-exit route, or None when there is none."""
    start = _opening_cell(board.entrance, board.width, board.height)
    goal = _opening_cell(board.exit, board.width, board.height)
    dist = {start: 1}
    queue = deque([start])
    while queue:
        cell = queue.popleft()
        if cell == goal:
            return dist[cell]
        for nb in _neighbours(board, *cell):
            if nb not in dist:
                dist[nb] = dist[cell] + 1
                queue.append(nb)
    return None


def maze_imperfections(board: PicturesqueMazeBoard) -> tuple[int, int]:
    """(independent loops, cells unreachable from the entrance); (0, 0) is a perfect maze."""
    w, h = board.width, board.height
    start = _opening_cell(board.entrance, w, h)
    seen = {start}
    queue = deque([start])
    while queue:
        for nb in _neighbours(board, *queue.popleft()):
            if nb not in seen:
                seen.add(nb)
                queue.append(nb)
    open_edges = sum(1 for row in board.walls.h for x in row if not x) + sum(1 for row in board.walls.v for x in row if not x)
    # Components: the entrance's, plus each unreachable region.
    comps = 0
    visited: set[tuple[int, int]] = set()
    for r in range(h):
        for c in range(w):
            if (r, c) in visited:
                continue
            comps += 1
            stack = [(r, c)]
            visited.add((r, c))
            while stack:
                for nb in _neighbours(board, *stack.pop()):
                    if nb not in visited:
                        visited.add(nb)
                        stack.append(nb)
    return open_edges - w * h + comps, w * h - len(seen)
