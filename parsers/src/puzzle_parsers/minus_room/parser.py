"""Minus Room parser: walls by the shared thickness classifier, givens, circled
differences and the 「1〜N」 range by the shared EasyOCR reader.

See ``grid_detector`` for how circles and the range are found.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser, timed
from puzzle_parsers.cell_ocr import crop_cell, read_cells, read_grid_clues
from puzzle_parsers.debug_overlay import save_cell_labels
from puzzle_parsers.grid_utils import classify_border_thickness
from puzzle_parsers.minus_room.grid_detector import detect_minus_room, find_max_digit
from puzzle_parsers.minus_room.models import MinusRoomBoard, MinusRoomCircle, MinusRoomEdges
from puzzle_parsers.models import PuzzleData

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend

# Every sample uses 1〜4; the review screen shows the range to check.
DEFAULT_MAX = 4
# Inner part of a circle read for its digit, as a fraction of its radius.
CIRCLE_INNER = 0.78


class MinusRoomParser(PuzzleParser):
    puzzle_type = "minus-room"
    locates_board = True

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> MinusRoomBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> MinusRoomBoard:
        with timed("minus room grid detect"):
            geom = detect_minus_room(img_array, debug_dir=debug_dir)
        grid = geom.grid
        if grid.quad is not None:
            self._board_located(img_array, grid.quad)

        h_walls, v_walls = classify_border_thickness(geom.gray, grid, debug_dir=debug_dir)
        max_value = self._read_max(img_array, grid.quad, grid.cols)
        cells = read_grid_clues(
            self._ocr, geom.ocr_gray, grid.h_lines, grid.v_lines,
            allow_multi_digits=False, max_value=max_value,
        )
        circles = self._read_circles(geom, max_value)

        if debug_dir:
            save_cell_labels(
                grid, [[str(v) if v > 0 else None for v in row] for row in cells],
                Path(debug_dir) / "03_givens.png",
            )
        return MinusRoomBoard(
            rows=grid.rows,
            cols=grid.cols,
            max=max_value,
            cells=cells,
            edges=MinusRoomEdges(h=h_walls, v=v_walls),
            circles=circles,
        )

    def _read_max(self, image: np.ndarray, quad: np.ndarray | None, cols: int) -> int:
        """N of the 「1〜N」 beside the board, else ``DEFAULT_MAX``."""
        if quad is None or self._ocr is None:
            return DEFAULT_MAX
        box = find_max_digit(image, quad, cols)
        if box is None:
            return DEFAULT_MAX
        x, y, w, h = box
        gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        # Pad the glyph to a cell-like square so the shared reader sees a usual crop.
        side = max(w, h) * 1.6
        cx, cy = x + w / 2, y + h / 2
        roi = crop_cell(gray, cy - side / 2, cy + side / 2, cx - side / 2, cx + side / 2, margin=0)
        value = read_cells(self._ocr, [[roi]], allow_multi_digits=False)[0][0]
        return value if 2 <= value <= 9 else DEFAULT_MAX

    def _read_circles(self, geom, max_value: int) -> list[MinusRoomCircle]:
        """The digit in each circle: its inside, ring and lines painted white."""
        if not geom.circles:
            return []
        rois = []
        for k in geom.circles:
            r = k.radius
            roi = crop_cell(geom.gray, k.y - r, k.y + r, k.x - r, k.x + r, margin=0).copy()
            mask = np.zeros(roi.shape, np.uint8)
            cv2.circle(mask, (roi.shape[1] // 2, roi.shape[0] // 2), round(r * CIRCLE_INNER), 255, -1)
            roi[mask == 0] = 255
            rois.append(roi)
        values = read_cells(
            self._ocr, [rois], allow_multi_digits=False, allow_zero=True, max_value=max_value - 1
        )[0]
        return [
            MinusRoomCircle(dr=k.dr, dc=k.dc, value=v)
            for k, v in zip(geom.circles, values)
            if v >= 0
        ]

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = MinusRoomBoard(**data.grid)
            rows, cols = board.rows, board.cols
            if rows < 2 or cols < 2 or not 1 <= board.max <= 9:
                return False
            if len(board.cells) != rows or any(
                len(row) != cols or any(not 0 <= v <= board.max for v in row) for row in board.cells
            ):
                return False
            h, v = board.edges.h, board.edges.v
            if len(h) != rows - 1 or any(len(row) != cols or any(x not in (0, 1) for x in row) for row in h):
                return False
            if len(v) != rows or any(len(row) != cols - 1 or any(x not in (0, 1) for x in row) for row in v):
                return False
            seen = set()
            for k in board.circles:
                if (k.dr + k.dc) % 2 != 1 or not (0 <= k.dr <= 2 * (rows - 1) and 0 <= k.dc <= 2 * (cols - 1)):
                    return False
                if not 0 <= k.value <= board.max - 1 or (k.dr, k.dc) in seen:
                    return False
                seen.add((k.dr, k.dc))
            return True
        except Exception:
            return False

    def to_json(self, board: MinusRoomBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
