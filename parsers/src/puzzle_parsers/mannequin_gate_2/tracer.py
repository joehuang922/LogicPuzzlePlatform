"""Trace Mannequin Gate 2's gray lines on a rectified board.

The lines are thick hatched gray strokes from cell centre to cell centre (8 directions),
each end overhanging its end cell's centre by about a quarter cell. Steps:

1. Stroke mask: blur away the hatching, keep what's darker than the paper, and open with
   a disc wider than the thin grid lines so only the thick strokes remain.
2. Steps: a pair of 8-neighbour cells is joined when nearly every sample on the segment
   between their centres lies on the mask. The segment may be shifted sideways by up to
   a quarter cell: some strokes are printed off-centre (puzzle 3's U).
3. Stubs: a direction from a cell's centre with no step but a stroke overhanging the
   centre (samples at ~0.12-0.22 cell out) marks a line ending in that cell.
4. Pairing at each cell: opposite steps go straight through (crossing lines continue to
   the opposite side, by the rule). Of the steps left, those with a stub opposite are
   ends, and the rest turn: two plain steps turn into each other, and one plain step
   turns into a stubbed one (an off-centre turn overhangs too). Two lines ending in one
   cell, like puzzle 3's ``t``, both overhang, so they stay two ends.
5. Walk the pairings from each end to get every line as its list of cells.
"""
from __future__ import annotations

import cv2
import numpy as np
from numpy.typing import NDArray

DIRS = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]


def stroke_mask(warped_gray: NDArray, cell: float) -> NDArray:
    """Binary mask (uint8 0/1) of the thick gray strokes."""
    sigma = max(1.0, cell * 0.02)
    blur = cv2.GaussianBlur(warped_gray, (0, 0), sigma)
    paper = float(np.percentile(blur, 90))
    mask = (blur < paper - 45).astype(np.uint8)
    d = max(3, int(round(cell * 0.07)) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (d, d))
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)


def _frac_on(mask: NDArray, p0: tuple[float, float], p1: tuple[float, float], n: int = 24) -> float:
    h, w = mask.shape
    hits = 0
    for t in np.linspace(0.0, 1.0, n):
        x = p0[0] + (p1[0] - p0[0]) * t
        y = p0[1] + (p1[1] - p0[1]) * t
        xi, yi = int(round(x)), int(round(y))
        if 0 <= xi < w and 0 <= yi < h and mask[yi, xi]:
            hits += 1
    return hits / n


def read_gate_lines(mask: NDArray, h_lines: list[int], v_lines: list[int]) -> list[list[list[int]]]:
    rows, cols = len(h_lines) - 1, len(v_lines) - 1
    cy = [(h_lines[r] + h_lines[r + 1]) / 2 for r in range(rows)]
    cx = [(v_lines[c] + v_lines[c + 1]) / 2 for c in range(cols)]
    cell = float(np.mean(np.diff(h_lines)) + np.mean(np.diff(v_lines))) / 2

    def centre(r: int, c: int) -> tuple[float, float]:
        return cx[c], cy[r]

    # 2. Steps between 8-neighbours.
    step: dict[tuple[int, int, int], bool] = {}
    for r in range(rows):
        for c in range(cols):
            for k, (dr, dc) in enumerate(DIRS[:4]):
                nr, nc = r + dr, c + dc
                if not (0 <= nr < rows and 0 <= nc < cols):
                    continue
                a, b = centre(r, c), centre(nr, nc)
                length = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
                px, py = -(b[1] - a[1]) / length * cell, (b[0] - a[0]) / length * cell
                on = False
                for off in (0.0, 0.12, -0.12, 0.24, -0.24):
                    ox, oy = px * off, py * off
                    p0 = (a[0] + (b[0] - a[0]) * 0.15 + ox, a[1] + (b[1] - a[1]) * 0.15 + oy)
                    p1 = (a[0] + (b[0] - a[0]) * 0.85 + ox, a[1] + (b[1] - a[1]) * 0.85 + oy)
                    if _frac_on(mask, p0, p1) >= 0.9:
                        on = True
                        break
                step[(r, c, k)] = on
                step[(nr, nc, k + 4)] = on

    def has_step(r: int, c: int, k: int) -> bool:
        return step.get((r, c, k), False)

    # 3. Stubs: a stroke overhanging the centre in a direction with no step.
    def has_stub(r: int, c: int, k: int) -> bool:
        dr, dc = DIRS[k]
        norm = (dr * dr + dc * dc) ** 0.5
        x, y = centre(r, c)
        ux, uy = dc / norm * cell, dr / norm * cell
        p0 = (x + ux * 0.12, y + uy * 0.12)
        p1 = (x + ux * 0.22, y + uy * 0.22)
        return _frac_on(mask, p0, p1, n=8) >= 0.85

    # 4. Pair the half-edges at each cell: partner[(r, c, k)] = k2, or None for an end.
    partner: dict[tuple[int, int, int], int | None] = {}
    for r in range(rows):
        for c in range(cols):
            ks = [k for k in range(8) if has_step(r, c, k)]
            plain: list[int] = []
            stubbed: list[int] = []
            for k in ks:
                if (r, c, k) in partner:
                    continue
                opp = (k + 4) % 8
                if has_step(r, c, opp):
                    partner[(r, c, k)] = opp
                    partner[(r, c, opp)] = k
                elif has_stub(r, c, opp):
                    stubbed.append(k)
                else:
                    plain.append(k)
            for k in plain + stubbed:
                partner[(r, c, k)] = None
            if len(plain) == 2:
                turn = plain
            elif len(plain) == 1 and stubbed:
                turn = [plain[0], stubbed[0]]
            else:
                turn = []
            if turn:
                partner[(r, c, turn[0])] = turn[1]
                partner[(r, c, turn[1])] = turn[0]

    # 5. Walk from each end.
    lines: list[list[list[int]]] = []
    used: set[tuple[int, int, int]] = set()
    for (r, c, k), p in sorted(partner.items()):
        if p is not None or (r, c, k) in used:
            continue
        cells = [[r, c]]
        cr, cc, ck = r, c, k
        while True:
            used.add((cr, cc, ck))
            dr, dc = DIRS[ck]
            cr, cc = cr + dr, cc + dc
            ck = (ck + 4) % 8
            used.add((cr, cc, ck))
            cells.append([cr, cc])
            nxt = partner.get((cr, cc, ck))
            if nxt is None or len(cells) > rows * cols:
                break
            ck = nxt
        lines.append(cells)
    return lines
