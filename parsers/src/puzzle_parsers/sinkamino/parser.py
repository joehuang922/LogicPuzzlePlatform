"""Sinkamino parser: black cells, given squares and arrow trails, no OCR.

Everything is read from one lighting-normalised ink mask of the warped board:

* **Black cells** — the inner part of the cell is almost all ink.
* **Given squares** — an outlined square (side 0.53-0.78 cell) searched for across the
  whole board rather than per cell box, since the page curve can leave the straight
  lattice ~0.15 cell off; each hit counts for the cell holding its centre. Its sides
  must stop at its corners (grid lines and trails run on) and its inside must be paper.
* **Trail links** — ink across the shared edge of two neighbouring cells, on the line
  through their centres. Black cells never carry a trail.
* **Arrowheads** — solid blobs that survive an opening too wide for any line.

Links chain into trails; a chain's head is the end nearest an arrowhead. A chain that
isn't a simple path, or has no clear head, is dropped for the admin to draw.

Thresholds were measured on the three samples (full size, 1080 and 800 px wide):
black inner ink 1.00 vs <= 0.36; link coverage 1.00 vs <= 0.26; squares exact for ink
0.73-0.77 and side coverage 0.70-0.80, so both sit at 0.75.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.cell_ocr import crop_cell
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.sinkamino.grid_detector import detect_sinkamino_grid
from puzzle_parsers.sinkamino.models import SinkaminoBoard

logger = logging.getLogger(__name__)

WHITE, BLACK, GIVEN = 0, 1, 2

# Ink = darker than this fraction of the local paper white.
INK_RATIO = 0.75
# A cell is black when this much of its inner area is ink.
BLACK_FILL = 0.6
# A link needs ink across this much of the window straddling the shared edge.
LINK_COVERAGE = 0.6
# Each side of a given square must be this well inked.
SQUARE_SIDE_COVERAGE = 0.75
# Square search runs at this many pixels per cell.
CELL_PX = 40


def ink_mask(gray: NDArray, pitch: float) -> NDArray:
    """1 where the pixel is ink, after dividing out the paper's lighting.

    The paper white is a max filter about three cells wide (wide enough to see past a
    2x2 black block), so faint print near a shaded page edge still reads as ink.
    """
    k = int(3 * pitch) | 1
    bg = cv2.dilate(gray, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    bg = cv2.GaussianBlur(bg, (k, k), 0).astype(np.float32)
    norm = gray.astype(np.float32) / np.maximum(bg, 1)
    return (norm < INK_RATIO).astype(np.uint8)


def _box(h_lines: list[int], v_lines: list[int], r: int, c: int, y0: float, y1: float, x0: float, x1: float):
    h = h_lines[r + 1] - h_lines[r]
    w = v_lines[c + 1] - v_lines[c]
    return (
        int(h_lines[r] + y0 * h), int(h_lines[r] + y1 * h),
        int(v_lines[c] + x0 * w), int(v_lines[c] + x1 * w),
    )


def find_black(ink: NDArray, h_lines: list[int], v_lines: list[int]) -> set[tuple[int, int]]:
    rows, cols = len(h_lines) - 1, len(v_lines) - 1
    black = set()
    for r in range(rows):
        for c in range(cols):
            inner = crop_cell(ink, h_lines[r], h_lines[r + 1], v_lines[c], v_lines[c + 1], margin=0.15)
            if inner.mean() > BLACK_FILL:
                black.add((r, c))
    return black


def find_squares(ink: NDArray, h_lines: list[int], v_lines: list[int]) -> set[tuple[int, int]]:
    """Cells holding the centre of an outlined, hollow square of side 0.53-0.78 cell.

    The lower bound keeps out the 0.5-cell box a turning trail closes off against two
    grid lines; requiring each side to stop at its corners keeps out boxes made of grid
    lines; requiring a paper interior keeps out black cells.
    """
    rows, cols = len(h_lines) - 1, len(v_lines) - 1
    pitch = (v_lines[-1] - v_lines[0]) / cols
    f = CELL_PX / pitch
    small = cv2.resize(ink.astype(np.float32), None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    d = cv2.dilate((small > 0.25).astype(np.float32), np.ones((3, 3), np.float32))
    h, w = d.shape
    rc = np.concatenate([np.zeros((h, 1), np.float32), np.cumsum(d, axis=1)], axis=1)
    cc = np.concatenate([np.zeros((1, w), np.float32), np.cumsum(d, axis=0)], axis=0)
    ii = cv2.integral(d)

    def hseg(y, x0, x1):
        x0 = np.clip(x0, 0, w)
        x1 = np.clip(x1, 0, w)
        return (rc[y, x1] - rc[y, x0]) / np.maximum(x1 - x0, 1)

    def vseg(x, y0, y1):
        y0 = np.clip(y0, 0, h)
        y1 = np.clip(y1, 0, h)
        return (cc[y1, x] - cc[y0, x]) / np.maximum(y1 - y0, 1)

    found: set[tuple[int, int]] = set()
    for s in range(int(0.53 * CELL_PX) + 1, int(0.78 * CELL_PX) + 1):
        if h <= s or w <= s:
            break
        e = max(2, int(0.12 * s))
        a = max(1, s // 5)
        Y, X = np.meshgrid(np.arange(h - s), np.arange(w - s), indexing="ij")
        sides = np.minimum.reduce([
            hseg(Y, X, X + s), hseg(Y + s, X, X + s), vseg(X, Y, Y + s), vseg(X + s, Y, Y + s),
        ])
        # Probe past the corner, one pixel clear of the dilation's reach: a
        # side that is a pixel stair (a resampled, slightly tilted square)
        # otherwise reads its own corner as running on.
        runs_on = np.maximum.reduce([
            np.minimum(hseg(Y, X - e - 1, X - 2), hseg(Y, X + s + 2, X + s + e + 1)),
            np.minimum(hseg(Y + s, X - e - 1, X - 2), hseg(Y + s, X + s + 2, X + s + e + 1)),
            np.minimum(vseg(X, Y - e - 1, Y - 2), vseg(X, Y + s + 2, Y + s + e + 1)),
            np.minimum(vseg(X + s, Y - e - 1, Y - 2), vseg(X + s, Y + s + 2, Y + s + e + 1)),
        ])
        inner = (ii[Y + s - a, X + s - a] - ii[Y + a, X + s - a] - ii[Y + s - a, X + a] + ii[Y + a, X + a]) / (
            (s - 2 * a) ** 2
        )
        ok = (sides >= SQUARE_SIDE_COVERAGE) & (runs_on < 0.5) & (inner < 0.35)
        for y, x in zip(*np.nonzero(ok)):
            cx, cy = (x + s / 2) / f, (y + s / 2) / f
            c = int(np.searchsorted(v_lines, cx) - 1)
            r = int(np.searchsorted(h_lines, cy) - 1)
            if 0 <= r < rows and 0 <= c < cols:
                found.add((r, c))
    return found


def find_links(
    ink: NDArray, h_lines: list[int], v_lines: list[int], black: set[tuple[int, int]]
) -> set[tuple[tuple[int, int], tuple[int, int]]]:
    """Neighbouring cell pairs joined by a trail line across their shared edge.

    The window spans 0.2 cell either side of the edge and 0.15 cell either side of the
    centre line; a trail crosses all of it, while a square's side, a grid line or an
    arrowhead covers only a few of its columns (rows, for a vertical pair).
    """
    rows, cols = len(h_lines) - 1, len(v_lines) - 1
    links = set()
    for r in range(rows):
        for c in range(cols):
            if (r, c) in black:
                continue
            h = h_lines[r + 1] - h_lines[r]
            w = v_lines[c + 1] - v_lines[c]
            if c + 1 < cols and (r, c + 1) not in black:
                x = v_lines[c + 1]
                yc = (h_lines[r] + h_lines[r + 1]) / 2
                win = ink[int(yc - 0.15 * h):int(yc + 0.15 * h), int(x - 0.2 * w):int(x + 0.2 * w)]
                if win.size and win.max(axis=0).mean() >= LINK_COVERAGE:
                    links.add(((r, c), (r, c + 1)))
            if r + 1 < rows and (r + 1, c) not in black:
                y = h_lines[r + 1]
                xc = (v_lines[c] + v_lines[c + 1]) / 2
                win = ink[int(y - 0.2 * h):int(y + 0.2 * h), int(xc - 0.15 * w):int(xc + 0.15 * w)]
                if win.size and win.max(axis=1).mean() >= LINK_COVERAGE:
                    links.add(((r, c), (r + 1, c)))
    return links


def find_heads(ink: NDArray, h_lines: list[int], v_lines: list[int]) -> list[tuple[float, float]]:
    """Centroids (x, y) of solid, smaller-than-a-cell blobs: the arrowheads."""
    cols = len(v_lines) - 1
    rows = len(h_lines) - 1
    pw = (v_lines[-1] - v_lines[0]) / cols
    ph = (h_lines[-1] - h_lines[0]) / rows
    d = int(max(3, 0.1 * pw)) | 1
    blobs = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (d, d)))
    n, _, stats, centroids = cv2.connectedComponentsWithStats(blobs)
    heads = []
    for i in range(1, n):
        _, _, bw, bh, area = stats[i]
        if 0.04 * pw * ph <= area <= 0.2 * pw * ph and bw < 0.7 * pw and bh < 0.7 * ph:
            heads.append((float(centroids[i][0]), float(centroids[i][1])))
    return heads


def assemble_trails(
    links: set[tuple[tuple[int, int], tuple[int, int]]],
    heads: list[tuple[float, float]],
    h_lines: list[int],
    v_lines: list[int],
) -> list[list[list[int]]]:
    """Chain links into trails ordered tail -> head, in reading order of their tails."""
    adj: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for a, b in links:
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    pitch = (v_lines[-1] - v_lines[0]) / (len(v_lines) - 1)

    def centre(cell):
        r, c = cell
        return ((v_lines[c] + v_lines[c + 1]) / 2, (h_lines[r] + h_lines[r + 1]) / 2)

    def head_distance(cell):
        cx, cy = centre(cell)
        return min((np.hypot(hx - cx, hy - cy) for hx, hy in heads), default=float("inf"))

    seen: set[tuple[int, int]] = set()
    trails = []
    for start in sorted(adj):
        if start in seen:
            continue
        comp, stack = [], [start]
        seen.add(start)
        while stack:
            cell = stack.pop()
            comp.append(cell)
            for nxt in adj[cell]:
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        ends = [cell for cell in comp if len(adj[cell]) == 1]
        if any(len(adj[cell]) > 2 for cell in comp) or len(ends) != 2:
            logger.warning("sinkamino: dropping a trail at %s that isn't a simple path", sorted(comp)[0])
            continue
        d0, d1 = head_distance(ends[0]), head_distance(ends[1])
        if min(d0, d1) > 0.6 * pitch or abs(d0 - d1) < 0.2 * pitch:
            logger.warning("sinkamino: dropping a trail at %s with no clear head", sorted(comp)[0])
            continue
        tail = ends[0] if d0 > d1 else ends[1]
        path, prev = [tail], None
        while len(path) < len(comp):
            nxt = next(n for n in adj[path[-1]] if n != prev)
            prev = path[-1]
            path.append(nxt)
        trails.append([list(cell) for cell in path])
    trails.sort(key=lambda t: (t[0][0], t[0][1]))
    return trails


class SinkaminoParser(PuzzleParser):
    puzzle_type = "sinkamino"
    locates_board = True

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.model_dump())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> SinkaminoBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> SinkaminoBoard:
        geom = detect_sinkamino_grid(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.quad)
        gray = cv2.cvtColor(geom.warped, cv2.COLOR_BGR2GRAY)
        h_lines, v_lines = list(geom.h_lines), list(geom.v_lines)
        rows, cols = len(h_lines) - 1, len(v_lines) - 1
        ink = ink_mask(gray, (v_lines[-1] - v_lines[0]) / cols)

        black = find_black(ink, h_lines, v_lines)
        squares = find_squares(ink, h_lines, v_lines) - black
        links = find_links(ink, h_lines, v_lines, black)
        heads = find_heads(ink, h_lines, v_lines)
        arrows = assemble_trails(links, heads, h_lines, v_lines)

        cells = [
            [BLACK if (r, c) in black else GIVEN if (r, c) in squares else WHITE for c in range(cols)]
            for r in range(rows)
        ]

        if debug_dir:
            vis = geom.warped.copy()
            for r, c in squares:
                y0, y1, x0, x1 = _box(h_lines, v_lines, r, c, 0.3, 0.7, 0.3, 0.7)
                cv2.rectangle(vis, (x0, y0), (x1, y1), (0, 160, 0), 3)
            for trail in arrows:
                pts = [
                    (int((v_lines[c] + v_lines[c + 1]) / 2), int((h_lines[r] + h_lines[r + 1]) / 2))
                    for r, c in trail
                ]
                cv2.polylines(vis, [np.array(pts)], False, (0, 0, 255), 4)
                cv2.circle(vis, pts[-1], 12, (0, 0, 255), -1)
            cv2.imwrite(str(Path(debug_dir) / "04_parsed.png"), vis)

        return SinkaminoBoard(cells=cells, arrows=arrows)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = SinkaminoBoard(**data.grid)
            rows = len(board.cells)
            cols = len(board.cells[0]) if rows else 0
            if rows < 2 or cols < 2:
                return False
            if any(len(row) != cols or any(v not in (WHITE, BLACK, GIVEN) for v in row) for row in board.cells):
                return False
            for trail in board.arrows:
                if len(trail) < 2:
                    return False
                for j, (r, c) in enumerate(trail):
                    if not (0 <= r < rows and 0 <= c < cols) or board.cells[r][c] == BLACK:
                        return False
                    if j and abs(trail[j - 1][0] - r) + abs(trail[j - 1][1] - c) != 1:
                        return False
            return True
        except Exception:
            return False

    def to_json(self, board: SinkaminoBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.model_dump(), indent=4) + "\n")
