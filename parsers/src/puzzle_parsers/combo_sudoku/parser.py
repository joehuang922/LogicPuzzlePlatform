from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.combo_sudoku.grid_detector import (
    CROSS_LAYOUT,
    detect_grid_geometry,
    detect_subboards,
    extract_cells_for_subboard,
    extract_cells_from_geometry,
    save_cell_debug,
)
from puzzle_parsers.combo_sudoku.models import ComboSudokuBoard, SubBoard
from puzzle_parsers.recognition import GeminiOcrBackend, OcrBackend
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.validate import validate_canon


class ComboSudokuParser(PuzzleParser):
    puzzle_type = "combo_sudoku"

    def __init__(
        self,
        ocr_backend: OcrBackend | None = None,
        layout: list[tuple[int, int]] | None = None,
    ) -> None:
        self._ocr = ocr_backend
        self._layout = layout  # None means auto-detect

    @property
    def ocr(self) -> OcrBackend:
        if self._ocr is None:
            self._ocr = GeminiOcrBackend()
        return self._ocr

    def parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        validate_canon("combo-sudoku", grid)
        return PuzzleData(
            puzzle_type=self.puzzle_type,
            grid=grid,
        )

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> ComboSudokuBoard:
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
    ) -> ComboSudokuBoard:
        if self._layout is not None and self.ocr.supports_full_image and image_path:
            return self._parse_via_full_image(image_path)
        return self._parse_via_grid_detection(img_array, debug_dir=debug_dir)

    def _parse_via_full_image(self, image_path: str) -> ComboSudokuBoard:
        layout = self._layout or CROSS_LAYOUT
        num_subboards = len(layout)
        all_hints = self.ocr.recognize_full_image(image_path, num_subboards)

        subboards = []
        for i, hints in enumerate(all_hints):
            pos = layout[i] if i < len(layout) else (0, 0)
            subboards.append(SubBoard(x=pos[0], y=pos[1], hints=hints))
        return ComboSudokuBoard(room_width=3, room_height=3, subboards=subboards)

    def _parse_via_grid_detection(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> ComboSudokuBoard:
        # Auto-detect mode: find individual subboards
        if self._layout is None:
            return self._parse_via_subboard_detection(img_array, debug_dir=debug_dir)

        # Explicit layout: use the legacy single-border approach
        geometry = detect_grid_geometry(img_array, self._layout, debug_dir=debug_dir)

        if debug_dir:
            save_cell_debug(debug_dir, geometry, self._layout)

        subboards: list[SubBoard] = []
        for room_x, room_y in self._layout:
            cells = extract_cells_for_subboard(geometry.warped, geometry, room_x, room_y)
            hints = self.ocr.recognize_cells(cells)
            subboards.append(SubBoard(x=room_x, y=room_y, hints=hints))

        return ComboSudokuBoard(room_width=3, room_height=3, subboards=subboards)

    def _parse_via_subboard_detection(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> ComboSudokuBoard:
        """Auto-detect subboards by finding bold-bordered 9x9 grids."""
        detected = detect_subboards(img_array, debug_dir=debug_dir)

        if not detected:
            # Fallback to cross layout with legacy approach
            return self._parse_via_grid_detection_with_layout(
                img_array, CROSS_LAYOUT, debug_dir
            )

        subboards: list[SubBoard] = []
        for i, sb in enumerate(detected):
            cells = extract_cells_from_geometry(sb.geometry)
            hints = self.ocr.recognize_cells(cells)
            subboards.append(SubBoard(x=sb.room_x, y=sb.room_y, hints=hints))

            if debug_dir:
                _save_cells_debug(debug_dir, i, sb.room_x, sb.room_y, cells)

        board = ComboSudokuBoard(room_width=3, room_height=3, subboards=subboards)

        # Cross-validate overlapping regions
        board = _validate_overlaps(board, debug_dir=debug_dir)

        if debug_dir:
            _save_ocr_result(debug_dir, board)

        return board

    def _parse_via_grid_detection_with_layout(
        self, img_array: np.ndarray, layout: list[tuple[int, int]], debug_dir: str | None = None
    ) -> ComboSudokuBoard:
        geometry = detect_grid_geometry(img_array, layout, debug_dir=debug_dir)
        if debug_dir:
            save_cell_debug(debug_dir, geometry, layout)

        subboards: list[SubBoard] = []
        for room_x, room_y in layout:
            cells = extract_cells_for_subboard(geometry.warped, geometry, room_x, room_y)
            hints = self.ocr.recognize_cells(cells)
            subboards.append(SubBoard(x=room_x, y=room_y, hints=hints))

        return ComboSudokuBoard(room_width=3, room_height=3, subboards=subboards)

    def validate(self, data: PuzzleData) -> bool:  # noqa: C901
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = ComboSudokuBoard(**data.grid)
            for sub in board.subboards:
                if len(sub.hints) != 9:
                    return False
                for row in sub.hints:
                    if len(row) != 9:
                        return False
                    if not all(0 <= v <= 9 for v in row):
                        return False
            return True
        except Exception:
            return False

    def to_json(self, board: ComboSudokuBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")


def _validate_overlaps(
    board: ComboSudokuBoard, debug_dir: str | None = None
) -> ComboSudokuBoard:
    """Cross-validate overlapping regions between adjacent subboards.

    For two boards where board_a's bottom-right overlaps board_b's top-left:
    - If one reads 0 and other reads non-zero, pick the non-zero value
    - If both non-zero and agree, keep the value
    - If both non-zero and disagree, flag but keep original (can't resolve)
    """
    subs = board.subboards
    mismatches: list[str] = []

    for i in range(len(subs)):
        for j in range(i + 1, len(subs)):
            a = subs[i]
            b = subs[j]

            # Determine overlap: b's origin relative to a's origin in room coords
            dx = b.x - a.x
            dy = b.y - a.y

            # Each subboard is 3 rooms wide/tall. Overlap exists if
            # 0 < dx < 3 and 0 < dy < 3 (or symmetric)
            if not (0 < dx < 3 and 0 < dy < 3):
                continue

            # Overlapping region in a: rows [dy*3 : 9], cols [dx*3 : 9]
            # Overlapping region in b: rows [0 : (3-dy)*3], cols [0 : (3-dx)*3]
            a_row_start = dy * 3
            a_col_start = dx * 3
            overlap_rows = 9 - a_row_start
            overlap_cols = 9 - a_col_start

            for r in range(overlap_rows):
                for c in range(overlap_cols):
                    va = a.hints[a_row_start + r][a_col_start + c]
                    vb = b.hints[r][c]

                    if va == vb:
                        continue
                    elif va == 0 and vb != 0:
                        a.hints[a_row_start + r][a_col_start + c] = vb
                    elif vb == 0 and va != 0:
                        b.hints[r][c] = va
                    else:
                        mismatches.append(
                            f"board({a.x},{a.y})[{a_row_start+r}][{a_col_start+c}]={va} "
                            f"vs board({b.x},{b.y})[{r}][{c}]={vb}"
                        )

    if debug_dir and mismatches:
        overlap_path = Path(debug_dir) / "07_overlap_mismatches.txt"
        overlap_path.write_text("\n".join(mismatches) + "\n")

    return board


def _save_cells_debug(
    debug_dir: str, idx: int, room_x: int, room_y: int, cells: list[list[np.ndarray]]
) -> None:
    """Save a composite image of extracted cells for a subboard."""
    import cv2 as _cv2

    path = Path(debug_dir)
    path.mkdir(parents=True, exist_ok=True)

    cell_display = 60
    composite = np.ones((9 * cell_display, 9 * cell_display, 3), dtype=np.uint8) * 255
    for r in range(9):
        for c in range(9):
            cell = cells[r][c]
            resized = _cv2.resize(cell, (cell_display, cell_display))
            if len(resized.shape) == 2:
                resized = _cv2.cvtColor(resized, _cv2.COLOR_GRAY2BGR)
            composite[
                r * cell_display: (r + 1) * cell_display,
                c * cell_display: (c + 1) * cell_display,
            ] = resized
    for r in range(10):
        _cv2.line(composite, (0, r * cell_display), (9 * cell_display, r * cell_display), (180, 180, 180), 1)
    for c in range(10):
        _cv2.line(composite, (c * cell_display, 0), (c * cell_display, 9 * cell_display), (180, 180, 180), 1)
    _cv2.imwrite(str(path / f"05_subboard_{idx}_cells_{room_x}_{room_y}.png"), composite)


def _save_ocr_result(debug_dir: str, board: ComboSudokuBoard) -> None:
    """Save OCR results as JSON for debugging."""
    path = Path(debug_dir)
    path.mkdir(parents=True, exist_ok=True)
    result_path = path / "06_ocr_result.json"
    result_path.write_text(json.dumps(board.model_dump(), indent=2) + "\n")
