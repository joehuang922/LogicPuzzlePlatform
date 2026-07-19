"""Slalom puzzle parser.

Hybrid gate detection strategy:
1. Detect grid, classify walls (black cells) via pixel intensity.
2. Use classify_cells with CircledIntegerTarget + DirectedIntegerTarget to find
   the start cell and numbered gate annotations.
3. Infer numbered gates by extending from directed integer arrows along grid lines
   to wall/border boundaries.
4. Scan grid-line strips for unnumbered gates via intensity thresholding (dashed
   line detection).
5. Manual editor as fallback for anything the parser misses.
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
    CircledInteger,
    DirectedInteger,
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
        cell_crops = self._extract_cell_crops(geom)
        classifications = classify_cells(
            self.recognizer,
            cell_crops,
            [CircledIntegerTarget(), DirectedIntegerTarget()],
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

        # Step 4: Infer numbered gates from directed integers
        numbered_gates = self._infer_numbered_gates(
            classifications, cells, geom
        )

        # Step 5: Detect unnumbered gates via strip intensity scan
        unnumbered_gates = self._detect_unnumbered_gates(
            geom, cells, numbered_gates
        )

        all_gates = numbered_gates + unnumbered_gates

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

    def _infer_numbered_gates(
        self,
        classifications: list[list],
        cells: list[list[int]],
        geom: SlalomGeometry,
    ) -> list[SlalomGate]:
        """Infer gate positions from directed integer annotations.

        A directed integer like "2↑" means gate #2 is on the grid line in the
        direction the arrow points from that cell. We extend along that grid line
        in both perpendicular directions until hitting a wall or border.
        """
        rows, cols = geom.rows, geom.cols
        gates: list[SlalomGate] = []

        for r in range(rows):
            for c in range(cols):
                cls = classifications[r][c]
                if not isinstance(cls, DirectedInteger):
                    continue

                number = cls.value
                direction = cls.direction

                gate = self._gate_from_directed_int(
                    r, c, direction, number, cells, rows, cols
                )
                if gate is not None:
                    gates.append(gate)

        return gates

    def _gate_from_directed_int(
        self,
        row: int,
        col: int,
        direction: str,
        number: int,
        cells: list[list[int]],
        rows: int,
        cols: int,
    ) -> SlalomGate | None:
        """Compute gate position from a directed integer annotation.

        The arrow points toward the grid line where the gate sits.
        Then we extend along that grid line (perpendicular to the arrow)
        to find the gate span from wall/border to wall/border.
        """
        if direction == "up":
            # Gate is on the horizontal grid line above this cell (line = row)
            line = row
            orientation = "h"
            span_from, span_to = self._find_h_gate_span(line, col, cells, rows, cols)
        elif direction == "down":
            # Gate is on the horizontal grid line below this cell (line = row + 1)
            line = row + 1
            orientation = "h"
            span_from, span_to = self._find_h_gate_span(line, col, cells, rows, cols)
        elif direction == "left":
            # Gate is on the vertical grid line to the left (line = col)
            line = col
            orientation = "v"
            span_from, span_to = self._find_v_gate_span(line, row, cells, rows, cols)
        elif direction == "right":
            # Gate is on the vertical grid line to the right (line = col + 1)
            line = col + 1
            orientation = "v"
            span_from, span_to = self._find_v_gate_span(line, row, cells, rows, cols)
        else:
            return None

        return SlalomGate(
            orientation=orientation,
            line=line,
            from_=span_from,
            to=span_to,
            number=number,
        )

    def _find_h_gate_span(
        self, line: int, ref_col: int, cells: list[list[int]], rows: int, cols: int
    ) -> tuple[int, int]:
        """Find the span of a horizontal gate on a given horizontal grid line.

        Extends left and right from ref_col until hitting a wall or border.
        A horizontal gate at grid line `line` separates row (line-1) from row (line).
        The span is in column indices. A wall/border boundary means either:
        - The column index reaches 0 (left border) or cols (right border)
        - Both cells above and below at that column are walls
        """
        span_from = ref_col
        span_to = ref_col

        # Extend left
        for c in range(ref_col - 1, -1, -1):
            if self._is_h_boundary(line, c, cells, rows, cols):
                break
            span_from = c

        # Extend right
        for c in range(ref_col + 1, cols):
            if self._is_h_boundary(line, c, cells, rows, cols):
                break
            span_to = c

        return span_from, span_to

    def _find_v_gate_span(
        self, line: int, ref_row: int, cells: list[list[int]], rows: int, cols: int
    ) -> tuple[int, int]:
        """Find the span of a vertical gate on a given vertical grid line.

        Extends up and down from ref_row until hitting a wall or border.
        """
        span_from = ref_row
        span_to = ref_row

        # Extend up
        for r in range(ref_row - 1, -1, -1):
            if self._is_v_boundary(line, r, cells, rows, cols):
                break
            span_from = r

        # Extend down
        for r in range(ref_row + 1, rows):
            if self._is_v_boundary(line, r, cells, rows, cols):
                break
            span_to = r

        return span_from, span_to

    def _is_h_boundary(
        self, line: int, col: int, cells: list[list[int]], rows: int, cols: int
    ) -> bool:
        """Check if position (line, col) is a boundary for a horizontal gate.

        A boundary exists when the cell above or below (or both) is a wall,
        or when we're at the grid border.
        """
        above_wall = line == 0 or cells[line - 1][col] == 1
        below_wall = line == rows or cells[line][col] == 1
        return above_wall or below_wall

    def _is_v_boundary(
        self, line: int, row: int, cells: list[list[int]], rows: int, cols: int
    ) -> bool:
        """Check if position (line, row) is a boundary for a vertical gate.

        A boundary exists when the cell to the left or right (or both) is a wall,
        or when we're at the grid border.
        """
        left_wall = line == 0 or cells[row][line - 1] == 1
        right_wall = line == cols or cells[row][line] == 1
        return left_wall or right_wall

    def _detect_unnumbered_gates(
        self,
        geom: SlalomGeometry,
        cells: list[list[int]],
        numbered_gates: list[SlalomGate],
    ) -> list[SlalomGate]:
        """Detect unnumbered gates via strip intensity scan along grid lines.

        For each grid line segment between walls/borders, check if there are
        dashed-line patterns (alternating dark/light) in the image. If so, that
        segment likely contains an unnumbered gate.
        """
        rows, cols = geom.rows, geom.cols
        existing = set()
        for g in numbered_gates:
            existing.add((g.orientation, g.line, g.from_, g.to))

        unnumbered: list[SlalomGate] = []

        # Check vertical grid lines for vertical gates
        for line in range(cols + 1):
            segments = self._find_v_segments(line, cells, rows, cols)
            for seg_from, seg_to in segments:
                if (("v", line, seg_from, seg_to) in existing):
                    continue
                if self._has_dashed_pattern_v(geom, line, seg_from, seg_to):
                    unnumbered.append(SlalomGate(
                        orientation="v",
                        line=line,
                        from_=seg_from,
                        to=seg_to,
                        number=None,
                    ))

        # Check horizontal grid lines for horizontal gates
        for line in range(rows + 1):
            segments = self._find_h_segments(line, cells, rows, cols)
            for seg_from, seg_to in segments:
                if (("h", line, seg_from, seg_to) in existing):
                    continue
                if self._has_dashed_pattern_h(geom, line, seg_from, seg_to):
                    unnumbered.append(SlalomGate(
                        orientation="h",
                        line=line,
                        from_=seg_from,
                        to=seg_to,
                        number=None,
                    ))

        return unnumbered

    def _find_v_segments(
        self, line: int, cells: list[list[int]], rows: int, cols: int
    ) -> list[tuple[int, int]]:
        """Find all wall-to-wall or wall-to-border segments on a vertical grid line.

        Returns list of (from_row, to_row) segments.
        """
        segments: list[tuple[int, int]] = []
        seg_start: int | None = None

        for r in range(rows):
            is_boundary = self._is_v_boundary(line, r, cells, rows, cols)
            if is_boundary:
                if seg_start is not None:
                    segments.append((seg_start, r - 1))
                    seg_start = None
            else:
                if seg_start is None:
                    seg_start = r

        if seg_start is not None:
            segments.append((seg_start, rows - 1))

        return segments

    def _find_h_segments(
        self, line: int, cells: list[list[int]], rows: int, cols: int
    ) -> list[tuple[int, int]]:
        """Find all wall-to-wall or wall-to-border segments on a horizontal grid line."""
        segments: list[tuple[int, int]] = []
        seg_start: int | None = None

        for c in range(cols):
            is_boundary = self._is_h_boundary(line, c, cells, rows, cols)
            if is_boundary:
                if seg_start is not None:
                    segments.append((seg_start, c - 1))
                    seg_start = None
            else:
                if seg_start is None:
                    seg_start = c

        if seg_start is not None:
            segments.append((seg_start, cols - 1))

        return segments

    def _has_dashed_pattern_v(
        self, geom: SlalomGeometry, line: int, row_from: int, row_to: int
    ) -> bool:
        """Check if a vertical grid-line strip has a dashed pattern.

        Samples a narrow band of pixels along the grid line between the cell rows
        and looks for alternating dark/light intensity (characteristic of dashes).
        """
        if line <= 0 or line >= geom.cols:
            x = geom.v_lines[line] if line < len(geom.v_lines) else geom.v_lines[-1]
        else:
            x = geom.v_lines[line]

        half_band = max(2, int(geom.cell_w * 0.05))
        x0 = max(0, x - half_band)
        x1 = min(geom.warped_gray.shape[1], x + half_band)

        y_start = geom.h_lines[row_from]
        y_end = geom.h_lines[row_to + 1] if row_to + 1 < len(geom.h_lines) else geom.h_lines[-1]

        strip = geom.warped_gray[y_start:y_end, x0:x1]
        if strip.size == 0:
            return False

        col_profile = np.mean(strip, axis=1)
        return self._profile_has_dashes(col_profile)

    def _has_dashed_pattern_h(
        self, geom: SlalomGeometry, line: int, col_from: int, col_to: int
    ) -> bool:
        """Check if a horizontal grid-line strip has a dashed pattern."""
        if line <= 0 or line >= geom.rows:
            y = geom.h_lines[line] if line < len(geom.h_lines) else geom.h_lines[-1]
        else:
            y = geom.h_lines[line]

        half_band = max(2, int(geom.cell_h * 0.05))
        y0 = max(0, y - half_band)
        y1 = min(geom.warped_gray.shape[0], y + half_band)

        x_start = geom.v_lines[col_from]
        x_end = geom.v_lines[col_to + 1] if col_to + 1 < len(geom.v_lines) else geom.v_lines[-1]

        strip = geom.warped_gray[y0:y1, x_start:x_end]
        if strip.size == 0:
            return False

        row_profile = np.mean(strip, axis=0)
        return self._profile_has_dashes(row_profile)

    def _profile_has_dashes(self, profile: NDArray, min_transitions: int = 3) -> bool:
        """Detect dashed pattern in a 1D intensity profile.

        Dashed lines have multiple dark-light-dark transitions. Solid lines or
        empty space won't have this pattern.
        """
        if len(profile) < 10:
            return False

        threshold = 180
        binary = profile < threshold
        transitions = np.sum(np.diff(binary.astype(int)) != 0)
        dark_ratio = np.sum(binary) / len(binary)

        # Dashed pattern: multiple transitions AND moderate dark content
        # (not fully dark like a wall, not fully light like empty)
        return transitions >= min_transitions and 0.1 < dark_ratio < 0.7

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
