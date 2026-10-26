from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.masyu.grid_detector import detect_masyu_grid
from puzzle_parsers.masyu.models import MasyuBoard

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class MasyuParser(PuzzleParser):
    puzzle_type = "masyu"

    def __init__(
        self,
        ocr_backend: OcrBackend | None = None,
        recognizer: object | None = None,
    ) -> None:
        pass

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self,
        image_path: str | Path,
        debug_dir: str | None = None,
    ) -> MasyuBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self,
        img_array: np.ndarray,
        debug_dir: str | None = None,
    ) -> MasyuBoard:
        geom = detect_masyu_grid(img_array, debug_dir=debug_dir)

        debug_path = Path(debug_dir) if debug_dir else None
        rows = geom.rows
        cols = geom.cols

        cells = _detect_circles(
            geom.warped_gray, geom.h_lines, geom.v_lines, rows, cols, geom.cell_h
        )

        if debug_path:
            vis = geom.warped.copy()
            labels = {0: ".", 1: "W", 2: "B"}
            for r in range(rows):
                for c in range(cols):
                    val = cells[r][c]
                    label = labels.get(val, "?")
                    cx = (geom.v_lines[c] + geom.v_lines[c + 1]) // 2
                    cy = (geom.h_lines[r] + geom.h_lines[r + 1]) // 2
                    cv2.putText(
                        vis, label, (cx - 5, cy + 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1,
                    )
            cv2.imwrite(str(debug_path / "04_classified.png"), vis)

        return MasyuBoard(cells=cells)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = MasyuBoard(**data.grid)
            for row in board.cells:
                if not all(0 <= v <= 2 for v in row):
                    return False
            return True
        except Exception:
            return False


# Fraction of a cell trimmed off each side before the 3x3 split, to keep the
# dashed grid line on the cell border out of the outer tiles.
_CELL_INSET = 0.10
# A cell's ink must be this much darker than its own paper for any mark to count;
# below it the cell is blank. Relative to the cell's paper, so it holds whether
# the ink is near-black (phone photo) or light grey (magazine scanner print).
_MIN_INK_CONTRAST = 0.22
# Inked fraction of the centre tile for "filled" (black) vs "hollow" (white).
_CENTER_FILLED = 0.5
_CENTER_HOLLOW = 0.30
# Mean inked fraction across the 8 surrounding tiles for a ring to count.
_RING_PRESENT = 0.08


def _detect_circles(
    gray: np.ndarray,
    h_lines: list[int],
    v_lines: list[int],
    rows: int,
    cols: int,
    cell_size: float,
) -> list[list[int]]:
    """Classify each grid cell as empty (0), white circle (1) or black (2).

    Classification is a 3x3 ink *topology*, not an absolute-darkness test, which
    is what lets one rule hold across scan types: a phone photo inks the glyphs
    near-black while a magazine scanner prints them light grey (a >10x range in
    absolute darkness), so any fixed grey cutoff fits one and loses the other.
    Instead each cell is binarised against *its own* paper-white (80th pct) with
    a relative contrast floor, split into a 3x3 of tiles, and read by shape:

    * centre tile mostly inked -> solid disk -> **black**;
    * centre tile hollow but ink in the surrounding ring -> **white**;
    * otherwise (no ink, or ink only in the centre-but-not-filled) -> empty.

    The ring is pooled over all 8 outer tiles rather than the 4 edges: a circle
    sitting slightly off-centre in its detected cell crosses the 3x3 mainly
    through the corner tiles, so an edge-only test misses it. A small inset drops
    the cell's dashed border line before the split so it can't fake a ring.
    """
    cells = [[0] * cols for _ in range(rows)]
    g = gray.astype(float)

    for r in range(rows):
        y0, y1 = h_lines[r], h_lines[r + 1]
        for c in range(cols):
            x0, x1 = v_lines[c], v_lines[c + 1]
            ch = y1 - y0
            cw = x1 - x0
            if ch <= 8 or cw <= 8:
                continue

            iy = int(ch * _CELL_INSET)
            ix = int(cw * _CELL_INSET)
            cell = g[y0 + iy:y1 - iy, x0 + ix:x1 - ix]
            ph, pw = cell.shape
            if ph < 9 or pw < 9:
                continue

            paper = float(np.percentile(cell, 80))
            darkest = float(np.percentile(cell, 5))
            if paper <= 1.0 or (paper - darkest) / paper < _MIN_INK_CONTRAST:
                continue  # no ink stands out from this cell's paper -> empty

            # Binarise against this cell's own ink range, then read the 3x3 shape.
            thr = paper - 0.5 * (paper - darkest)
            ink = cell < thr
            ys = (0, ph // 3, 2 * ph // 3, ph)
            xs = (0, pw // 3, 2 * pw // 3, pw)
            tiles = np.array([
                [ink[ys[i]:ys[i + 1], xs[j]:xs[j + 1]].mean() for j in range(3)]
                for i in range(3)
            ])
            center = tiles[1, 1]
            ring = (tiles.sum() - center) / 8.0

            if center >= _CENTER_FILLED:
                cells[r][c] = 2  # filled centre -> black circle
            elif center <= _CENTER_HOLLOW and ring >= _RING_PRESENT:
                cells[r][c] = 1  # hollow centre, ink around it -> white circle

    return cells
