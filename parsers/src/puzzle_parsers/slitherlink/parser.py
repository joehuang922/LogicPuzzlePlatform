from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.slitherlink.grid_detector import detect_slitherlink_grid
from puzzle_parsers.slitherlink.models import SlitherlinkBoard
from puzzle_parsers.validate import validate_canon
from puzzle_parsers.vision_utils import ocr_read_digit

if TYPE_CHECKING:
    from puzzle_parsers.combo_sudoku.ocr import OcrBackend


class SlitherlinkParser(PuzzleParser):
    puzzle_type = "slitherlink"

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array, expected_rows=None, expected_cols=None)
        grid = board.model_dump()
        validate_canon(self.puzzle_type, grid)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path,
        expected_rows: int = 10, expected_cols: int = 10,
        debug_dir: str | None = None,
    ) -> SlitherlinkBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(
            img_array, expected_rows=expected_rows, expected_cols=expected_cols,
            debug_dir=debug_dir,
        )

    def _parse_image(
        self, img_array: np.ndarray,
        expected_rows: int | None = None, expected_cols: int | None = None,
        debug_dir: str | None = None,
    ) -> SlitherlinkBoard:
        geom = detect_slitherlink_grid(
            img_array,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
            debug_dir=debug_dir,
        )

        debug_path = Path(debug_dir) if debug_dir else None
        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)

        rows = geom.rows
        cols = geom.cols
        dot_grid = geom.dot_grid

        cells: list[list[int]] = []
        for r in range(rows):
            row: list[int] = []
            for c in range(cols):
                # Cell center is the midpoint of 4 surrounding dots
                tl = dot_grid[r, c]
                tr = dot_grid[r, c + 1]
                bl = dot_grid[r + 1, c]
                br = dot_grid[r + 1, c + 1]

                cx = (tl[0] + tr[0] + bl[0] + br[0]) / 4
                cy = (tl[1] + tr[1] + bl[1] + br[1]) / 4
                cell_w = ((tr[0] - tl[0]) + (br[0] - bl[0])) / 2
                cell_h = ((bl[1] - tl[1]) + (br[1] - tr[1])) / 2

                # Use 60% of cell size as ROI (small margin to exclude dots)
                roi_w = int(cell_w * 0.6)
                roi_h = int(cell_h * 0.6)
                x1 = max(0, int(cx - roi_w / 2))
                y1 = max(0, int(cy - roi_h / 2))
                x2 = min(gray.shape[1], int(cx + roi_w / 2))
                y2 = min(gray.shape[0], int(cy + roi_h / 2))
                cell_roi = gray[y1:y2, x1:x2]

                number = self._recognize_number(cell_roi)
                row.append(number)
            cells.append(row)

        if debug_path:
            vis = img_array.copy()
            for r in range(rows):
                for c in range(cols):
                    tl = dot_grid[r, c]
                    val = cells[r][c]
                    label = str(val) if val >= 0 else "."
                    cx = int((dot_grid[r, c, 0] + dot_grid[r, c + 1, 0]) / 2)
                    cy = int((dot_grid[r, c, 1] + dot_grid[r + 1, c, 1]) / 2)
                    cv2.putText(vis, label, (cx - 5, cy + 5),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
            cv2.imwrite(str(debug_path / "03_cells.png"), vis)

        return SlitherlinkBoard(cells=cells)

    def _recognize_number(self, cell_roi: np.ndarray) -> int:
        """Recognize a number (0-3) in the cell. Returns -1 if empty."""
        if cell_roi.size == 0:
            return -1

        h, w = cell_roi.shape[:2]
        if h < 5 or w < 5:
            return -1

        _, binary = cv2.threshold(cell_roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        pixel_ratio = np.count_nonzero(binary) / binary.size
        if pixel_ratio < 0.02:
            return -1

        # Check for significant contours (filter out noise)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        min_area = h * w * 0.03
        significant = [cnt for cnt in contours if cv2.contourArea(cnt) > min_area]
        if not significant:
            return -1

        # Use EasyOCR if available
        if self._ocr is not None:
            return self._ocr_single_cell(cell_roi)

        # Fallback: contour-based heuristic for digits 0-3
        return self._contour_heuristic(cell_roi, binary, significant)

    def _ocr_single_cell(self, cell_roi: np.ndarray) -> int:
        """Use EasyOCR to read a single digit (0-3) from a cell."""
        return ocr_read_digit(cell_roi, self._ocr._reader, allowlist="0123", empty_val=-1)

    def _contour_heuristic(
        self, cell_roi: np.ndarray, binary: np.ndarray, contours: list
    ) -> int:
        """Heuristic digit recognition for 0-3 based on contour topology."""
        h, w = cell_roi.shape[:2]

        # Merge all significant contours
        all_pts = np.vstack(contours)
        x, y, bw, bh = cv2.boundingRect(all_pts)
        if bw < w * 0.15 or bh < h * 0.3:
            return -1

        # Count holes (inner contours) for digit classification
        contours_all, hierarchy = cv2.findContours(
            binary, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE
        )
        if hierarchy is None:
            return -1

        # Count contours with a parent (holes)
        holes = 0
        for i in range(len(contours_all)):
            parent = hierarchy[0][i][3]
            if parent >= 0 and cv2.contourArea(contours_all[i]) > h * w * 0.02:
                holes += 1

        # Fill ratio of the bounding box
        roi_crop = binary[y:y + bh, x:x + bw]
        fill_ratio = np.count_nonzero(roi_crop) / (bw * bh) if bw * bh > 0 else 0

        # 0 has one hole, relatively round
        if holes >= 1 and fill_ratio < 0.55:
            return 0
        # 1 is thin/narrow
        aspect = bw / bh if bh > 0 else 1
        if aspect < 0.45 and holes == 0:
            return 1
        # 3 might have holes depending on font, but typically open
        # 2 and 3 are hard to distinguish without OCR
        # Default to -1 (unknown) when uncertain
        return -1

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = SlitherlinkBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows > 0 else 0
            if rows < 2 or cols < 2:
                return False
            for row in board.cells:
                if len(row) != cols:
                    return False
                for val in row:
                    if val < -1 or val > 3:
                        return False
            return True
        except Exception:
            return False

    def to_json(self, board: SlitherlinkBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
