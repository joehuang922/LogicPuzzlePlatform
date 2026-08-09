from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.heyawake.grid_detector import (
    HeyawakeGeometry,
    classify_borders,
    detect_heyawake_grid,
)
from puzzle_parsers.heyawake.models import HeyawakeBoard, HeyawakeRoom
from puzzle_parsers.models import PuzzleData

if TYPE_CHECKING:
    from puzzle_parsers.recognition import OcrBackend


def _flood_components(
    rows: int,
    cols: int,
    h_borders: list[list[int]],
    v_borders: list[list[int]],
) -> list[list[int]]:
    """Flood-fill cells into component ids across edges without a thick border.

    h_borders is (rows-1) x cols (thick border below cell[r][c]); v_borders is
    rows x (cols-1) (thick border right of cell[r][c]).
    """
    comp = [[-1] * cols for _ in range(rows)]
    next_id = 0
    for sr in range(rows):
        for sc in range(cols):
            if comp[sr][sc] >= 0:
                continue
            cid = next_id
            next_id += 1
            stack = [(sr, sc)]
            comp[sr][sc] = cid
            while stack:
                r, c = stack.pop()
                # up
                if r > 0 and comp[r - 1][c] < 0 and h_borders[r - 1][c] == 0:
                    comp[r - 1][c] = cid
                    stack.append((r - 1, c))
                # down
                if r < rows - 1 and comp[r + 1][c] < 0 and h_borders[r][c] == 0:
                    comp[r + 1][c] = cid
                    stack.append((r + 1, c))
                # left
                if c > 0 and comp[r][c - 1] < 0 and v_borders[r][c - 1] == 0:
                    comp[r][c - 1] = cid
                    stack.append((r, c - 1))
                # right
                if c < cols - 1 and comp[r][c + 1] < 0 and v_borders[r][c] == 0:
                    comp[r][c + 1] = cid
                    stack.append((r, c + 1))
    return comp


class HeyawakeParser(PuzzleParser):
    puzzle_type = "heyawake"

    def __init__(self, ocr_backend: OcrBackend | None = None) -> None:
        self._ocr = ocr_backend

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(
        self, image_path: str | Path, debug_dir: str | None = None
    ) -> HeyawakeBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(
        self, img_array: np.ndarray, debug_dir: str | None = None
    ) -> HeyawakeBoard:
        geom = detect_heyawake_grid(img_array, debug_dir=debug_dir)
        warped_gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)

        h_borders, v_borders = classify_borders(
            warped_gray, geom, debug_dir=debug_dir
        )

        rooms = self._build_rooms(geom, h_borders, v_borders)

        # Read a clue digit per cell and attach it to the room it lands in.
        clues = self._read_clues(warped_gray, geom)
        self._attach_clues(rooms, clues)

        return HeyawakeBoard(width=geom.cols, height=geom.rows, rooms=rooms)

    def _build_rooms(
        self,
        geom: HeyawakeGeometry,
        h_borders: list[list[int]],
        v_borders: list[list[int]],
    ) -> list[HeyawakeRoom]:
        """Flood-fill components, then snap each to its bounding-box rectangle.

        Best-effort: because thick-border detection is imperfect, a
        non-rectangular component is snapped to its bounding box rather than
        rejected. Rectangle-ness / exact tiling is checked in validate().
        """
        rows, cols = geom.rows, geom.cols
        comp = _flood_components(rows, cols, h_borders, v_borders)

        # Bounding box per component id.
        bounds: dict[int, list[int]] = {}
        for r in range(rows):
            for c in range(cols):
                cid = comp[r][c]
                if cid not in bounds:
                    bounds[cid] = [r, r, c, c]  # minR, maxR, minC, maxC
                else:
                    b = bounds[cid]
                    b[0] = min(b[0], r)
                    b[1] = max(b[1], r)
                    b[2] = min(b[2], c)
                    b[3] = max(b[3], c)

        rooms: list[HeyawakeRoom] = []
        for cid in sorted(bounds, key=lambda k: (bounds[k][0], bounds[k][2])):
            minR, maxR, minC, maxC = bounds[cid]
            rooms.append(
                HeyawakeRoom(
                    r=minR,
                    c=minC,
                    w=maxC - minC + 1,
                    h=maxR - minR + 1,
                    clue=None,
                )
            )
        return rooms

    def _read_clues(
        self, warped_gray: NDArray, geom: HeyawakeGeometry
    ) -> list[list[int]]:
        """OCR each cell for a printed clue digit (-1 / 0 when blank)."""
        rows, cols = geom.rows, geom.cols
        if self._ocr is None:
            return [[-1] * cols for _ in range(rows)]

        cell_rois: list[list[np.ndarray]] = []
        for r in range(rows):
            row_rois: list[np.ndarray] = []
            for c in range(cols):
                y1 = geom.h_lines[r]
                y2 = geom.h_lines[r + 1]
                x1 = geom.v_lines[c]
                x2 = geom.v_lines[c + 1]
                my = int((y2 - y1) * 0.2)
                mx = int((x2 - x1) * 0.2)
                row_rois.append(warped_gray[y1 + my : y2 - my, x1 + mx : x2 - mx])
            cell_rois.append(row_rois)

        return self._ocr.recognize_cells(cell_rois)

    def _attach_clues(
        self, rooms: list[HeyawakeRoom], clues: list[list[int]]
    ) -> None:
        """Attach each recognized digit to the room whose cells contain it.

        Heyawake prints at most one clue per room. If OCR reports several
        digits inside one room (noise), we keep the top-left-most one.
        """
        rows = len(clues)
        cols = len(clues[0]) if rows else 0

        # Map each cell to its room index.
        cell_room = [[-1] * cols for _ in range(rows)]
        for i, room in enumerate(rooms):
            for r in range(room.r, room.r + room.h):
                for c in range(room.c, room.c + room.w):
                    if 0 <= r < rows and 0 <= c < cols:
                        cell_room[r][c] = i

        for r in range(rows):
            for c in range(cols):
                val = clues[r][c]
                if val is None or val < 0:
                    continue
                idx = cell_room[r][c]
                if idx < 0:
                    continue
                # First (top-left-most) digit wins for a room.
                if rooms[idx].clue is None:
                    rooms[idx].clue = val

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = HeyawakeBoard(**data.grid)
            if board.width < 1 or board.height < 1:
                return False
            if not board.rooms:
                return False

            # Rooms must tile the grid exactly: every cell covered once, all
            # rooms in-bounds and rectangular (rectangle-ness is implied by the
            # (r,c,w,h) form; here we verify coverage and clue bounds).
            covered = [[0] * board.width for _ in range(board.height)]
            for room in board.rooms:
                if room.w < 1 or room.h < 1:
                    return False
                if room.r < 0 or room.c < 0:
                    return False
                if room.r + room.h > board.height or room.c + room.w > board.width:
                    return False
                if room.clue is not None:
                    if room.clue < 0 or room.clue > room.w * room.h:
                        return False
                for r in range(room.r, room.r + room.h):
                    for c in range(room.c, room.c + room.w):
                        covered[r][c] += 1

            for r in range(board.height):
                for c in range(board.width):
                    if covered[r][c] != 1:
                        return False
            return True
        except Exception:
            return False

    def to_json(self, board: HeyawakeBoard, output_path: str | Path) -> None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps(board.model_dump(), indent=4) + "\n")
