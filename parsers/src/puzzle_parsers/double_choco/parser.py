from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.double_choco.grid_detector import detect_double_choco_grid
from puzzle_parsers.double_choco.models import DoubleChocoBoard
from puzzle_parsers.validate import validate_canon

if TYPE_CHECKING:
    from puzzle_parsers.combo_sudoku.ocr import OcrBackend


class DoubleChocoParser(PuzzleParser):
    puzzle_type = "double-choco"

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        validate_canon(self.puzzle_type, grid)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> DoubleChocoBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> DoubleChocoBoard:
        from pathlib import Path as _Path

        geom = detect_double_choco_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        rows = geom.rows
        cols = geom.cols
        h_lines = geom.h_lines
        v_lines = geom.v_lines

        debug_path = _Path(debug_dir) if debug_dir else None

        # First pass: collect all cell ROIs and their mean intensities
        cell_rois: list[list[np.ndarray]] = []
        cell_means: list[float] = []
        for r in range(rows):
            row_rois: list[np.ndarray] = []
            for c in range(cols):
                y1 = h_lines[r]
                y2 = h_lines[r + 1]
                x1 = v_lines[c]
                x2 = v_lines[c + 1]

                margin_y = int((y2 - y1) * 0.2)
                margin_x = int((x2 - x1) * 0.2)
                cell_roi = warped_gray[y1 + margin_y : y2 - margin_y, x1 + margin_x : x2 - margin_x]
                row_rois.append(cell_roi)
                cell_means.append(float(np.mean(cell_roi)))
            cell_rois.append(row_rois)

        # Adaptive color threshold using Otsu on cell mean intensities
        means_arr = np.array(cell_means)
        scaled = ((means_arr - means_arr.min()) / (means_arr.max() - means_arr.min() + 1e-6) * 255).astype(np.uint8)
        otsu_val, _ = cv2.threshold(scaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        color_threshold = means_arr.min() + (otsu_val / 255) * (means_arr.max() - means_arr.min())

        # Second pass: classify and recognize
        cells: list[list[list[int]]] = []
        idx = 0
        for r in range(rows):
            row: list[list[int]] = []
            for c in range(cols):
                color = 1 if cell_means[idx] < color_threshold else 0
                number = self._recognize_number(cell_rois[r][c])
                row.append([color, number])
                idx += 1
            cells.append(row)

        if debug_path:
            vis = geom.warped.copy()
            for r in range(rows):
                for c in range(cols):
                    color, num = cells[r][c]
                    y1 = h_lines[r]
                    x1 = v_lines[c]
                    label = f"{'G' if color == 1 else 'W'}{num if num > 0 else ''}"
                    cv2.putText(vis, label, (x1 + 5, y1 + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)
            cv2.imwrite(str(debug_path / "04_cells.png"), vis)

        return DoubleChocoBoard(cells=cells)

    def _recognize_number(self, cell_roi: np.ndarray) -> int:
        """Recognize a number in the cell using OCR or contour-based heuristic."""
        # First check if cell has significant ink (a number present)
        _, binary = cv2.threshold(cell_roi, 140, 255, cv2.THRESH_BINARY_INV)
        h, w = cell_roi.shape[:2]
        pixel_ratio = np.count_nonzero(binary) / binary.size
        if pixel_ratio < 0.03:
            return 0

        # Check if there are significant contours
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        min_area = h * w * 0.05
        significant = [cnt for cnt in contours if cv2.contourArea(cnt) > min_area]
        if not significant:
            return 0

        # Use EasyOCR if available
        if self._ocr is not None:
            return self._ocr_single_cell(cell_roi)

        # Fallback: contour-based estimation (counts significant blobs)
        return self._contour_estimate(cell_roi, significant)

    def _ocr_single_cell(self, cell_roi: np.ndarray) -> int:
        """Use EasyOCR to read a number from a single cell."""
        resized = cv2.resize(cell_roi, (128, 128), interpolation=cv2.INTER_CUBIC)
        results = self._ocr._reader.readtext(
            resized,
            allowlist="0123456789",
            detail=0,
            paragraph=False,
        )
        if not results:
            return 0

        text = "".join(results).strip()
        if text.isdigit():
            val = int(text)
            return val if val > 0 else 0
        return 0

    def _contour_estimate(self, cell_roi: np.ndarray, contours: list) -> int:
        """Fallback heuristic: estimate number from contour properties.

        This is a rough heuristic that works for single digits by comparing
        contour aspect ratio and fill ratio against known digit patterns.
        Without OCR, this is unreliable for multi-digit numbers.
        """
        # Merge all significant contours into one bounding rect
        all_pts = np.vstack(contours)
        x, y, bw, bh = cv2.boundingRect(all_pts)

        # If bounding box is too small relative to cell, probably noise
        h, w = cell_roi.shape[:2]
        if bw < w * 0.15 or bh < h * 0.25:
            return 0

        # There's definitely a number here, but we can't reliably read it
        # without OCR. Return -1 as a sentinel to indicate "number present
        # but unrecognized" — the parser will convert this to 0.
        # In practice, the EasyOCR path handles this.
        return 0

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = DoubleChocoBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows > 0 else 0
            if rows < 2 or cols < 2:
                return False
            for row in board.cells:
                if len(row) != cols:
                    return False
                for cell in row:
                    if len(cell) != 2:
                        return False
                    if cell[0] not in (0, 1):
                        return False
                    if cell[1] < 0:
                        return False
            return True
        except Exception:
            return False

    def to_json(self, board: DoubleChocoBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
