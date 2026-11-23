"""Mannequin Gate 2 parser (type 43): gray lines traced with OpenCV.

There are no digits or symbols, so no EasyOCR and no Gemini: the board is found with
``detect_mannequin_gate_2_grid`` and its gray strokes are traced into lines by
``tracer.read_gate_lines`` (see that module for how crossings, turns and ends are told apart).
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.mannequin_gate_2.grid_detector import detect_mannequin_gate_2_grid
from puzzle_parsers.mannequin_gate_2.models import MannequinGate2Board
from puzzle_parsers.mannequin_gate_2.tracer import stroke_mask, read_gate_lines
from puzzle_parsers.models import PuzzleData


def format_problems(board: MannequinGate2Board) -> list[str]:
    """The editor's and the API's format rules (mannequinGate2Rules.formatProblems)."""
    problems: list[str] = []
    steps: dict[tuple, int] = {}
    for i, line in enumerate(board.lines):
        if len(line) < 2:
            problems.append(f"line {i + 1} has fewer than 2 cells")
            continue
        seen: set[tuple[int, int]] = set()
        for k, cell in enumerate(line):
            if len(cell) != 2:
                problems.append(f"line {i + 1} has a malformed cell")
                break
            r, c = cell
            if not (0 <= r < board.rows and 0 <= c < board.cols):
                problems.append(f"line {i + 1} leaves the board")
            if (r, c) in seen:
                problems.append(f"line {i + 1} visits a cell twice")
            seen.add((r, c))
            if k == 0:
                continue
            pr, pc = line[k - 1]
            if max(abs(r - pr), abs(c - pc)) != 1:
                problems.append(f"line {i + 1} jumps between cells that aren't neighbours")
                continue
            key = tuple(sorted([(pr, pc), (r, c)]))
            if steps.get(key, i) != i:
                problems.append(f"lines {steps[key] + 1} and {i + 1} share a step")
            steps[key] = i
    return problems


class MannequinGate2Parser(PuzzleParser):
    puzzle_type = "mannequin-gate-2"
    locates_board = True

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> MannequinGate2Board:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> MannequinGate2Board:
        geom = detect_mannequin_gate_2_grid(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.quad)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)
        h_lines, v_lines = list(geom.h_lines), list(geom.v_lines)
        cell = float(np.mean(np.diff(h_lines)) + np.mean(np.diff(v_lines))) / 2
        mask = stroke_mask(warped_gray, cell)
        lines = read_gate_lines(mask, h_lines, v_lines)
        if debug_dir:
            vis = geom.warped.copy()
            vis[mask > 0] = (vis[mask > 0] * 0.4 + np.array([0, 160, 255]) * 0.6).astype(np.uint8)
            cy = [(h_lines[r] + h_lines[r + 1]) // 2 for r in range(geom.rows)]
            cx = [(v_lines[c] + v_lines[c + 1]) // 2 for c in range(geom.cols)]
            for line in lines:
                pts = np.array([[cx[c], cy[r]] for r, c in line], np.int32)
                cv2.polylines(vis, [pts], False, (0, 0, 200), max(2, int(cell * 0.03)))
                cv2.circle(vis, (int(pts[0][0]), int(pts[0][1])), max(3, int(cell * 0.05)), (200, 0, 0), -1)
                cv2.circle(vis, (int(pts[-1][0]), int(pts[-1][1])), max(3, int(cell * 0.05)), (200, 0, 0), -1)
            cv2.imwrite(str(Path(debug_dir) / "04_lines.png"), vis)
        return MannequinGate2Board(rows=geom.rows, cols=geom.cols, lines=lines)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = MannequinGate2Board(**data.grid)
        except Exception:
            return False
        return board.rows >= 1 and board.cols >= 1 and not format_problems(board)

    def to_json(self, board: MannequinGate2Board, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
