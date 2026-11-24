"""Irregular Nonogram (変形ロジック) parser.

See ``grid_detector`` for the board and clue-block detection. Clue digits are read with
the shared EasyOCR path, one number per clue cell (two-digit numbers share a cell).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.cell_ocr import crop_cell, read_cells
from puzzle_parsers.irregular_nonogram.grid_detector import _INK, clue_blocks, detect_irregular, digit_box, pieces
from puzzle_parsers.irregular_nonogram.models import ColClue, IrregularNonogramBoard, RowClue
from puzzle_parsers.models import PuzzleData

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class IrregularNonogramParser(PuzzleParser):
    puzzle_type = "irregular-nonogram"
    locates_board = True

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> IrregularNonogramBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> IrregularNonogramBoard:
        geom = detect_irregular(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.quad)
        board = geom.board
        ys, xs = np.nonzero(board)
        if len(ys) == 0:
            raise ValueError("Could not find the board")
        r0, c0 = int(ys.min()), int(xs.min())
        r1, c1 = int(ys.max()), int(xs.max())
        ps = pieces(board)
        found = clue_blocks(board, geom.ink > _INK)
        # In piece order (rows top to bottom, then columns left to right), as the canon.
        blocks = {k: found[k] for k in sorted(found)}

        # Every clue cell, read in one batch from a pitch-sized square on its digit.
        spans: dict[int, tuple[int, int]] = {}
        crops = []
        lat = geom.lattice
        for k, (_, cells) in blocks.items():
            spans[k] = (len(crops), len(crops) + len(cells))
            crops.extend(
                crop_cell(geom.source, *geom.source_box(digit_box(geom.glyphs, lat.square_box(r, c), lat.pitch)))
                for r, c in cells
            )
        values = read_cells(self._ocr, [crops], allow_multi_digits=True)[0] if crops else []

        row_clues: list[RowClue] = []
        col_clues: list[ColClue] = []
        for k, (side, _) in blocks.items():
            p = ps[k]
            a, b = spans[k]
            clues = [v for v in values[a:b] if v > 0]
            if not clues:
                continue
            if p.axis == "row":
                row_clues.append(RowClue(row=p.line - r0, start=p.start - c0, side=side, clues=clues))
            else:
                col_clues.append(ColClue(col=p.line - c0, start=p.start - r0, side=side, clues=clues))
        row_clues.sort(key=lambda e: (e.row, e.start))
        col_clues.sort(key=lambda e: (e.col, e.start))
        return IrregularNonogramBoard(
            width=c1 - c0 + 1,
            height=r1 - r0 + 1,
            cells=board[r0: r1 + 1, c0: c1 + 1].astype(int).tolist(),
            rowClues=row_clues,
            colClues=col_clues,
        )

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = IrregularNonogramBoard(**data.grid)
        except Exception:
            return False
        if len(board.cells) != board.height or any(len(row) != board.width for row in board.cells):
            return False
        if not any(1 in row for row in board.cells):
            return False
        return bool(board.rowClues or board.colClues)

    def to_json(self, board: IrregularNonogramBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
