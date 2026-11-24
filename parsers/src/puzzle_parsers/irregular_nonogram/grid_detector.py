"""Irregular Nonogram (変形ロジック) board detection.

The figure is a staircase of board cells (solid thin lines, thick every 5 cells and
around the board) and clue blocks (dotted lines, digits), all on one lattice, with no
rectangular border. Design, measured on ``docs/irregular-nonogram`` (two scans, at full
size and at 2000 px):

* **Locating.** As Picturesque Maze: the figure is the largest block of ink; a frame
  around it, grown by a margin, goes to ``rectify_board`` (``lattice_fit``). Everything
  runs on its ``warped`` board (the shared normalised cell size): at an Android upload's
  ~24 px cells the clue lattice drifted half a cell and digits misread.
* **Lattice.** The shared grid finder lost every other line on sample 1, whose thin
  board lines are faint and broken. Lines are joined along their axis, the pitch read
  from their period (``comb_pitch``), and the lines placed between the figure's outermost
  lines by ``dp_lines``, the count from the pitch. A skewed or curled page bends them:
  each line's offset to its ink is measured per window and a smooth 2D polynomial fitted
  to all offsets in passes of rising degree, trimming outliers.
* **Board cells.** Rooms of the lattice enclosed by thick lines (the shared
  ``classify_border_thickness``), grown over empty cells lined on every edge (digit cells
  and blank paper are barriers), whose lines are solid (clue padding is dotted) and whose
  boundary is mostly thick. Measured: board rooms are whole 5x5 blocks with line coverage
  >= 0.93; padding rooms <= 0.88 and thin-bounded.
* **Clues.** Each piece's clue block is the run of inked cells just past one of its
  ends; a cell belongs to one block, so pieces with a single candidate claim theirs
  first. A clue cell's crop is a pitch-sized square (fitted rows over a clue block can be
  compressed, and squashed digits misread) following its digits vertically, read at
  source resolution (upscaling blurred a 13 into a 19).
* **Not yet:** a hand-held photo of a strongly curled page (sample 1's photo): the
  polynomial can't follow its curl, and the parse is unusable.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.board_grid import BoardGrid
from puzzle_parsers.cell_ocr import crop_cell
from puzzle_parsers.grid_utils import classify_border_thickness, ink_intensity, rectify_board
from puzzle_parsers.lattice_fit import comb_pitch, dark_mask, dp_lines, figure_frame_image, strokes

# Window (cells across) for measuring each line's local offset.
_WINDOW = 8
# A cell with more than this fraction of ink inside holds a digit (or a stray mark).
_INK = 0.04
# A line counts in a refinement window when inked along this share of the window.
_LINE_SHARE = 0.3
# A room is board when its cells' edges are inked along at least this fraction on average.
_SOLID = 0.9
# Refinement passes: (polynomial degree, search reach in cells). The first pass reaches
# far (a photo's lines start up to ~half a cell off) but only fits a skew; later passes
# fit perspective and curl within a tighter reach around the previous fit.
_PASSES = ((1, 0.6), (2, 0.45), (3, 0.35), (3, 0.3))


@dataclass
class Lattice:
    """Lattice lines on the native board: ``ys`` (rows + 1) and ``xs`` (cols + 1),
    each (lines, windows) with the window centres along the other axis."""

    ys: NDArray
    xs: NDArray
    cx: NDArray  # window centres along x (for ys)
    cy: NDArray  # window centres along y (for xs)
    pitch: float

    @property
    def rows(self) -> int:
        return self.ys.shape[0] - 1

    @property
    def cols(self) -> int:
        return self.xs.shape[0] - 1

    def mean_lines(self) -> tuple[list[int], list[int]]:
        return [int(round(v)) for v in self.ys.mean(axis=1)], [int(round(v)) for v in self.xs.mean(axis=1)]

    def square_box(self, r: int, c: int) -> tuple[int, int, int, int]:
        """A pitch-sized square centred on lattice cell (r, c): the clue crop. Over a
        clue block the fitted rows can come out compressed (its dotted lines carry
        little ink for the fit), and squashed digits misread (5 as 9, 6 as 0)."""
        y1, y2, x1, x2 = self.cell_box(r, c)
        cy, cx, half = (y1 + y2) / 2, (x1 + x2) / 2, self.pitch / 2
        return int(round(cy - half)), int(round(cy + half)), int(round(cx - half)), int(round(cx + half))

    def cell_box(self, r: int, c: int) -> tuple[int, int, int, int]:
        """(y1, y2, x1, x2) of lattice cell (r, c), from the lines local to it."""
        xm = (self.xs[c].mean() + self.xs[c + 1].mean()) / 2
        ym = (self.ys[r].mean() + self.ys[r + 1].mean()) / 2
        y1 = float(np.interp(xm, self.cx, self.ys[r]))
        y2 = float(np.interp(xm, self.cx, self.ys[r + 1]))
        x1 = float(np.interp(ym, self.cy, self.xs[c]))
        x2 = float(np.interp(ym, self.cy, self.xs[c + 1]))
        return int(round(y1)), int(round(y2)), int(round(x1)), int(round(x2))


@dataclass
class IrregularGeometry:
    lattice: Lattice
    # (rows, cols): 1 = board cell, on the full lattice
    board: NDArray
    # (rows, cols): ink inside the cell (0..1), for clue cells
    ink: NDArray
    quad: NDArray
    native: NDArray = field(repr=False)
    gray: NDArray = field(repr=False)
    glyphs: NDArray = field(repr=False)
    # The board at source resolution, for reading digits (upscaling blurred a 13 into a
    # 19), and the factor from ``native`` coordinates to it.
    source: NDArray = field(repr=False, default=None)
    to_source: tuple[float, float] = (1.0, 1.0)

    def source_box(self, box: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
        sy, sx = self.to_source
        y1, y2, x1, x2 = box
        return int(round(y1 * sy)), int(round(y2 * sy)), int(round(x1 * sx)), int(round(x2 * sx))


def _line_profile(dark: NDArray, horizontal: bool, pitch: float) -> NDArray:
    """Ink of lines along one axis: dashes joined, strokes of at least ~0.6 cell."""
    k = max(3, int(pitch * 0.25))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, 1) if horizontal else (1, k))
    joined = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, kernel)
    return strokes(joined, horizontal, max(3, int(pitch * 0.6)))


def _profile(line_ink: NDArray, horizontal: bool, lo: int = 0, hi: int | None = None) -> NDArray:
    region = line_ink[:, lo:hi] if horizontal else line_ink[lo:hi, :]
    prof = region.sum(axis=1 if horizontal else 0).astype(np.float64) / 255.0
    return np.convolve(prof, np.ones(3) / 3, "same")


def _fit_axis(line_ink: NDArray, horizontal: bool, pitch: float, span: tuple[int, int]) -> NDArray:
    """Global line positions along one axis: between the first and last lines of the
    figure (``span``, the footprint's extent), placed by ``dp_lines``; the count is the
    one that lands on the most ink."""
    prof = _profile(line_ink, horizontal)
    lo, hi = span
    reach = int(pitch * 0.6)
    # The outermost lines: the strongest peaks near the footprint's edges.
    a0, a1 = max(0, lo - reach), min(len(prof), lo + reach)
    b0, b1 = max(0, hi - reach), min(len(prof), hi + reach)
    first = a0 + int(np.argmax(prof[a0:a1]))
    last = b0 + int(np.argmax(prof[b0:b1]))
    # The count comes from the pitch: a mean-ink score prefers fewer, stronger lines and
    # took one column too few on sample 1, stretching the rest within the DP's slack.
    n = max(1, round((last - first) / pitch))
    return dp_lines(prof, first, last, n)[0]


def _poly_terms(u: NDArray, v: NDArray, degree: int) -> NDArray:
    return np.stack([u**i * v**j for i in range(degree + 1) for j in range(degree + 1 - i)], axis=-1)


def _refine(line_ink: NDArray, horizontal: bool, lines: NDArray, pitch: float) -> tuple[NDArray, NDArray]:
    """Bend the global lines with the page. Per window across the other axis, each
    line's offset to its ink is measured where it has clear ink (near the current
    estimate), and a smooth 2D polynomial of (position along, position
    across) is fitted to all offsets, trimming outliers (a digit stroke beside a line).
    Passes of rising degree (1: skew, then perspective, then curl) re-measure around the
    previous fit, so a photo whose lines start a cell off still converges. Noisy windows
    can't pull single lines astray."""
    extent = line_ink.shape[1] if horizontal else line_ink.shape[0]
    half = _WINDOW * pitch / 4
    n_win = max(2, int(np.ceil(extent / half)) + 1)
    centres = np.linspace(0, extent, n_win)
    profiles = []
    for c in centres:
        lo, hi = int(max(0, c - half)), int(min(extent, c + half))
        profiles.append((_profile(line_ink, horizontal, lo, hi), (hi - lo) * _LINE_SHARE))
    scale = max(1.0, float(lines[-1]))
    uu, vv = np.meshgrid(centres / extent, lines / scale)
    out = np.repeat(lines[:, None], n_win, axis=1).astype(np.float64)
    for degree, reach in _PASSES:
        shift = max(1, int(round(pitch * reach)))
        along, across, offs = [], [], []
        for w, (prof, need) in enumerate(profiles):
            for i, y0 in enumerate(lines):
                y = out[i, w]
                a, b = max(0, int(round(y)) - shift), min(len(prof), int(round(y)) + shift + 1)
                seg = prof[a:b]
                if len(seg) and seg.max() >= need:
                    along.append(centres[w])
                    across.append(y0)
                    offs.append(a + int(np.argmax(seg)) - y0)
        if len(offs) < 3 * (degree + 1) ** 2:
            break
        u = np.array(along) / extent
        v = np.array(across) / scale
        d = np.array(offs, dtype=np.float64)
        keep = np.ones(len(d), dtype=bool)
        coef = None
        for _ in range(4):
            coef, *_ = np.linalg.lstsq(_poly_terms(u[keep], v[keep], degree), d[keep], rcond=None)
            resid = np.abs(_poly_terms(u, v, degree) @ coef - d)
            new_keep = resid <= max(1.5, pitch * 0.12)
            if new_keep.sum() < 3 * (degree + 1) ** 2 or (new_keep == keep).all():
                break
            keep = new_keep
        out = lines[:, None] + _poly_terms(uu, vv, degree) @ coef
    return out, centres


def _footprint(dark: NDArray, pitch: float) -> NDArray:
    k = max(3, int(round(pitch * 1.5)))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
    closed = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, kernel)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(closed, 8)
    if n < 2:
        return closed
    best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return ((labels == best) * 255).astype(np.uint8)


def fit_lattice(gray: NDArray) -> Lattice:
    h, w = gray.shape[:2]
    dark = dark_mask(gray, max(15, int(min(h, w) / 40)))
    k0 = max(5, int(min(h, w) / 150))
    pitch_y = comb_pitch(strokes(dark, True, k0).sum(axis=1))
    pitch_x = comb_pitch(strokes(dark, False, k0).sum(axis=0))
    if not pitch_y and not pitch_x:
        raise ValueError("Could not find the board's cell size")
    pitch_y = pitch_y or pitch_x
    pitch_x = pitch_x or pitch_y
    pitch = (pitch_x + pitch_y) / 2
    foot = _footprint(dark, pitch)
    ys_in, xs_in = np.nonzero(foot)
    if len(xs_in) == 0:
        raise ValueError("Could not find the board")
    h_ink = _line_profile(dark, True, pitch_y)
    v_ink = _line_profile(dark, False, pitch_x)
    ys = _fit_axis(h_ink, True, pitch_y, (int(ys_in.min()), int(ys_in.max())))
    xs = _fit_axis(v_ink, False, pitch_x, (int(xs_in.min()), int(xs_in.max())))
    ys_w, cx = _refine(h_ink, True, ys, pitch_y)
    xs_w, cy = _refine(v_ink, False, xs, pitch_x)
    return Lattice(ys=ys_w, xs=xs_w, cx=cx, cy=cy, pitch=pitch)


def glyph_ink(dark: NDArray, pitch: float) -> NDArray:
    """The dark mask with the lattice lines (strokes of 0.9 cell or longer; digits are
    shorter) taken out: what's left is digits and stray marks."""
    long_h = strokes(dark, True, max(3, int(pitch * 0.9)))
    long_v = strokes(dark, False, max(3, int(pitch * 0.9)))
    grow = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    lines = cv2.dilate(cv2.bitwise_or(long_h, long_v), grow)
    return cv2.bitwise_and(dark, cv2.bitwise_not(lines))


def digit_box(glyphs: NDArray, box: tuple[int, int, int, int], pitch: float) -> tuple[int, int, int, int]:
    """The crop for one clue cell: its digits, whose centres fall within the cell's
    horizontal span (a neighbour's digits centre outside it; both digits of a squeezed
    13 inside), centred on them and at least a cell wide.

    Vertically the crop follows the digits: over a clue block the fitted rows can sit
    ~0.4 cell off (its dotted lines carry little ink for the fit), which cut digits in
    half. Dots and dashes of the dotted lines are too thin or short to count."""
    y1, y2, x1, x2 = box
    cy = (y1 + y2) / 2
    h, w = y2 - y1, x2 - x1
    wy0, wy1 = max(0, int(y1 - h * 0.5)), min(glyphs.shape[0], int(y2 + h * 0.5))
    wx0, wx1 = max(0, int(x1 - w * 0.5)), min(glyphs.shape[1], int(x2 + w * 0.5))
    n, _, stats, cents = cv2.connectedComponentsWithStats(glyphs[wy0:wy1, wx0:wx1], connectivity=8)
    mine = []
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if area < max(4, pitch * pitch * 0.01) or bh < pitch * 0.25 or bw < pitch * 0.12:
            continue
        gx, gy = cents[i][0] + wx0, cents[i][1] + wy0
        if x1 <= gx < x2 and abs(gy - cy) <= h * 0.6:
            mine.append((x + wx0, y + wy0, x + wx0 + bw, y + wy0 + bh))
    if not mine:
        return box
    # The number nearest the cell's centre vertically, and the digits level with it (a
    # column clue stacks its numbers, so others in the span belong to the next row).
    near = min(mine, key=lambda m: abs((m[1] + m[3]) / 2 - cy))
    level = (near[1] + near[3]) / 2
    mine = [m for m in mine if abs((m[1] + m[3]) / 2 - level) < h * 0.25]
    gx0, gy0 = min(m[0] for m in mine), min(m[1] for m in mine)
    gx1, gy1 = max(m[2] for m in mine), max(m[3] for m in mine)
    my, mx = (gy0 + gy1) / 2, (gx0 + gx1) / 2
    if abs(my - cy) < h * 0.15:
        my = cy
    half_w = max(w / 2, (gx1 - gx0) / 2 + w * 0.15)
    return int(round(my - h / 2)), int(round(my + h / 2)), int(round(mx - half_w)), int(round(mx + half_w))


def _cell_ink(dark: NDArray, lat: Lattice) -> NDArray:
    """Fraction of digit ink inside each lattice cell, away from its lines."""
    dark = glyph_ink(dark, lat.pitch)
    ink = np.zeros((lat.rows, lat.cols))
    for r in range(lat.rows):
        for c in range(lat.cols):
            patch = crop_cell(dark, *lat.cell_box(r, c), margin=0.2)
            ink[r, c] = float(patch.mean()) / 255.0 if patch.size else 0.0
    return ink


def _edge_lines(dark: NDArray, lat: Lattice) -> tuple[NDArray, NDArray]:
    """(rows, cols): how many of each cell's four edges carry a line (ink along at least
    40% of the edge, within a quarter cell across it). Board cells have all four; blank paper
    none."""
    reach = max(1, int(round(lat.pitch * 0.25)))
    out = np.zeros((lat.rows, lat.cols), dtype=int)
    cover = np.zeros((lat.rows, lat.cols))
    ts = np.linspace(0.15, 0.85, 12)
    for r in range(lat.rows):
        for c in range(lat.cols):
            y1, y2, x1, x2 = lat.cell_box(r, c)
            n = 0
            for horizontal, fixed, a, b in ((True, y1, x1, x2), (True, y2, x1, x2), (False, x1, y1, y2), (False, x2, y1, y2)):
                hits = 0
                for t in ts:
                    p = int(round(a + (b - a) * t))
                    if horizontal:
                        win = dark[max(0, fixed - reach): fixed + reach + 1, min(p, dark.shape[1] - 1)]
                    else:
                        win = dark[min(p, dark.shape[0] - 1), max(0, fixed - reach): fixed + reach + 1]
                    hits += bool(win.any())
                n += hits >= 0.4 * len(ts)
                cover[r, c] += hits / len(ts) / 4
            out[r, c] = n
    return out, cover


def board_mask(gray: NDArray, lat: Lattice, ink: NDArray, edges: NDArray, cover: NDArray) -> NDArray:
    """Board cells: rooms of the lattice enclosed by thick lines whose cells are empty,
    lined on every edge, and lined solidly.

    Cells with a digit, or with an unlined edge (blank paper), are barriers: a clue row
    always has a digit against the board, and the outside is unlined, so a board block
    never leaks out even where the outline beside it reads thin. A clue block's blank
    padding cells, enclosed by digits, can form a room too; their dotted lines fail the
    solidity test."""
    h_lines, v_lines = lat.mean_lines()
    grid = BoardGrid(warped=cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR), h_lines=h_lines, v_lines=v_lines)
    thick_h, thick_v = classify_border_thickness(gray, grid)
    rows, cols = lat.rows, lat.cols
    # Cells that can't be board: a digit inside, or an edge without a line.
    inked = (ink > _INK) | (edges < 4)
    room = -np.ones((rows, cols), dtype=int)
    rooms: list[list[tuple[int, int]]] = []
    for r0 in range(rows):
        for c0 in range(cols):
            if room[r0, c0] >= 0 or inked[r0, c0]:
                continue
            rid = len(rooms)
            cells = [(r0, c0)]
            room[r0, c0] = rid
            stack = [(r0, c0)]
            while stack:
                r, c = stack.pop()
                for nr, nc, wall in (
                    (r - 1, c, thick_h[r - 1][c] if r > 0 else 1),
                    (r + 1, c, thick_h[r][c] if r < rows - 1 else 1),
                    (r, c - 1, thick_v[r][c - 1] if c > 0 else 1),
                    (r, c + 1, thick_v[r][c] if c < cols - 1 else 1),
                ):
                    if wall or not (0 <= nr < rows and 0 <= nc < cols) or room[nr, nc] >= 0 or inked[nr, nc]:
                        continue
                    room[nr, nc] = rid
                    cells.append((nr, nc))
                    stack.append((nr, nc))
            rooms.append(cells)
    board = np.zeros((rows, cols), dtype=np.uint8)
    for cells in rooms:
        # Board lines are solid; a clue block's padding cells (blank, behind its digits)
        # have dotted ones. Measured: board rooms >= 0.93, padding rooms <= 0.88.
        if np.mean([cover[r, c] for r, c in cells]) < _SOLID:
            continue
        # A board room is a 5x5 block (or part of one at the board's edge): its boundary
        # is the block lines and the outline, thick, a few of which may read thin. A
        # padding room inside a clue block's solid frame is bounded by thin lines.
        member = set(cells)
        thick = total = 0
        for r, c in cells:
            for nr, nc, wall in (
                (r - 1, c, thick_h[r - 1][c] if r > 0 else 0),
                (r + 1, c, thick_h[r][c] if r < rows - 1 else 0),
                (r, c - 1, thick_v[r][c - 1] if c > 0 else 0),
                (r, c + 1, thick_v[r][c] if c < cols - 1 else 0),
            ):
                if (nr, nc) in member:
                    continue
                total += 1
                thick += wall
        if total == 0 or thick < 0.5 * total:
            continue
        for r, c in cells:
            board[r, c] = 1
    return _tidy(board)


def _tidy(board: NDArray) -> NDArray:
    """Drop stray pieces (fewer than 5 cells; the board is built from 5x5 blocks) and
    fill small holes enclosed by the board (a speck of ink read as a digit)."""
    n, labels, stats, _ = cv2.connectedComponentsWithStats(board.astype(np.uint8), connectivity=4)
    out = np.zeros_like(board)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= 5:
            out[labels == i] = 1
    holes = (1 - out).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(holes, connectivity=4)
    h, w = out.shape
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if area <= 4 and x > 0 and y > 0 and x + bw < w and y + bh < h:
            out[labels == i] = 1
    return out


def detect_irregular(image: NDArray, debug_dir: str | None = None) -> IrregularGeometry:
    board = rectify_board(image, border_image=figure_frame_image(image), debug_dir=debug_dir)
    # The board at the shared normalised cell size: an Android-size upload (cells ~24 px)
    # is scaled up, so lattice fitting, glyph filters and OCR crops see the same cell size
    # as a full scan (at 24 px the clue lattice drifted half a cell and digits misread).
    native = board.warped
    gray = ink_intensity(native)
    lat = fit_lattice(gray)
    h, w = gray.shape[:2]
    dark = dark_mask(gray, max(15, int(min(h, w) / 40)))
    ink = _cell_ink(dark, lat)
    edges, cover = _edge_lines(dark, lat)
    mask = board_mask(gray, lat, ink, edges, cover)
    sh, sw = board.native.shape[:2]
    return IrregularGeometry(
        lattice=lat, board=mask, ink=ink, quad=board.quad, native=native, gray=gray,
        glyphs=glyph_ink(dark, lat.pitch), source=board.native, to_source=(sh / h, sw / w),
    )


@dataclass
class Piece:
    """A segment of the board on the lattice: ``axis`` "row" / "col", the row (or
    column) ``line``, its first cell ``start`` along the line and ``length``."""

    axis: str
    line: int
    start: int
    length: int

    def cell(self, i: int) -> tuple[int, int]:
        """Lattice cell at position ``i`` along the line (may lie past either end)."""
        return (self.line, i) if self.axis == "row" else (i, self.line)


def pieces(board: NDArray) -> list[Piece]:
    rows, cols = board.shape
    out: list[Piece] = []
    for r in range(rows):
        c = 0
        while c < cols:
            if board[r, c] and (c == 0 or not board[r, c - 1]):
                n = 0
                while c + n < cols and board[r, c + n]:
                    n += 1
                out.append(Piece("row", r, c, n))
                c += n
            else:
                c += 1
    for c in range(cols):
        r = 0
        while r < rows:
            if board[r, c] and (r == 0 or not board[r - 1, c]):
                n = 0
                while r + n < rows and board[r + n, c]:
                    n += 1
                out.append(Piece("col", c, r, n))
                r += n
            else:
                r += 1
    return out


def clue_blocks(board: NDArray, inked: NDArray) -> dict[int, tuple[str, list[tuple[int, int]]]]:
    """Each piece's clue block: piece index -> (side, cells in reading order).

    A candidate block is the run of inked, non-board cells just past one end of a piece
    on its line, nearest first. A clue cell belongs to one block only, so pieces with a
    single candidate claim theirs first and their cells leave everyone else's candidates
    (sample 1's notch: a row piece ends against a column's clue block); then each piece
    left with two takes the longer. A piece with none has no clue."""
    rows, cols = board.shape
    ps = pieces(board)

    def run(p: Piece, step: int) -> list[tuple[int, int]]:
        cells = []
        i = p.start - 1 if step < 0 else p.start + p.length
        while True:
            r, c = p.cell(i)
            if not (0 <= r < rows and 0 <= c < cols) or board[r, c] or not inked[r, c]:
                break
            cells.append((r, c))
            i += step
        return cells

    cands: dict[int, dict[str, list[tuple[int, int]]]] = {}
    for k, p in enumerate(ps):
        options = {side: cells for side, cells in (("start", run(p, -1)), ("end", run(p, 1))) if cells}
        if options:
            cands[k] = options
    chosen: dict[int, tuple[str, list[tuple[int, int]]]] = {}
    claimed: set[tuple[int, int]] = set()
    changed = True
    while changed:
        changed = False
        for k, options in list(cands.items()):
            live = {s: cells for s, cells in options.items() if not (set(cells) & claimed)}
            if len(live) == 1:
                side, cells = next(iter(live.items()))
                chosen[k] = (side, cells)
                claimed.update(cells)
                del cands[k]
                changed = True
            elif not live:
                del cands[k]
                changed = True
    for k, options in cands.items():
        live = {s: cells for s, cells in options.items() if not (set(cells) & claimed)}
        if live:
            side, cells = max(live.items(), key=lambda kv: len(kv[1]))
            chosen[k] = (side, cells)
            claimed.update(cells)
    # Reading order: left to right / top to bottom. A start-side block runs away from the
    # board, so it reverses.
    return {k: (side, cells[::-1] if side == "start" else cells) for k, (side, cells) in chosen.items()}

