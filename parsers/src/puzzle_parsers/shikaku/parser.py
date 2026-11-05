from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.debug_overlay import save_cell_labels
from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.cell_ocr import crop_cell, read_cells
from puzzle_parsers.shikaku.grid_detector import detect_shikaku_grid
from puzzle_parsers.shikaku.models import ShikakuBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend

# A clue is a white number printed on a solid dark circle. A cell with a clue
# therefore has a large fraction of dark pixels near its centre (the filled
# disc), whereas a blank cell only carries thin dashed grid lines and stays
# mostly light. Cells below this fraction are never sent to the recognizer, so
# blank cells cannot be hallucinated into spurious clues.
DARK_PIXEL_VALUE = 128
CLUE_MIN_DARK_FRACTION = 0.12
# Inset used to decide whether a cell is clued: tight, so only the filled centre
# circle counts and the dashed grid lines near the edges do not.
DETECT_MARGIN = 0.15


class ShikakuParser(PuzzleParser):
    puzzle_type = "shikaku"

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> ShikakuBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> ShikakuBoard:
        geom = detect_shikaku_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        cells = self._read_clues(warped_gray, geom, debug_dir=debug_dir)
        return ShikakuBoard(cells=cells)

    def _read_clues(
        self, warped_gray: NDArray, geom: BoardGrid, debug_dir: str | None = None
    ) -> list[list[int]]:
        """Read printed clue numbers, one per cell (0 where blank).

        Clue cells are identified by their dark-pixel fraction (the filled
        circle). Each clue's white number is lifted off its halftone disc as a
        dark number on white (``_disc_digit``) and read by the shared OCR.
        """
        rows, cols = geom.rows, geom.cols
        cells = [[0] * cols for _ in range(rows)]
        clue_coords: list[tuple[int, int]] = []
        clue_crops: list[NDArray] = []
        for r in range(rows):
            for c in range(cols):
                y1 = geom.h_lines[r]
                y2 = geom.h_lines[r + 1]
                x1 = geom.v_lines[c]
                x2 = geom.v_lines[c + 1]
                detect_roi = crop_cell(warped_gray, y1, y2, x1, x2, margin=DETECT_MARGIN)
                if float(np.mean(detect_roi < DARK_PIXEL_VALUE)) < CLUE_MIN_DARK_FRACTION:
                    continue
                clue_coords.append((r, c))
                clue_crops.append(_disc_digit(crop_cell(warped_gray, y1, y2, x1, x2)))

        if clue_crops:
            values = read_cells(self._ocr, [clue_crops], allow_multi_digits=True)[0]
            for (r, c), val in zip(clue_coords, values):
                cells[r][c] = val

        if debug_dir:
            save_cell_labels(
                geom, [[str(v) if v > 0 else None for v in row] for row in cells],
                Path(debug_dir) / "04_cells.png",
            )

        return cells

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = ShikakuBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows > 0 else 0
            if rows < 2 or cols < 2:
                return False
            for row in board.cells:
                if len(row) != cols:
                    return False
                for val in row:
                    if val < 0:
                        return False
            # A valid shikaku's clues sum to the grid area (each cell belongs to
            # exactly one rectangle), but we do not hard-fail on a mismatch here
            # so imperfect OCR still yields a usable, hand-correctable board.
            return True
        except Exception:
            return False

    def to_json(self, board: ShikakuBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")


def _disc_digit(crop: NDArray) -> NDArray:
    """The white number on a dark disc, as a dark number on white.

    Paper and number are both light; the number is the light ink that does not
    touch the crop edge (the paper around the disc does).
    """
    _, light = cv2.threshold(
        cv2.GaussianBlur(crop, (3, 3), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )
    n, labels, stats, _ = cv2.connectedComponentsWithStats(light, connectivity=8)
    h, w = light.shape
    out = np.full_like(crop, 255)
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if x == 0 or y == 0 or x + bw == w or y + bh == h or area < 0.005 * h * w:
            continue
        digit = labels == i
        out[digit] = 255 - crop[digit]
    return out
