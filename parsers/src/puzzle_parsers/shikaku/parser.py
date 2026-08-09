from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition_schemas import SHIKAKU_CLUE_PROMPT
from puzzle_parsers.shikaku.grid_detector import ShikakuGeometry, detect_shikaku_grid
from puzzle_parsers.shikaku.models import ShikakuBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import CellRecognizer

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
# Inset used for the crop actually sent to OCR: looser, so a wide two-digit clue
# in a narrow cell is not clipped on its leading digit.
OCR_MARGIN = 0.05


class ShikakuParser(PuzzleParser):
    puzzle_type = "shikaku"

    def __init__(self, recognizer: CellRecognizer | None = None) -> None:
        if recognizer is None:
            from puzzle_parsers.recognition import GeminiRecognizer

            recognizer = GeminiRecognizer()
        self._recognizer = recognizer

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
        self, warped_gray: NDArray, geom: ShikakuGeometry, debug_dir: str | None = None
    ) -> list[list[int]]:
        """Read printed clue numbers, one per cell (0 where blank).

        Clue cells are identified by their dark-pixel fraction (the filled
        circle), so only cells that actually hold a clue reach the model. Each
        surviving crop is inverted (white-on-dark -> dark-on-light) and packed
        into a single labeled montage, recognized in one call.
        """
        rows, cols = geom.rows, geom.cols
        cells = [[0] * cols for _ in range(rows)]
        if self._recognizer is None:
            return cells

        img_h, img_w = warped_gray.shape[:2]
        clue_coords: list[tuple[int, int]] = []
        clue_crops: list[NDArray] = []
        for r in range(rows):
            for c in range(cols):
                y1 = geom.h_lines[r]
                y2 = geom.h_lines[r + 1]
                x1 = geom.v_lines[c]
                x2 = geom.v_lines[c + 1]
                # Detection uses a tight inset so only the filled circle in the
                # cell centre trips the dark-fraction test (grid dashes stay out).
                dy = int((y2 - y1) * DETECT_MARGIN)
                dx = int((x2 - x1) * DETECT_MARGIN)
                detect_roi = warped_gray[y1 + dy : y2 - dy, x1 + dx : x2 - dx]
                if detect_roi.size == 0:
                    continue
                dark_fraction = float(np.mean(detect_roi < DARK_PIXEL_VALUE))
                if dark_fraction < CLUE_MIN_DARK_FRACTION:
                    continue
                # OCR uses a looser crop so wide two-digit clues (e.g. 12, 14) in
                # a tight column are not clipped on the leading digit. Clamp to
                # the warped image bounds.
                oy = int((y2 - y1) * OCR_MARGIN)
                ox = int((x2 - x1) * OCR_MARGIN)
                cy1 = max(0, y1 + oy)
                cy2 = min(img_h, y2 - oy)
                cx1 = max(0, x1 + ox)
                cx2 = min(img_w, x2 - ox)
                ocr_roi = warped_gray[cy1:cy2, cx1:cx2]
                if ocr_roi.size == 0:
                    continue
                # Invert so the white digit becomes dark on a lighter disc.
                clue_coords.append((r, c))
                clue_crops.append(cv2.bitwise_not(ocr_roi))

        if not clue_crops:
            return cells

        # Pack candidate crops into a compact montage (~10 columns). The last row
        # is padded to a full rectangle by repeating a real clue crop (never a
        # blank tile): SHIKAKU_CLUE_PROMPT tells the model every cell has a
        # number, so a short final row would fail recognize()'s rectangularity
        # check. The extra recognized values map past clue_coords and are ignored.
        cols_per_row = min(10, len(clue_crops))
        crop_grid: list[list[NDArray]] = []
        for i in range(0, len(clue_crops), cols_per_row):
            row_crops = clue_crops[i : i + cols_per_row]
            while len(row_crops) < cols_per_row:
                row_crops.append(clue_crops[0])
            crop_grid.append(row_crops)

        raw = self._recognizer.recognize(crop_grid, SHIKAKU_CLUE_PROMPT)
        flat: list[int] = []
        for row in raw:
            flat.extend(row)

        for i, (r, c) in enumerate(clue_coords):
            if i >= len(flat):
                break
            val = flat[i]
            if isinstance(val, int) and val > 0:
                cells[r][c] = val

        if debug_dir:
            vis = geom.warped.copy()
            for r in range(rows):
                for c in range(cols):
                    if cells[r][c] > 0:
                        cv2.putText(
                            vis,
                            str(cells[r][c]),
                            (geom.v_lines[c] + 5, geom.h_lines[r] + 20),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.4,
                            (0, 0, 255),
                            1,
                        )
            cv2.imwrite(str(Path(debug_dir) / "04_cells.png"), vis)

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
