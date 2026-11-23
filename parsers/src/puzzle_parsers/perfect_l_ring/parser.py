"""Perfect L-Ring parser (type 42).

The question is L-Ring's (a grid of empty cells and arrows); the extra rule only changes
the solution. So this is L-Ring's parser under its own type: geometry from
``detect_perfect_l_ring_grid``, arrows from Gemini through ``cell_classify``'s
``SymbolTarget`` (codes 1 up, 2 right, 3 down, 4 left).
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from puzzle_parsers.l_ring.parser import LRingParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.perfect_l_ring.grid_detector import detect_perfect_l_ring_grid
from puzzle_parsers.perfect_l_ring.models import PerfectLRingBoard


class PerfectLRingParser(LRingParser):
    puzzle_type = "perfect-l-ring"
    locates_board = True

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> PerfectLRingBoard:
        geom = detect_perfect_l_ring_grid(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.quad)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)
        return PerfectLRingBoard(cells=self._classify_arrows(warped_gray, geom))

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> PerfectLRingBoard:
        return super().parse_file(image_path, debug_dir=debug_dir)

    def validate(self, data: PuzzleData) -> bool:
        # L-Ring's check against this type: a rectangular grid, at least 2x2, of 0-4.
        return super().validate(data)
