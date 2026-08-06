from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.cell_classify import (
    CircledInteger,
    CircledIntegerTarget,
    Symbol,
    SymbolTarget,
    classify_cells,
)
from puzzle_parsers.hell_golf.grid_detector import (
    HellGolfGeometry,
    detect_hell_golf_grid,
)
from puzzle_parsers.hell_golf.models import HellGolfBall, HellGolfBoard
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer

# A lake cell is filled with mid-gray: darker than paper-white, lighter than
# the near-black of ink/borders. We test the mean intensity of the cell centre.
LAKE_GRAY_LOW = 120
LAKE_GRAY_HIGH = 210

# Symbol code used by the goal (H) target.
GOAL_CODE = 1


class HellGolfParser(PuzzleParser):
    puzzle_type = "hell_golf"

    def __init__(self, ocr_backend=None, recognizer: CellRecognizer | None = None, **kwargs) -> None:
        # ocr_backend is accepted for a uniform constructor signature with the
        # other parsers; hell-golf uses the vision recognizer for classification.
        self._recognizer = recognizer or GeminiRecognizer(**kwargs)

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> HellGolfBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> HellGolfBoard:
        geom = detect_hell_golf_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        lakes = self._detect_lakes(warped_gray, geom)
        balls, goals = self._classify_features(
            warped_gray, geom, lakes, debug_dir=debug_dir
        )

        return HellGolfBoard(lakes=lakes, balls=balls, goals=goals)

    def _cell_bounds(self, geom: HellGolfGeometry, r: int, c: int):
        y1 = geom.h_lines[r]
        y2 = geom.h_lines[r + 1]
        x1 = geom.v_lines[c]
        x2 = geom.v_lines[c + 1]
        return y1, y2, x1, x2

    def _detect_lakes(
        self, warped_gray: NDArray, geom: HellGolfGeometry
    ) -> list[list[int]]:
        """A cell is a lake when its centre is predominantly mid-gray."""
        rows, cols = geom.rows, geom.cols
        margin_ratio = 0.25
        lakes: list[list[int]] = []
        for r in range(rows):
            row: list[int] = []
            for c in range(cols):
                y1, y2, x1, x2 = self._cell_bounds(geom, r, c)
                my = int((y2 - y1) * margin_ratio)
                mx = int((x2 - x1) * margin_ratio)
                roi = warped_gray[y1 + my: y2 - my, x1 + mx: x2 - mx]
                # Fraction of pixels within the mid-gray band. Ink strokes and
                # paper are excluded, so a cell with a printed glyph on white
                # still reads as non-lake.
                gray_frac = float(
                    np.mean((roi >= LAKE_GRAY_LOW) & (roi <= LAKE_GRAY_HIGH))
                )
                row.append(1 if gray_frac > 0.5 else 0)
            lakes.append(row)
        return lakes

    def _classify_features(
        self,
        warped_gray: NDArray,
        geom: HellGolfGeometry,
        lakes: list[list[int]],
        debug_dir: str | None = None,
    ) -> tuple[list[HellGolfBall], list[list[int]]]:
        """Classify non-lake cells: circled numbers (balls) and H marks (goals)."""
        rows, cols = geom.rows, geom.cols
        margin_ratio = 0.2

        cell_crops: list[list[NDArray]] = []
        for r in range(rows):
            row_crops: list[NDArray] = []
            for c in range(cols):
                y1, y2, x1, x2 = self._cell_bounds(geom, r, c)
                my = int((y2 - y1) * margin_ratio)
                mx = int((x2 - x1) * margin_ratio)
                roi = warped_gray[y1 + my: y2 - my, x1 + mx: x2 - mx]
                # Blank out lake cells so the classifier ignores them (the gray
                # fill would otherwise register as non-empty content).
                if lakes[r][c] == 1:
                    roi = np.full_like(roi, 255)
                row_crops.append(roi)
            cell_crops.append(row_crops)

        results = classify_cells(
            self._recognizer,
            cell_crops,
            [
                CircledIntegerTarget(),
                SymbolTarget({GOAL_CODE: "the capital letter H"}),
            ],
        )

        balls: list[HellGolfBall] = []
        goals: list[list[int]] = []
        for r in range(rows):
            for c in range(cols):
                cell = results[r][c]
                if isinstance(cell, CircledInteger):
                    balls.append(HellGolfBall(r=r, c=c, n=int(cell.value)))
                elif isinstance(cell, Symbol) and cell.code == GOAL_CODE:
                    goals.append([r, c])

        return balls, goals

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = HellGolfBoard(**data.grid)
            rows = len(board.lakes)
            cols = len(board.lakes[0]) if rows > 0 else 0
            if rows < 2 or cols < 2:
                return False
            for row in board.lakes:
                if len(row) != cols:
                    return False
                if not all(v in (0, 1) for v in row):
                    return False
            # Balls and goals must sit inside the grid, off lakes, and be
            # disjoint from one another.
            occupied: set[tuple[int, int]] = set()
            for b in board.balls:
                if not (0 <= b.r < rows and 0 <= b.c < cols):
                    return False
                if b.n < 1:
                    return False
                if board.lakes[b.r][b.c] == 1:
                    return False
                if (b.r, b.c) in occupied:
                    return False
                occupied.add((b.r, b.c))
            for r, c in board.goals:
                if not (0 <= r < rows and 0 <= c < cols):
                    return False
                if board.lakes[r][c] == 1:
                    return False
                if (r, c) in occupied:
                    return False
                occupied.add((r, c))
            # The defining constraint: one goal per ball.
            if len(board.balls) != len(board.goals):
                return False
            if len(board.balls) == 0:
                return False
            return True
        except Exception:
            return False

    def to_json(self, board: HellGolfBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
