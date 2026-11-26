"""Read one clue strip into clue lines, in board order.

Every number sits in its own clue cell, counted from the board edge, so a
line's clues are its non-empty cells read away from the board, reversed.
Cells go through the shared ``cell_ocr`` path (multi-digit, no ``0`` clue).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np
from numpy.typing import NDArray

from puzzle_parsers.cell_ocr import crop_cell, read_cells
from puzzle_parsers.nonogram_strips.geometry import (
    Orientation,
    StripGeometry,
    detect_strip,
    without_edge_line,
)


# Each cell is read twice, because a two-digit clue fills its cell nearly
# from dash to dash:
# - TRIMMED cuts a little off each side, which keeps the dashes out but can
#   clip a wide second digit (10 -> 16, 15 -> 1, 19 -> 14);
# - WIDE keeps the full width, which keeps every digit but can read a dash as
#   an extra 1 (25 -> 251).
# Both trim little off top and bottom: with the default 15%, a digit spans
# nearly the whole crop height and the shared glyph cleanup erases a stroke
# that tall near the crop edge as a grid line.
TRIMMED = (0.08, 0.10)
WIDE = (0.08, 0.0)


# Printed digits are solid black. A fold crease or a stain is not, but the
# OCR reads one as a run of 1s (on the 175x110 sample a crease along a column
# read as seven). A cell whose darkest point is lighter than this fraction of
# the way from the strip's ink to its paper holds no print: it's blanked out.
# Measured: real digits <= 0.04, the crease's cells >= 0.08.
FAINT = 0.06

# No clue is 0, so a cell the OCR reads as "0" holds a number it failed to
# read: on the 180x70 sample a clean bold 8 read "0" and vanished from the
# middle of its line. Keep the cell as the digit most often read as 0, and
# hand the repair the others to try.
UNREAD_GUESS = 8
UNREAD_ALTERNATES = [6, 9, 3]


def reconcile(trimmed: int, wide: int, max_clue: int | None = None) -> tuple[int, bool]:
    """One value from the two readings, and whether they disagreed.

    ``max_clue`` is the line length: no clue is longer than its line.
    """
    if trimmed == wide:
        return trimmed, False
    if max_clue is not None and wide > max_clue:
        return trimmed, True
    t, w = str(trimmed) if trimmed else "", str(wide) if wide else ""
    if not w:
        return trimmed, True
    if not t:
        return wide, True
    # The wide crop's extra 1 at either end is a dash.
    if len(w) == len(t) + 1 and ((w.endswith("1") and w[:-1] == t) or (w.startswith("1") and w[1:] == t)):
        return trimmed, True
    # Otherwise the trimmed crop clipped a digit.
    return wide, True


@dataclass
class ClueLine:
    clues: list[int]
    complete: bool  # both separators traced across the whole clue grid
    flags: list[str] = field(default_factory=list)
    # Canonical-image boxes (x1, y1, x2, y2) of the cells holding clues, in
    # clue order: what an editor shows next to the numbers.
    boxes: list[tuple[int, int, int, int]] = field(default_factory=list)
    # Clue position -> the other value(s) a crop read where the two crops
    # disagreed: the first candidates when the clue set needs repairing.
    alternates: dict[int, list[int]] = field(default_factory=dict)


@dataclass
class StripReading:
    orientation: Orientation
    lines: list[ClueLine]  # board order: top to bottom / left to right
    thick: list[bool]  # per separator in board order (len(lines) + 1)
    start_border: bool  # the separator before lines[0] is the board's border
    end_border: bool  # the separator after lines[-1] is the board's border
    geometry: StripGeometry


def box_to_original(box: tuple[int, int, int, int], orientation: Orientation, shape) -> list[int]:
    """A canonical-image cell box in the coordinates of the image as given."""
    x1, y1, x2, y2 = box
    if orientation == "rows":
        return [x1, y1, x2, y2]
    # Canonical = original turned a quarter counter-clockwise:
    # canonical (x, y) is original (W - 1 - y, x).
    w = shape[1]
    return [w - 1 - y2, x1, w - 1 - y1, x2]


def _lines_from_cells(values: list[int], empty: int) -> tuple[list[int], list[int], list[str]]:
    """Clues (away-from-board order reversed) and their cell indices.

    ``values`` run from the cell next to the board outwards.
    """
    filled = [k for k, v in enumerate(values) if v != empty]
    flags: list[str] = []
    if not filled:
        return [], [], ["no_clue"]
    if filled[0] != 0:
        flags.append("detached")  # numbers are right-aligned against the board
    run_end = next((k for k in range(filled[-1] + 1) if values[k] == empty), None)
    if run_end is not None:
        # A blank between numbers: a missed digit, or a ghost read off an
        # empty cell's dashes. A lone number beyond the blank, at the far end
        # of the line, has been a ghost every time: drop it, but say so.
        beyond = [k for k in filled if k > run_end]
        if len(beyond) == 1:
            flags.append(f"ghost_dropped:{values[beyond[0]]}")
            filled = [k for k in filled if k < run_end]
        else:
            flags.append("gap")
    ks = list(reversed(filled))
    return [values[k] for k in ks], ks, flags


def read_strip(
    image: NDArray,
    orientation: Orientation,
    ocr,
    *,
    max_clue: int | None = None,
    geometry: StripGeometry | None = None,
    share: tuple[int, int] | None = None,
) -> StripReading:
    """``max_clue``: the length of the lines this strip clues (the board's
    width for row clues, its height for column clues), when known.

    ``share=(k, n)`` reads only the k-th of n equal blocks of clue lines (in
    board order), so one strip can be read by n requests at once; the other
    lines come back empty, flagged ``not_read``.
    """
    geom = geometry or detect_strip(image, orientation)
    img = without_edge_line(geom)
    h, w = img.shape[:2]
    seps, extents = geom.separators, geom.extents
    common = float(np.median(extents))
    n = len(seps) - 1
    wanted = range(n)
    if share is not None:
        k, parts = share
        board = range(k * n // parts, (k + 1) * n // parts)
        # Column strips list their columns right to left in the canonical image.
        wanted = range(n - board.stop, n - board.start) if orientation == "cols" else board

    gray = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (3, 3), 0)
    ink_level, paper_level = np.percentile(gray, 1), np.percentile(gray, 60)
    faint_at = ink_level + FAINT * (paper_level - ink_level)
    trimmed: list[list[NDArray]] = []
    wide: list[list[NDArray]] = []
    cell_boxes: list[list[tuple[int, int, int, int]]] = []
    for i in range(n):
        xs = geom.number_seps[i] if i in wanted else [0.0]
        row_t, row_w, row_boxes = [], [], []
        for k in range(len(xs) - 1):
            x2, x1 = xs[k], xs[k + 1]
            cx = (x1 + x2) / 2
            y1, y2 = float(seps[i](cx)), float(seps[i + 1](cx))
            a = crop_cell(img, y1, y2, x1, x2, margin=TRIMMED)
            b = crop_cell(img, y1, y2, x1, x2, margin=WIDE)
            if crop_cell(gray, y1, y2, x1, x2, margin=TRIMMED).min() > faint_at:
                a, b = np.full_like(a, 255), np.full_like(b, 255)
            if orientation == "cols":
                # The quarter turn that laid the strip out also laid its
                # digits on their side; stand them back up.
                a = cv2.rotate(a, cv2.ROTATE_90_CLOCKWISE)
                b = cv2.rotate(b, cv2.ROTATE_90_CLOCKWISE)
            row_t.append(a)
            row_w.append(b)
            row_boxes.append((int(x1), int(y1), int(x2), int(y2)))
        trimmed.append(row_t)
        wide.append(row_w)
        cell_boxes.append(row_boxes)

    # Empty cells read -1 and a "0" is kept: no clue is 0, so a 0 is a number
    # the OCR failed to read (see UNREAD_GUESS), not an empty cell.
    read_t = read_cells(ocr, trimmed, allow_multi_digits=True, allow_zero=True)
    # An empty trimmed cell is empty: blank it out of the wide pass, where its
    # dashed sides could read as a 1.
    for i in range(n):
        for k, v in enumerate(read_t[i]):
            if v < 0:
                wide[i][k] = np.full_like(wide[i][k], 255)
    read_w = read_cells(ocr, wide, allow_multi_digits=True, allow_zero=True)
    values: list[list[int]] = []
    unsure: list[dict[int, list[int]]] = []
    for rt, rw in zip(read_t, read_w):
        row_v, row_u = [], {}
        for k, (t, w) in enumerate(zip(rt, rw)):
            if 0 in (t, w) and max(t, w) <= 0:
                # A crop read "0" and neither read a number: one, guessed.
                row_v.append(UNREAD_GUESS)
                row_u[k] = list(UNREAD_ALTERNATES)
                continue
            # From here 0 is empty, the way reconcile counts it.
            v, disagreed = reconcile(max(t, 0), max(w, 0), max_clue)
            row_v.append(v)
            if disagreed:
                row_u[k] = sorted({x for x in (t, w) if x != v and x > 0 and (max_clue is None or x <= max_clue)})
        values.append(row_v)
        unsure.append(row_u)

    canon_lines: list[ClueLine] = []
    for i in range(n):
        if i not in wanted:
            canon_lines.append(ClueLine(clues=[], complete=False, flags=["not_read"]))
            continue
        clues, ks, flags = _lines_from_cells(values[i], empty=0)
        uncertain = [ks.index(k) for k in sorted(unsure[i]) if k in ks]
        if uncertain:
            flags.append("uncertain:" + ",".join(str(u) for u in uncertain))
        alternates = {ks.index(k): alt for k, alt in unsure[i].items() if k in ks and alt}
        reach = max(extents[i], extents[i + 1])
        complete = reach <= common + 0.5 * geom.cell_pitch
        # A clue grid running off the image may hide more numbers further out.
        if common < 0.5 * geom.cell_pitch and ks and max(ks) >= len(values[i]) - 1:
            complete = False
            flags.append("cut_at_image_edge")
        y_mid = [float(seps[i](geom.edge(0))), float(seps[i + 1](geom.edge(0)))]
        if min(y_mid) < 0 or max(y_mid) > h:
            complete = False
        canon_lines.append(
            ClueLine(
                clues=clues, complete=complete, flags=flags,
                boxes=[cell_boxes[i][k] for k in ks], alternates=alternates,
            )
        )

    thick = list(geom.thick)
    start, end = geom.start_border, geom.end_border
    if orientation == "cols":
        # Canonical rows of a column strip list the columns right to left.
        canon_lines.reverse()
        thick.reverse()
        start, end = end, start
    return StripReading(
        orientation=orientation,
        lines=canon_lines,
        thick=thick,
        start_border=start,
        end_border=end,
        geometry=geom,
    )
