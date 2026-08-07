from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.tentaishow.grid_detector import detect_tentaishow_grid
from puzzle_parsers.tentaishow.models import TentaishowBoard, TentaishowDot

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class TentaishowParser(PuzzleParser):
    puzzle_type = "tentaishow"

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        # No OCR needed (no numbers), but accept the backend for a uniform
        # constructor signature across parsers.
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> TentaishowBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> TentaishowBoard:
        geom = detect_tentaishow_grid(img_array, debug_dir=debug_dir)

        rows = geom.rows
        cols = geom.cols
        pitch_x = geom.warp_w / cols
        pitch_y = geom.warp_h / rows

        # Snap each detected dot to the nearest doubled coordinate. A cell
        # (r, c) center is (2r+1, 2c+1); doubled = round(2 * pixel / pitch).
        # Track the rounding error so we can dedup near-duplicate detections.
        candidates: list[tuple[float, int, int, int]] = []
        for d in geom.dots:
            fdc = (d.cx / pitch_x) * 2
            fdr = (d.cy / pitch_y) * 2
            dc = max(1, min(2 * cols - 1, int(round(fdc))))
            dr = max(1, min(2 * rows - 1, int(round(fdr))))
            err = (fdr - dr) ** 2 + (fdc - dc) ** 2
            candidates.append((err, dr, dc, d.color))

        # Two real galaxy centers are never within Chebyshev distance 1 in
        # doubled coords (that would be half a cell apart), so any such pair is
        # a split/duplicate detection. Greedily accept dots by ascending
        # rounding error and reject any that collide with an accepted one.
        candidates.sort(key=lambda t: t[0])
        accepted: list[TentaishowDot] = []
        for _err, dr, dc, color in candidates:
            if any(
                abs(a.dr - dr) <= 1 and abs(a.dc - dc) <= 1 for a in accepted
            ):
                continue
            accepted.append(TentaishowDot(dr=dr, dc=dc, color=color))

        dots = sorted(accepted, key=lambda t: (t.dr, t.dc))
        return TentaishowBoard(width=cols, height=rows, dots=dots)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = TentaishowBoard(**data.grid)
            if board.width < 2 or board.height < 2:
                return False
            if not board.dots:
                return False
            seen: set[tuple[int, int]] = set()
            for dot in board.dots:
                if dot.color not in (0, 1):
                    return False
                if dot.dr < 1 or dot.dr > 2 * board.height - 1:
                    return False
                if dot.dc < 1 or dot.dc > 2 * board.width - 1:
                    return False
                key = (dot.dr, dot.dc)
                if key in seen:
                    return False
                seen.add(key)
            return True
        except Exception:
            return False

    def to_json(self, board: TentaishowBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
