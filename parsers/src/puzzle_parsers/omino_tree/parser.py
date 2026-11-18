"""Omino Tree parser: numbers by the shared EasyOCR reader, arrows by shape.

See ``grid_detector`` for how the gray halftone arrows are found and pointed, and
how they are whitened out of the image the OCR reads (some overlap digits).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser, timed
from puzzle_parsers.cell_ocr import read_grid_clues
from puzzle_parsers.debug_overlay import save_cell_labels
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.omino_tree.grid_detector import detect_omino_tree
from puzzle_parsers.omino_tree.models import OminoTreeArrow, OminoTreeBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend

_STEP = {"up": (-1, 0), "down": (1, 0), "left": (0, -1), "right": (0, 1)}


class OminoTreeParser(PuzzleParser):
    puzzle_type = "omino-tree"
    locates_board = True

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> OminoTreeBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> OminoTreeBoard:
        with timed("omino tree grid detect"):
            geom = detect_omino_tree(img_array, debug_dir=debug_dir)
        grid = geom.grid
        if grid.quad is not None:
            self._board_located(img_array, grid.quad)
        numbers = read_grid_clues(
            self._ocr, geom.ocr_gray, grid.h_lines, grid.v_lines, allow_multi_digits=True
        )
        if debug_dir:
            save_cell_labels(
                grid, [[str(v) if v > 0 else None for v in row] for row in numbers],
                Path(debug_dir) / "03_numbers.png",
            )
        return OminoTreeBoard(
            rows=grid.rows,
            cols=grid.cols,
            numbers=numbers,
            arrows=[OminoTreeArrow(r=r, c=c, dir=d) for r, c, d in geom.arrows],
        )

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = OminoTreeBoard(**data.grid)
            if board.rows < 2 or board.cols < 2:
                return False
            if len(board.numbers) != board.rows or any(
                len(row) != board.cols or any(v < 0 for v in row) for row in board.numbers
            ):
                return False
            edges = set()
            for a in board.arrows:
                dr, dc = _STEP[a.dir]
                r2, c2 = a.r + dr, a.c + dc
                if not (0 <= a.r < board.rows and 0 <= a.c < board.cols and 0 <= r2 < board.rows and 0 <= c2 < board.cols):
                    return False
                edge = (min(a.r, r2), min(a.c, c2), dr == 0)
                if edge in edges:
                    return False
                edges.add(edge)
            return True
        except Exception:
            return False

    def to_json(self, board: OminoTreeBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
