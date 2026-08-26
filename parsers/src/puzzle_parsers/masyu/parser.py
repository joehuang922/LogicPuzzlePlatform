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


def _detect_circles(
    gray: np.ndarray,
    h_lines: list[int],
    v_lines: list[int],
    rows: int,
    cols: int,
    cell_size: float,
) -> list[list[int]]:
    """Classify each grid cell as empty (0), white circle (1) or black (2).

    Per-cell classification against a normalised intensity, which is far more
    robust than global HoughCircles on these faint phone-scanned boards. The
    intensity is divided by the 90th-percentile "paper white" so faded/brownish
    prints still normalise to ~1.0 on blank paper. A black circle is a solid
    dark disk (dark cell centre); a white circle is a light centre ringed by a
    dark stroke; anything else is empty.
    """
    cells = [[0] * cols for _ in range(rows)]

    g = gray.astype(float)
    white = float(np.percentile(g, 90))
    if white <= 0:
        return cells

    for r in range(rows):
        y0, y1 = h_lines[r], h_lines[r + 1]
        for c in range(cols):
            x0, x1 = v_lines[c], v_lines[c + 1]
            ch = y1 - y0
            cw = x1 - x0
            if ch <= 2 or cw <= 2:
                continue
            cy = (y0 + y1) / 2
            cx = (x0 + x1) / 2
            rad = min(ch, cw) * 0.5

            yy, xx = np.mgrid[y0:y1, x0:x1]
            dist = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2)
            patch = g[y0:y1, x0:x1] / white

            inner = dist < rad * 0.30
            ring = (dist >= rad * 0.55) & (dist <= rad * 0.92)
            if not inner.any() or not ring.any():
                continue

            center_mean = float(patch[inner].mean())
            ring_dark_frac = float((patch[ring] < 0.5).mean())

            if center_mean < 0.45:
                cells[r][c] = 2  # solid dark disk -> black circle
            elif ring_dark_frac > 0.25:
                cells[r][c] = 1  # light centre, dark stroke -> white circle

    return cells
