from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.cell_extraction import (
    GridGeometry,
    detect_internal_grid,
    extract_cells_from_geometry,
)
from puzzle_parsers.grid_utils import order_points
from puzzle_parsers.recognition import GeminiOcrBackend, OcrBackend
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.sudoku.models import SudokuBoard
class SudokuParser(PuzzleParser):
    puzzle_type = "sudoku"

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    @property
    def ocr(self) -> OcrBackend:
        if self._ocr is None:
            self._ocr = GeminiOcrBackend()
        return self._ocr

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> SudokuBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, image_path=str(image_path), debug_dir=debug_dir)

    def _parse_image(
        self,
        img_array: np.ndarray,
        image_path: str | None = None,
        debug_dir: str | None = None,
    ) -> SudokuBoard:
        if self.ocr.supports_full_image and image_path:
            return self._parse_via_full_image(image_path)
        return self._parse_via_grid_detection(img_array, debug_dir=debug_dir)

    def _parse_via_full_image(self, image_path: str) -> SudokuBoard:
        all_hints = self.ocr.recognize_full_image(image_path, num_subboards=1)
        return SudokuBoard(hints=all_hints[0])

    def _parse_via_grid_detection(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> SudokuBoard:
        debug_path = Path(debug_dir) if debug_dir else None
        if debug_path:
            debug_path.mkdir(parents=True, exist_ok=True)

        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
        border_pts = _find_single_board_border(gray)

        if debug_path:
            vis = img_array.copy()
            cv2.polylines(vis, [border_pts.astype(int)], True, (0, 255, 0), 3)
            cv2.imwrite(str(debug_path / "01_border.png"), vis)

        # Warp to a square
        warp_size = 540
        dst = np.float32([[0, 0], [warp_size, 0], [warp_size, warp_size], [0, warp_size]])
        M = cv2.getPerspectiveTransform(border_pts, dst)
        warped = cv2.warpPerspective(img_array, M, (warp_size, warp_size))

        if debug_path:
            cv2.imwrite(str(debug_path / "02_warped.png"), warped)

        # Detect internal grid lines
        warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
        h_lines, v_lines = detect_internal_grid(warped_gray, warp_size)

        # Compute cell geometry
        cell_w = warp_size / 9.0
        cell_h = warp_size / 9.0
        grid_x0 = 0.0
        grid_y0 = 0.0

        if h_lines and len(h_lines) >= 8:
            refined_cell_h = (h_lines[-1] - h_lines[0]) / (len(h_lines) - 1)
            refined_y0 = float(h_lines[0]) - refined_cell_h
            if abs(refined_y0) < cell_h * 0.4:
                cell_h = refined_cell_h
                grid_y0 = refined_y0
        if v_lines and len(v_lines) >= 8:
            refined_cell_w = (v_lines[-1] - v_lines[0]) / (len(v_lines) - 1)
            refined_x0 = float(v_lines[0]) - refined_cell_w
            if abs(refined_x0) < cell_w * 0.4:
                cell_w = refined_cell_w
                grid_x0 = refined_x0

        if debug_path:
            vis = warped.copy()
            for y in h_lines:
                cv2.line(vis, (0, y), (warp_size, y), (0, 180, 0), 1)
            for x in v_lines:
                cv2.line(vis, (x, 0), (x, warp_size), (180, 0, 0), 1)
            cv2.imwrite(str(debug_path / "03_gridlines.png"), vis)

        geometry = GridGeometry(
            warped=warped, grid_x0=grid_x0, grid_y0=grid_y0,
            cell_w=cell_w, cell_h=cell_h,
            h_lines=h_lines, v_lines=v_lines,
        )

        cells = extract_cells_from_geometry(geometry)
        hints = self.ocr.recognize_cells(cells)

        if debug_path:
            _save_cells_debug(debug_path, cells)

        return SudokuBoard(hints=hints)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = SudokuBoard(**data.grid)
            if len(board.hints) != 9:
                return False
            for row in board.hints:
                if len(row) != 9:
                    return False
                if not all(0 <= v <= 9 for v in row):
                    return False
            return True
        except Exception:
            return False


def _find_single_board_border(gray: np.ndarray) -> np.ndarray:
    """Find the 4 corners of a single sudoku board using contour detection."""
    h, w = gray.shape

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    binary = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 11, 3,
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    binary = cv2.dilate(binary, kernel, iterations=1)

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return np.float32([[0, 0], [w, 0], [w, h], [0, h]])

    largest = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest)
    img_area = h * w

    if area < img_area * 0.1:
        return np.float32([[0, 0], [w, 0], [w, h], [0, h]])

    peri = cv2.arcLength(largest, True)
    approx = cv2.approxPolyDP(largest, 0.02 * peri, True)

    if len(approx) == 4:
        pts = approx.reshape(4, 2).astype(np.float32)
        return order_points(pts)

    rect = cv2.minAreaRect(largest)
    box = cv2.boxPoints(rect)
    return order_points(np.float32(box))


def _save_cells_debug(debug_path: Path, cells: list[list[np.ndarray]]) -> None:
    cell_display = 60
    composite = np.ones((9 * cell_display, 9 * cell_display, 3), dtype=np.uint8) * 255
    for r in range(9):
        for c in range(9):
            cell = cells[r][c]
            resized = cv2.resize(cell, (cell_display, cell_display))
            if len(resized.shape) == 2:
                resized = cv2.cvtColor(resized, cv2.COLOR_GRAY2BGR)
            composite[
                r * cell_display: (r + 1) * cell_display,
                c * cell_display: (c + 1) * cell_display,
            ] = resized
    cv2.imwrite(str(debug_path / "04_cells.png"), composite)
