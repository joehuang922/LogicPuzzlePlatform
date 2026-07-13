from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.nonogram.grid_detector import detect_nonogram_grid
from puzzle_parsers.nonogram.models import NonogramBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


ROW_CLUE_PROMPT = (
    "This image shows a cropped section of row clues from a nonogram puzzle. "
    "Each row of the grid has a sequence of numbers to the left indicating "
    "the lengths of consecutive filled groups in that row. "
    "There are exactly {n} rows. "
    "Output a JSON array of exactly {n} arrays, where each inner array contains the clue "
    "numbers for that row, from top to bottom. A row with no clue has [0]. "
    "Example for 3 rows: [[3,2],[1],[5,1,2]]. No explanation, just the JSON."
)

COL_CLUE_PROMPT = (
    "This image shows a cropped section of column clues from a nonogram puzzle. "
    "The clues are arranged in a grid of cells. Each column has numbers stacked "
    "vertically, read from top to bottom, indicating the lengths of consecutive "
    "filled groups in that column. Empty cells (no number) should be skipped. "
    "There are exactly {n} columns. "
    "For each column, collect all numbers from top to bottom (ignoring empty cells). "
    "The bottom row always has a number for every column. "
    "Output a JSON array of exactly {n} arrays, one per column from left to right. "
    "Example for 3 columns: [[2,1],[4],[1,1,3]]. No explanation, just the JSON."
)


class NonogramParser(PuzzleParser):
    puzzle_type = "nonogram"

    def __init__(
        self,
        ocr_backend: OcrBackend | None = None,
        recognizer: CellRecognizer | None = None,
    ) -> None:
        self._ocr = ocr_backend
        self._recognizer = recognizer

    @property
    def recognizer(self) -> CellRecognizer:
        if self._recognizer is None:
            self._recognizer = GeminiRecognizer()
        return self._recognizer

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array, expected_rows=None, expected_cols=None)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self,
        image_path: str | Path,
        expected_rows: int = 10,
        expected_cols: int = 10,
        debug_dir: str | None = None,
        ocr: str = "gemini",
    ) -> NonogramBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(
            img_array,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
            debug_dir=debug_dir,
            ocr=ocr,
        )

    def _parse_image(
        self,
        img_array: np.ndarray,
        expected_rows: int | None = None,
        expected_cols: int | None = None,
        debug_dir: str | None = None,
        ocr: str = "gemini",
    ) -> NonogramBoard:
        geom = detect_nonogram_grid(
            img_array,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
            debug_dir=debug_dir,
        )

        debug_path = Path(debug_dir) if debug_dir else None

        # Extract row clue region
        rx, ry, rw, rh = geom.row_clue_rect
        row_clue_img = img_array[ry : ry + rh, rx : rx + rw]

        # Extract col clue region
        cx, cy, cw, ch = geom.col_clue_rect
        col_clue_img = img_array[cy : cy + ch, cx : cx + cw]

        if debug_path:
            cv2.imwrite(str(debug_path / "02_row_clues.png"), row_clue_img)
            cv2.imwrite(str(debug_path / "03_col_clues.png"), col_clue_img)

        if ocr == "easyocr":
            row_clues = self._ocr_row_clues(
                row_clue_img, geom.rows, geom.cell_h, grid_cell_w=geom.cell_w
            )
            col_clues = self._ocr_col_clues(
                col_clue_img, geom.cols, geom.cell_w, grid_cell_h=geom.cell_h
            )
        else:
            row_clues = self._llm_recognize_clues(
                row_clue_img, ROW_CLUE_PROMPT.format(n=geom.rows)
            )
            col_clues = self._llm_recognize_col_clues(
                col_clue_img, geom.cols, geom.cell_w
            )

        if debug_path:
            debug_path.mkdir(parents=True, exist_ok=True)
            (debug_path / "04_parsed.json").write_text(
                json.dumps({"rowClues": row_clues, "colClues": col_clues}, indent=2)
            )

        return NonogramBoard(rowClues=row_clues, colClues=col_clues)

    def _llm_recognize_clues(
        self, clue_img: np.ndarray, prompt: str
    ) -> list[list[int]]:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            cv2.imwrite(f.name, clue_img)
            result = self.recognizer.recognize_full_image(f.name, prompt)
        return result

    def _llm_recognize_col_clues(
        self, col_clue_img: np.ndarray, num_cols: int, cell_w: float,
        chunk_size: int = 5,
    ) -> list[list[int]]:
        """Split column clue image into chunks and recognize each separately."""
        h, w = col_clue_img.shape[:2]
        all_clues: list[list[int]] = []

        for start in range(0, num_cols, chunk_size):
            end = min(start + chunk_size, num_cols)
            n = end - start
            x1 = int(start * cell_w)
            x2 = int(end * cell_w)
            x1 = max(0, min(x1, w))
            x2 = max(0, min(x2, w))
            chunk_img = col_clue_img[:, x1:x2]
            prompt = COL_CLUE_PROMPT.format(n=n)
            clues = self._llm_recognize_clues(chunk_img, prompt)
            if len(clues) < n:
                clues.extend([[0]] * (n - len(clues)))
            all_clues.extend(clues[:n])

        return all_clues

    def _ocr_row_clues(
        self, row_clue_img: np.ndarray, num_rows: int, cell_h: float,
        grid_cell_w: float = 0,
    ) -> list[list[int]]:
        """Split row clue region into individual sub-cells and OCR each."""
        import easyocr

        reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        h, w = row_clue_img.shape[:2]
        actual_cell_w = grid_cell_w if grid_cell_w > 0 else cell_h
        num_clue_cols = max(1, int(round(w / actual_cell_w)))
        actual_cell_w = w / num_clue_cols

        clues: list[list[int]] = []
        for r in range(num_rows):
            y1 = int(r * cell_h)
            y2 = int((r + 1) * cell_h)
            y1 = max(0, min(y1, h))
            y2 = max(0, min(y2, h))
            row_nums: list[int] = []
            for c in range(num_clue_cols):
                x1 = int(c * actual_cell_w)
                x2 = int((c + 1) * actual_cell_w)
                x1 = max(0, min(x1, w))
                x2 = max(0, min(x2, w))
                cell = row_clue_img[y1:y2, x1:x2]
                digit = self._ocr_single_cell(reader, cell, margin=0.18)
                if digit > 0:
                    row_nums.append(digit)
            clues.append(row_nums if row_nums else [0])

        return clues

    def _ocr_col_clues(
        self, col_clue_img: np.ndarray, num_cols: int, cell_w: float,
        grid_cell_h: float = 0,
    ) -> list[list[int]]:
        """Split col clue region into individual sub-cells and OCR each."""
        import easyocr

        reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        h, w = col_clue_img.shape[:2]
        actual_cell_h = grid_cell_h if grid_cell_h > 0 else cell_w
        num_clue_rows = max(1, int(round(h / actual_cell_h)))
        actual_cell_h = h / num_clue_rows

        clues: list[list[int]] = []
        for c in range(num_cols):
            x1 = int(c * cell_w)
            x2 = int((c + 1) * cell_w)
            x1 = max(0, min(x1, w))
            x2 = max(0, min(x2, w))
            col_nums: list[int] = []
            for r in range(num_clue_rows):
                y1 = int(r * actual_cell_h)
                y2 = int((r + 1) * actual_cell_h)
                y1 = max(0, min(y1, h))
                y2 = max(0, min(y2, h))
                cell = col_clue_img[y1:y2, x1:x2]
                digit = self._ocr_single_cell(reader, cell, margin=0.22)
                if digit > 0:
                    col_nums.append(digit)
            clues.append(col_nums if col_nums else [0])

        return clues

    def _detect_clue_cols(self, clue_img: np.ndarray) -> int:
        """Detect number of sub-cell columns in row clue region via vertical lines."""
        gray = clue_img if len(clue_img.shape) == 2 else cv2.cvtColor(clue_img, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        _, thresh = cv2.threshold(gray, 128, 255, cv2.THRESH_BINARY_INV)

        # Look for vertical lines (both dashed and solid)
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, h // 4))
        v_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, v_kernel)
        v_proj = np.sum(v_lines, axis=0)
        threshold = h * 0.15 * 255

        # Find peaks
        from puzzle_parsers.nonogram.grid_detector import _find_line_positions
        positions = _find_line_positions(v_proj, threshold)
        # Number of columns = separators + 1, but include edges
        if len(positions) >= 2:
            return len(positions) - 1
        # Fallback: estimate from aspect ratio
        return max(1, int(round(w / (h / 11))))  # rough guess

    def _detect_clue_rows(self, clue_img: np.ndarray) -> int:
        """Detect number of sub-cell rows in column clue region via horizontal lines."""
        gray = clue_img if len(clue_img.shape) == 2 else cv2.cvtColor(clue_img, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        _, thresh = cv2.threshold(gray, 128, 255, cv2.THRESH_BINARY_INV)

        # Look for horizontal lines
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (w // 4, 1))
        h_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, h_kernel)
        h_proj = np.sum(h_lines, axis=1)
        threshold = w * 0.15 * 255

        from puzzle_parsers.nonogram.grid_detector import _find_line_positions
        positions = _find_line_positions(h_proj, threshold)
        if len(positions) >= 2:
            return len(positions) - 1
        # Fallback
        return max(1, int(round(h / (w / 10))))

    def _ocr_single_cell(self, reader, cell: np.ndarray, margin: float = 0.2) -> int:
        """OCR a single clue sub-cell, returning the number or 0 if empty."""
        h, w = cell.shape[:2]
        if h < 5 or w < 5:
            return 0

        # Crop inner region to remove border lines
        mx = int(w * margin)
        my = int(h * margin)
        inner = cell[my : h - my, mx : w - mx]
        if inner.size == 0:
            return 0

        # Convert to grayscale — use green channel for red ink images
        if len(inner.shape) == 3:
            gray = inner[:, :, 1]
        else:
            gray = inner

        # Binarize to clean black text on white background
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Zero out top/bottom 4px bands to remove residual border lines
        bh, bw = binary.shape
        strip = 4
        binary[:strip, :] = 0
        binary[bh - strip:, :] = 0
        binary[:, :strip] = 0
        binary[:, bw - strip:] = 0

        # Check if cell has significant content
        pixel_ratio = np.count_nonzero(binary) / max(1, binary.size)
        if pixel_ratio < 0.03:
            return 0

        # Invert to white bg / black text, then add generous padding
        clean = 255 - binary
        ih, iw = clean.shape
        pad = max(ih, iw) // 2
        padded = cv2.copyMakeBorder(clean, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=255)

        results = reader.readtext(
            padded,
            allowlist="0123456789",
            detail=0,
            paragraph=False,
        )

        if not results:
            return 0

        text = "".join(r.strip() for r in results)
        if text.isdigit() and int(text) > 0:
            return int(text)
        return 0

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = NonogramBoard(**data.grid)
            for clue in board.rowClues + board.colClues:
                if not all(n >= 0 for n in clue):
                    return False
                if len(clue) == 0:
                    return False
            return True
        except Exception:
            return False
