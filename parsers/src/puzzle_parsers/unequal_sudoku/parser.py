"""Unequal sudoku (不等号ナンプレ) parser.

The board is a fixed 9x9 lattice of separate squares (see ``grid_detector``).
Givens are read with the shared EasyOCR cell reader. The inequality signs in the
gaps are read geometrically: a chevron is narrow at its tip and wide at its open
end, so whichever end of the ink has the smaller spread across the gap is the
tip, and the tip faces the smaller cell.
"""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.cell_ocr import crop_cell, read_cells
from puzzle_parsers.debug_overlay import save_cell_labels
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.unequal_sudoku.grid_detector import SIZE, SquareLattice, detect_lattice
from puzzle_parsers.unequal_sudoku.models import UnequalSudokuBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend

# Gap crop trims, as fractions of the gap: off the cell edges along the gap axis
# (anti-aliased outline), and off the ends across it.
_GAP_MARGIN_ALONG = 0.08
_GAP_MARGIN_ACROSS = 0.05
# Least ink (fraction of the gap crop) for a sign to be there at all.
_MIN_SIGN_INK = 0.01
# The tip end's spread must be under this fraction of the open end's.
_TIP_RATIO = 0.8


def sign_direction(mask: NDArray, horizontal: bool) -> int:
    """Read one chevron from a gap's ink mask (ink = nonzero).

    ``horizontal``: the gap lies between left/right cells and holds < or >.
    Returns 1 when the tip faces the first cell (left / upper: ``<`` / ``∧``),
    2 when it faces the second (``>`` / ``∨``), 0 when the gap holds no sign.
    """
    if not horizontal:
        mask = mask.T  # rows become columns: ∧ reads as <, ∨ as >
    mask = (mask > 0).astype(np.uint8)
    if mask.sum() < _MIN_SIGN_INK * mask.size:
        return 0
    # The chevron is the largest blob; specks and outline slivers are dropped.
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if n <= 1:
        return 0
    k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    if stats[k, cv2.CC_STAT_AREA] < _MIN_SIGN_INK * mask.size:
        return 0
    blob = labels == k
    cols = np.where(blob.any(axis=0))[0]
    if len(cols) < 3:
        return 0
    spread = []
    for c in range(cols[0], cols[-1] + 1):
        ys = np.where(blob[:, c])[0]
        spread.append(ys[-1] - ys[0] + 1 if len(ys) else 0)
    spread = np.array(spread, dtype=float)
    end = max(1, len(spread) // 4)
    first, last = spread[:end].mean(), spread[-end:].mean()
    if first < _TIP_RATIO * last:
        return 1
    if last < _TIP_RATIO * first:
        return 2
    return 0


class UnequalSudokuParser(PuzzleParser):
    puzzle_type = "unequal_sudoku"
    locates_board = True

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array, report_board=True)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> UnequalSudokuBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self,
        img_array: NDArray,
        debug_dir: str | None = None,
        report_board: bool = False,
    ) -> UnequalSudokuBoard:
        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
        lattice = detect_lattice(gray)
        if report_board:
            self._board_located(img_array, lattice.quad())

        rois = [
            [crop_cell(gray, s.y, s.bottom, s.x, s.right) for s in row]
            for row in lattice.cells
        ]
        hints = read_cells(self._ocr, rois, allow_multi_digits=False)

        ink = _ink_mask(gray, lattice)
        right, down = _read_signs(ink, lattice)
        board = UnequalSudokuBoard(hints=hints, right=right, down=down)

        if debug_dir:
            _save_debug(img_array, lattice, board, Path(debug_dir))
        return board

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = UnequalSudokuBoard(**data.grid)
        except Exception:
            return False

        def shaped(grid: list[list[int]], rows: int, cols: int, hi: int) -> bool:
            return len(grid) == rows and all(
                len(r) == cols and all(0 <= v <= hi for v in r) for r in grid
            )

        return (
            shaped(board.hints, SIZE, SIZE, 9)
            and shaped(board.right, SIZE, SIZE - 1, 2)
            and shaped(board.down, SIZE - 1, SIZE, 2)
        )


def _ink_mask(gray: NDArray, lattice: SquareLattice) -> NDArray:
    """Dark-ink mask, thresholded (Otsu) over the board area only.

    The gaps carry light box shading; Otsu over the board separates it from the
    printed ink, while the page outside the board can't skew the cut.
    """
    quad = lattice.quad()
    x0, y0 = np.floor(quad.min(axis=0)).astype(int)
    x1, y1 = np.ceil(quad.max(axis=0)).astype(int)
    region = gray[max(0, y0):y1, max(0, x0):x1]
    cut, _ = cv2.threshold(region, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return (gray < cut).astype(np.uint8) * 255


def _read_signs(ink: NDArray, lattice: SquareLattice) -> tuple[list[list[int]], list[list[int]]]:
    cells = lattice.cells
    right = [[0] * (SIZE - 1) for _ in range(SIZE)]
    down = [[0] * SIZE for _ in range(SIZE - 1)]
    for r in range(SIZE):
        for c in range(SIZE - 1):
            a, b = cells[r][c], cells[r][c + 1]
            mask = crop_cell(
                ink, max(a.y, b.y), min(a.bottom, b.bottom), a.right, b.x,
                margin=(_GAP_MARGIN_ACROSS, _GAP_MARGIN_ALONG),
            )
            right[r][c] = sign_direction(mask, horizontal=True)
    for r in range(SIZE - 1):
        for c in range(SIZE):
            a, b = cells[r][c], cells[r + 1][c]
            mask = crop_cell(
                ink, a.bottom, b.y, max(a.x, b.x), min(a.right, b.right),
                margin=(_GAP_MARGIN_ALONG, _GAP_MARGIN_ACROSS),
            )
            down[r][c] = sign_direction(mask, horizontal=False)
    return right, down


_SIGN_GLYPH = {(True, 1): "<", (True, 2): ">", (False, 1): "^", (False, 2): "v"}


def _save_debug(image: NDArray, lattice: SquareLattice, board: UnequalSudokuBoard, out: Path) -> None:
    """``04_cells.png``: the lattice as a 17x17 grid of alternating cell and gap
    bands (median edges per lattice row / column), each cell labelled with its
    given and each gap with its sign."""
    cells = lattice.cells
    v_lines: list[int] = []
    h_lines: list[int] = []
    for i in range(SIZE):
        v_lines += [int(np.median([row[i].x for row in cells])), int(np.median([row[i].right for row in cells]))]
        h_lines += [int(np.median([s.y for s in cells[i]])), int(np.median([s.bottom for s in cells[i]]))]
    span = 2 * SIZE - 1
    labels: list[list[str | None]] = [[None] * span for _ in range(span)]
    for r in range(SIZE):
        for c in range(SIZE):
            labels[2 * r][2 * c] = str(board.hints[r][c]) if board.hints[r][c] else None
            if c < SIZE - 1:
                labels[2 * r][2 * c + 1] = _SIGN_GLYPH.get((True, board.right[r][c]), "?")
            if r < SIZE - 1:
                labels[2 * r + 1][2 * c] = _SIGN_GLYPH.get((False, board.down[r][c]), "?")
    grid = BoardGrid(warped=image, h_lines=h_lines, v_lines=v_lines)
    save_cell_labels(grid, labels, out / "04_cells.png")
