"""Slalom puzzle parser.

Strategy:
1. Detect grid, classify walls (black cells) via pixel intensity.
2. Binarize cell crops (Otsu), invert annotated walls (white-on-black text).
3. Use classify_cells with CircledIntegerTarget + DirectedIntegerTarget +
   DashedGateTarget to find start cell, gate annotations, and gate cells.
4. Build gates from DashedGate cells (merge contiguous cells on same line).
5. Assign numbers from DirectedInteger arrows pointing to adjacent gate cells.
"""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.cell_classify import (
    classify_cells,
    CircledIntegerTarget,
    DirectedIntegerTarget,
    DashedGateTarget,
    CircledInteger,
    DirectedInteger,
    DashedGate,
    Empty,
)
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.slalom.grid_detector import (
    SlalomGeometry,
    detect_slalom_grid,
    classify_walls,
)
from puzzle_parsers.slalom.models import SlalomBoard, SlalomGate

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


class SlalomParser(PuzzleParser):
    puzzle_type = "slalom"

    def __init__(
        self,
        ocr_backend: OcrBackend | None = None,
        recognizer: CellRecognizer | None = None,
    ) -> None:
        self._ocr = ocr_backend
        self._recognizer = recognizer

    @property
    def recognizer(self) -> CellRecognizer:
        if self._recognizer is None:
            self._recognizer = GeminiRecognizer()
        return self._recognizer

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        grid = board.model_dump()
        return PuzzleData(puzzle_type=self.puzzle_type, grid=grid)

    def parse_file(
        self,
        image_path: str | Path,
        expected_rows: int | None = None,
        expected_cols: int | None = None,
        debug_dir: str | None = None,
    ) -> SlalomBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(
            img_array,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
            debug_dir=debug_dir,
        )

    def _parse_image(
        self,
        img_array: np.ndarray,
        expected_rows: int | None = None,
        expected_cols: int | None = None,
        debug_dir: str | None = None,
    ) -> SlalomBoard:
        debug_path = Path(debug_dir) if debug_dir else None

        geom = detect_slalom_grid(
            img_array,
            expected_rows=expected_rows,
            expected_cols=expected_cols,
            debug_dir=debug_dir,
        )

        # Step 1: Classify walls
        cells = classify_walls(geom.warped_gray, geom)

        # Step 2: Classify cell contents (circled integers + directed integers)
        # Binarize each cell crop (Otsu) to clean up noise, then:
        # - Plain walls: blank to white so LLM skips them.
        # - Annotated walls (white text on black): invert → black-on-white.
        # - Empty cells with only grid artifacts: become clean white → filtered.
        cell_crops = self._extract_cell_crops(geom)
        for r in range(geom.rows):
            for c in range(geom.cols):
                cell_crops[r][c] = self._binarize_cell(cell_crops[r][c])
                if cells[r][c] == 1:
                    if self._wall_has_text(cell_crops[r][c]):
                        cell_crops[r][c] = 255 - cell_crops[r][c]
                    else:
                        cell_crops[r][c] = np.ones_like(cell_crops[r][c]) * 255

        classifications = classify_cells(
            self.recognizer,
            cell_crops,
            [CircledIntegerTarget(), DirectedIntegerTarget(), DashedGateTarget()],
        )

        # Step 3: Find start cell
        start = {"row": 0, "col": 0}
        gate_count = 0
        for r in range(geom.rows):
            for c in range(geom.cols):
                cls = classifications[r][c]
                if isinstance(cls, CircledInteger):
                    start = {"row": r, "col": c}
                    gate_count = cls.value

        # Step 4: Infer all gates from dashed-gate cells, then assign numbers
        # from directed integers.
        all_gates = self._infer_gates_from_dashed(classifications, cells, geom)
        self._assign_gate_numbers(classifications, all_gates, geom)

        # If gate_count wasn't found via circled integer, use total detected
        if gate_count == 0:
            gate_count = len(all_gates)

        if debug_path:
            self._save_debug(debug_path, geom, cells, classifications, all_gates, start)

        return SlalomBoard(
            cells=cells,
            start=start,
            gateCount=gate_count,
            gates=all_gates,
        )

    @staticmethod
    def _binarize_cell(cell: NDArray) -> NDArray:
        """Binarize a grayscale cell crop using Otsu's method.

        Eliminates faint grid-line artifacts and noise, making empty cells
        cleanly white and text/walls cleanly black or white.
        """
        _, binary = cv2.threshold(cell, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return binary

    @staticmethod
    def _wall_has_text(cell: NDArray) -> bool:
        """Detect if a dark (wall) cell contains white text/arrows.

        Checks if the central region has a meaningful amount of bright pixels
        (indicating white text on black background).
        """
        h, w = cell.shape[:2]
        margin_y = int(h * 0.15)
        margin_x = int(w * 0.15)
        center = cell[margin_y:h - margin_y, margin_x:w - margin_x]
        if center.size == 0:
            return False
        bright_ratio = np.sum(center > 180) / center.size
        return bright_ratio > 0.05

    def _extract_cell_crops(self, geom: SlalomGeometry) -> list[list[NDArray]]:
        """Extract cell ROI images for LLM classification."""
        cell_crops: list[list[NDArray]] = []
        for r in range(geom.rows):
            row_crops: list[NDArray] = []
            for c in range(geom.cols):
                y1 = geom.h_lines[r]
                y2 = geom.h_lines[r + 1]
                x1 = geom.v_lines[c]
                x2 = geom.v_lines[c + 1]
                roi = geom.warped_gray[y1:y2, x1:x2]
                row_crops.append(roi)
            cell_crops.append(row_crops)
        return cell_crops

    def _infer_gates_from_dashed(
        self,
        classifications: list[list],
        cells: list[list[int]],
        geom: SlalomGeometry,
    ) -> list[SlalomGate]:
        """Build gates from all DashedGate cells. Each dashed cell becomes a
        unit-length gate on the indicated grid line. Cells on the same gate
        (same orientation + line + contiguous span) are merged.
        """
        rows, cols = geom.rows, geom.cols
        raw_gates: list[tuple[str, int, int]] = []  # (orientation, line, position)

        for r in range(rows):
            for c in range(cols):
                cls = classifications[r][c]
                if not isinstance(cls, DashedGate):
                    continue

                # In cell-center convention, a dashed line through a cell means
                # the gate passes through that cell. "left"/"right" = vertical gate
                # through this cell's column. "top"/"bottom" = horizontal gate
                # through this cell's row.
                side = cls.side
                if side in ("top", "bottom"):
                    raw_gates.append(("h", r, c))
                elif side in ("left", "right"):
                    raw_gates.append(("v", c, r))

        # Merge contiguous positions on the same (orientation, line)
        from collections import defaultdict
        grouped: dict[tuple[str, int], list[int]] = defaultdict(list)
        for orientation, line, pos in raw_gates:
            grouped[(orientation, line)].append(pos)

        gates: list[SlalomGate] = []
        for (orientation, line), positions in grouped.items():
            positions.sort()
            # Merge contiguous runs
            start = positions[0]
            end = positions[0]
            for p in positions[1:]:
                if p == end + 1:
                    end = p
                else:
                    gates.append(SlalomGate(
                        orientation=orientation, line=line,
                        from_=start, to=end, number=None,
                    ))
                    start = end = p
            gates.append(SlalomGate(
                orientation=orientation, line=line,
                from_=start, to=end, number=None,
            ))

        return gates

    def _assign_gate_numbers(
        self,
        classifications: list[list],
        gates: list[SlalomGate],
        geom: SlalomGeometry,
    ) -> None:
        """Assign numbers to gates using directed integer annotations.

        A directed integer at (r, c) with direction d points toward a neighbor
        cell that has the gate. We find whichever gate touches that neighbor cell
        (on any of its edges) and assign the number to it.
        """
        rows, cols = geom.rows, geom.cols

        for r in range(rows):
            for c in range(cols):
                cls = classifications[r][c]
                if not isinstance(cls, DirectedInteger):
                    continue

                number = cls.value
                direction = cls.direction

                # The arrow points to the adjacent cell with the gate
                if direction == "up":
                    tr, tc = r - 1, c
                elif direction == "down":
                    tr, tc = r + 1, c
                elif direction == "left":
                    tr, tc = r, c - 1
                elif direction == "right":
                    tr, tc = r, c + 1
                else:
                    continue

                if tr < 0 or tr >= rows or tc < 0 or tc >= cols:
                    continue

                # Find the gate at cell (tr, tc)
                best = self._find_gate_at_cell(gates, tr, tc)
                if best is not None and best.number is None:
                    best.number = number

    @staticmethod
    def _find_gate_at_cell(
        gates: list[SlalomGate], row: int, col: int
    ) -> SlalomGate | None:
        """Find a gate that occupies cell (row, col)."""
        for gate in gates:
            if gate.orientation == "v":
                # v-gate at column `line`, rows from_ to to_
                if gate.line == col and gate.from_ <= row <= gate.to:
                    return gate
            else:
                # h-gate at row `line`, cols from_ to to_
                if gate.line == row and gate.from_ <= col <= gate.to:
                    return gate
        return None

    def _save_debug(
        self,
        debug_path: Path,
        geom: SlalomGeometry,
        cells: list[list[int]],
        classifications: list[list],
        gates: list[SlalomGate],
        start: dict,
    ) -> None:
        """Save debug visualization."""
        vis = geom.warped.copy()

        # Draw walls
        for r in range(geom.rows):
            for c in range(geom.cols):
                if cells[r][c] == 1:
                    y1 = geom.h_lines[r]
                    y2 = geom.h_lines[r + 1]
                    x1 = geom.v_lines[c]
                    x2 = geom.v_lines[c + 1]
                    cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 0, 200), 2)

        # Draw start cell
        sr, sc = start["row"], start["col"]
        cx = (geom.v_lines[sc] + geom.v_lines[sc + 1]) // 2
        cy = (geom.h_lines[sr] + geom.h_lines[sr + 1]) // 2
        cv2.circle(vis, (cx, cy), int(geom.cell_w * 0.3), (0, 200, 0), 2)

        # Draw gates
        for gate in gates:
            color = (200, 0, 200) if gate.number else (200, 200, 0)
            if gate.orientation == "v":
                x = geom.v_lines[gate.line]
                y1 = geom.h_lines[gate.from_]
                y2 = geom.h_lines[gate.to + 1] if gate.to + 1 < len(geom.h_lines) else geom.h_lines[-1]
                cv2.line(vis, (x, y1), (x, y2), color, 2)
            else:
                y = geom.h_lines[gate.line]
                x1 = geom.v_lines[gate.from_]
                x2 = geom.v_lines[gate.to + 1] if gate.to + 1 < len(geom.v_lines) else geom.v_lines[-1]
                cv2.line(vis, (x1, y), (x2, y), color, 2)

        cv2.imwrite(str(debug_path / "05_parsed.png"), vis)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            grid = data.grid
            cells = grid["cells"]
            rows = len(cells)
            cols = len(cells[0]) if rows > 0 else 0
            if rows < 2 or cols < 2:
                return False
            for row in cells:
                if len(row) != cols:
                    return False
                if not all(v in (0, 1) for v in row):
                    return False

            start = grid["start"]
            if not (0 <= start["row"] < rows and 0 <= start["col"] < cols):
                return False

            gate_count = grid["gateCount"]
            if gate_count < 1:
                return False

            gates = grid["gates"]
            for g in gates:
                if g["orientation"] not in ("h", "v"):
                    return False
                if g["from"] > g["to"]:
                    return False
                if g["number"] is not None and g["number"] < 1:
                    return False

            return True
        except (KeyError, TypeError, IndexError):
            return False
