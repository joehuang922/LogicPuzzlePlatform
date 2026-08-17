from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.ripple_effect.grid_detector import (
    RippleEffectGeometry,
    classify_borders,
    detect_ripple_effect_grid,
)
from puzzle_parsers.ripple_effect.models import (
    RippleEffectBoard,
    RippleEffectEdges,
)

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class RippleEffectParser(PuzzleParser):
    puzzle_type = "ripple_effect"

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> RippleEffectBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> RippleEffectBoard:
        geom = detect_ripple_effect_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        # Room partition from thick-border classification (like LITS/Heyawake).
        h_borders, v_borders = classify_borders(
            warped_gray, geom, debug_dir=debug_dir
        )

        # Per-cell clue digits via batch OCR (like Fillomino). Blank cells -> 0.
        cells = self._read_cells(warped_gray, geom, debug_dir=debug_dir)

        return RippleEffectBoard(
            cells=cells,
            edges=RippleEffectEdges(h=h_borders, v=v_borders),
        )

    def _read_cells(
        self,
        warped_gray: np.ndarray,
        geom: RippleEffectGeometry,
        debug_dir: str | None = None,
    ) -> list[list[int]]:
        rows, cols = geom.rows, geom.cols
        h_lines, v_lines = geom.h_lines, geom.v_lines

        cell_rois: list[list[np.ndarray]] = []
        for r in range(rows):
            row_rois: list[np.ndarray] = []
            for c in range(cols):
                y1 = h_lines[r]
                y2 = h_lines[r + 1]
                x1 = v_lines[c]
                x2 = v_lines[c + 1]
                margin_y = int((y2 - y1) * 0.2)
                margin_x = int((x2 - x1) * 0.2)
                roi = warped_gray[
                    y1 + margin_y : y2 - margin_y, x1 + margin_x : x2 - margin_x
                ]
                row_rois.append(roi)
            cell_rois.append(row_rois)

        if self._ocr is not None:
            cells = self._ocr.recognize_cells(cell_rois)
        else:
            cells = [[0] * cols for _ in range(rows)]

        if debug_dir:
            debug_path = Path(debug_dir)
            vis = geom.warped.copy()
            for r in range(rows):
                for c in range(cols):
                    num = cells[r][c]
                    if num > 0:
                        cv2.putText(
                            vis,
                            str(num),
                            (v_lines[c] + 5, h_lines[r] + 20),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.4,
                            (0, 0, 255),
                            1,
                        )
            cv2.imwrite(str(debug_path / "05_cells.png"), vis)

        return cells

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = RippleEffectBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows > 0 else 0
            if rows < 2 or cols < 2:
                return False

            # Rectangular, non-negative clue grid.
            for row in board.cells:
                if len(row) != cols:
                    return False
                for val in row:
                    if val < 0:
                        return False

            # Edge grids must match the derived dimensions.
            h, v = board.edges.h, board.edges.v
            if len(h) != rows - 1:
                return False
            for row in h:
                if len(row) != cols or not all(val in (0, 1) for val in row):
                    return False
            if len(v) != rows:
                return False
            for row in v:
                if len(row) != cols - 1 or not all(val in (0, 1) for val in row):
                    return False

            # Each clue must be a positive integer no larger than its room size.
            room_sizes = _room_sizes(rows, cols, h, v)
            for r in range(rows):
                for c in range(cols):
                    clue = board.cells[r][c]
                    if clue > 0 and clue > room_sizes[r][c]:
                        return False
            return True
        except Exception:
            return False

    def to_json(self, board: RippleEffectBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")


def _room_sizes(
    rows: int,
    cols: int,
    h_borders: list[list[int]],
    v_borders: list[list[int]],
) -> list[list[int]]:
    """Flood-fill rooms across thin edges; return each cell's room size."""
    comp = [[-1] * cols for _ in range(rows)]
    sizes: list[int] = []
    next_id = 0
    for sr in range(rows):
        for sc in range(cols):
            if comp[sr][sc] >= 0:
                continue
            cid = next_id
            next_id += 1
            count = 0
            stack = [(sr, sc)]
            comp[sr][sc] = cid
            while stack:
                r, c = stack.pop()
                count += 1
                if r > 0 and comp[r - 1][c] < 0 and h_borders[r - 1][c] == 0:
                    comp[r - 1][c] = cid
                    stack.append((r - 1, c))
                if r < rows - 1 and comp[r + 1][c] < 0 and h_borders[r][c] == 0:
                    comp[r + 1][c] = cid
                    stack.append((r + 1, c))
                if c > 0 and comp[r][c - 1] < 0 and v_borders[r][c - 1] == 0:
                    comp[r][c - 1] = cid
                    stack.append((r, c - 1))
                if c < cols - 1 and comp[r][c + 1] < 0 and v_borders[r][c] == 0:
                    comp[r][c + 1] = cid
                    stack.append((r, c + 1))
            sizes.append(count)

    return [[sizes[comp[r][c]] for c in range(cols)] for r in range(rows)]
