from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.cell_ocr import read_grid_clues
from puzzle_parsers.combo_sudoku.layout import ComboLayout, LayoutError, find_layout
from puzzle_parsers.combo_sudoku.models import ComboSudokuBoard, SubBoard
from puzzle_parsers.debug_overlay import save_cell_labels
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import OcrBackend


class ComboSudokuParser(PuzzleParser):
    """Reads any arrangement of overlapping 9x9 sudoku boards.

    The layout comes from the shared cell lattice (``layout.find_layout``).
    Every room is then warped flat onto one canvas at native resolution and
    every cell is read once, so a cell two boards share can't be read two
    ways; the canvas is sliced into the sub-boards afterwards.
    """

    puzzle_type = "combo_sudoku"

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    @property
    def ocr(self) -> OcrBackend:
        if self._ocr is None:
            from puzzle_parsers.recognition import EasyOcrBackend

            self._ocr = EasyOcrBackend()
        return self._ocr

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> ComboSudokuBoard:
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: NDArray, debug_dir: str | None = None) -> ComboSudokuBoard:
        debug_path = Path(debug_dir) if debug_dir else None
        if debug_path:
            debug_path.mkdir(parents=True, exist_ok=True)

        layout = find_layout(img_array)
        if debug_path:
            _save_lattice_debug(debug_path / "01_lattice.png", layout)

        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
        canvas, lines = flatten_rooms(gray, layout)
        values = read_grid_clues(self.ocr, canvas, lines[0], lines[1], allow_multi_digits=False)

        boards = _pick_boards(layout.boards, values)
        subboards = [
            SubBoard(x=x, y=y, hints=[row[3 * x:3 * x + 9] for row in values[3 * y:3 * y + 9]])
            for x, y in boards
        ]
        result = ComboSudokuBoard(room_width=3, room_height=3, subboards=subboards)

        if debug_path:
            _save_cells_debug(debug_path / "02_cells.png", canvas, lines, values, boards)
            (debug_path / "03_result.json").write_text(json.dumps(result.model_dump(), indent=2) + "\n")
        return result

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = ComboSudokuBoard(**data.grid)
        except Exception:
            return False
        return bool(board.subboards) and all(
            len(sub.hints) == 9
            and all(len(row) == 9 and all(0 <= v <= 9 for v in row) for row in sub.hints)
            for sub in board.subboards
        )

    def to_json(self, board: ComboSudokuBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")


def flatten_rooms(
    gray: NDArray, layout: ComboLayout
) -> tuple[NDArray, tuple[list[int], list[int]]]:
    """Every room warped flat onto one white canvas, plus its grid lines.

    Each room gets its own homography from its own junctions, so a curved
    page or a fold only bends the rooms it runs through.
    """
    p = max(24, int(round(layout.cell_px)))
    t = 3 * p
    canvas = np.full((layout.room_rows * t + 1, layout.room_cols * t + 1), 255, np.uint8)
    for (r, c), pts in layout.rooms.items():
        found = ~np.isnan(pts[..., 0])
        ii, jj = np.nonzero(found)
        dst = np.stack([jj * p, ii * p], axis=1).astype(np.float32)
        homography, _ = cv2.findHomography(pts[found], dst, 0)
        tile = cv2.warpPerspective(gray, homography, (t + 1, t + 1),
                                   flags=cv2.INTER_LINEAR, borderValue=255)
        canvas[r * t:r * t + t + 1, c * t:c * t + t + 1] = tile
    h_lines = [i * p for i in range(layout.room_rows * 3 + 1)]
    v_lines = [j * p for j in range(layout.room_cols * 3 + 1)]
    return canvas, (h_lines, v_lines)


def sudoku_conflicts(hints: list[list[int]]) -> int:
    """Repeated digits across the rows, columns and boxes of one board."""
    units = [hints[r] for r in range(9)]
    units += [[hints[r][c] for r in range(9)] for c in range(9)]
    units += [[hints[br + i][bc + j] for i in range(3) for j in range(3)]
              for br in (0, 3, 6) for bc in (0, 3, 6)]
    return sum(len(d) - len(set(d)) for d in ([v for v in u if v] for u in units))


def _pick_boards(
    candidates: list[list[tuple[int, int]]], values: list[list[int]]
) -> list[tuple[int, int]]:
    """The board set the clues agree with when the shape allows several."""
    if len(candidates) == 1:
        return candidates[0]

    def conflicts(boards: list[tuple[int, int]]) -> int:
        return sum(
            sudoku_conflicts([row[3 * x:3 * x + 9] for row in values[3 * y:3 * y + 9]])
            for x, y in boards
        )

    scored = sorted(candidates, key=conflicts)
    if conflicts(scored[0]) == conflicts(scored[1]):
        raise LayoutError(
            "This shape fits more than one set of sudoku boards and the clues "
            "don't tell them apart; please enter the layout by hand."
        )
    return scored[0]


def _save_lattice_debug(path: Path, layout: ComboLayout) -> None:
    vis = cv2.cvtColor(layout.debug["work"], cv2.COLOR_GRAY2BGR)
    pr, pc = layout.debug["phase"]
    for (r, c), pt in layout.debug["grid"].items():
        room_corner = (r - pr) % 3 == 0 and (c - pc) % 3 == 0
        cv2.circle(vis, (int(pt[0]), int(pt[1])), 3, (0, 0, 255) if room_corner else (0, 170, 0), -1)
    cv2.imwrite(str(path), vis)


def _save_cells_debug(
    path: Path,
    canvas: NDArray,
    lines: tuple[list[int], list[int]],
    values: list[list[int]],
    boards: list[tuple[int, int]],
) -> None:
    vis = cv2.cvtColor(canvas, cv2.COLOR_GRAY2BGR)
    h_lines, v_lines = lines
    for x, y in boards:
        cv2.rectangle(vis, (v_lines[3 * x], h_lines[3 * y]),
                      (v_lines[3 * x + 9], h_lines[3 * y + 9]), (255, 120, 0), 3)
    grid = BoardGrid(warped=vis, h_lines=h_lines, v_lines=v_lines)
    labels = [[str(v) if v else None for v in row] for row in values]
    save_cell_labels(grid, labels, path)
