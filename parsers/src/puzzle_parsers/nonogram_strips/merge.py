"""Place clue strips on the board and combine them into one clue set.

Each strip's position along its axis is fixed by, in order of strength:
- a border: the strip starts at line 0 or ends at the last line;
- the thick lines: every 5th separator is thick, so the offset is known mod 5;
- overlap: neighbouring strips read the same clue lines.

Then every board line takes the readings of the strips covering it. Lines
nobody read, and lines whose readings disagree, are problems for a person to
settle; the merge never guesses between two readings.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from puzzle_parsers.nonogram_strips.reader import StripReading

Axis = Literal["rows", "cols"]


@dataclass
class Placement:
    strip: int  # index into the axis's strips
    offset: int | None  # board index of the strip's first line; None: unplaced
    how: str  # "start_border" | "end_border" | "overlap" | "unplaced: ..."
    agree: int = 0  # overlapping lines that matched when placed by overlap
    disagree: int = 0


@dataclass
class LineResult:
    index: int
    clues: list[int] | None  # None: missing or conflicting
    readings: list[tuple[int, list[int]]] = field(default_factory=list)  # (strip, clues)
    status: str = "ok"  # ok | missing | conflict | flagged
    flags: list[str] = field(default_factory=list)


@dataclass
class AxisResult:
    axis: Axis
    length: int  # number of lines on this axis
    placements: list[Placement]
    lines: list[LineResult]


def _phase_ok(reading: StripReading, offset: int) -> bool:
    """Every thick separator must land on a multiple of 5 (and only those)."""
    if not any(reading.thick):
        return True
    for j, t in enumerate(reading.thick):
        if t != ((offset + j) % 5 == 0):
            return False
    return True


def close(a: list[int], b: list[int]) -> bool:
    """Two readings of one clue line that differ only by a misread number or two.

    The rows at a strip's edge are often blurred (a curled page, a photo's
    falloff), so overlapping strips may read the same line a digit apart.
    Lines at a wrong offset almost never have the same number of clues.
    """
    if len(a) != len(b) or a == b:
        return False
    return sum(x != y for x, y in zip(a, b)) <= max(1, len(a) // 3)


def _overlap_score(
    reading: StripReading, offset: int, placed: dict[int, list[tuple[int, list[int]]]]
) -> tuple[int, int, int]:
    """(agree, near, disagree): lines read alike, a misread apart, and unlike."""
    agree = near = disagree = 0
    for j, line in enumerate(reading.lines):
        if not line.complete or not line.clues:
            continue
        for _, other in placed.get(offset + j, []):
            if other == line.clues:
                agree += 1
            elif close(other, line.clues):
                near += 1
            else:
                disagree += 1
    return agree, near, disagree


def merge_axis(axis: Axis, strips: list[StripReading], length: int) -> AxisResult:
    placements: list[Placement] = [Placement(i, None, "unplaced") for i in range(len(strips))]
    placed: dict[int, list[tuple[int, list[int]]]] = {}

    def put(i: int, offset: int, how: str, agree: int = 0, disagree: int = 0) -> None:
        placements[i] = Placement(i, offset, how, agree, disagree)
        for j, line in enumerate(strips[i].lines):
            if line.complete and line.clues:
                placed.setdefault(offset + j, []).append((i, line.clues))

    for i, s in enumerate(strips):
        n = len(s.lines)
        if s.start_border and s.end_border and n != length:
            placements[i] = Placement(i, None, f"unplaced: shows both borders but {n} lines, not {length}")
        elif s.start_border:
            put(i, 0, "start_border")
        elif s.end_border:
            put(i, length - n, "end_border")

    # Overlap placement, most confident first, until nothing more can be placed.
    while True:
        best = None
        for i, s in enumerate(strips):
            if placements[i].offset is not None or placements[i].how.startswith("unplaced: shows"):
                continue
            n = len(s.lines)
            scored = []
            for o in range(-n + 1, length):
                if not _phase_ok(s, o):
                    continue
                a, near, d = _overlap_score(s, o, placed)
                scored.append((a + near - 3 * d, a, d, o))
            scored.sort(reverse=True)
            if not scored or scored[0][1] < 3:
                continue
            top = scored[0]
            runner = scored[1][0] if len(scored) > 1 else -999
            if top[0] - runner < 3:
                continue  # ambiguous
            if best is None or top[0] > best[1][0]:
                best = (i, top)
        if best is None:
            break
        i, (_, a, d, o) = best
        put(i, o, "overlap", a, d)
    for i, p in enumerate(placements):
        if p.offset is None and p.how == "unplaced":
            placements[i] = Placement(i, None, "unplaced: no border and no unambiguous overlap")

    lines: list[LineResult] = []
    for idx in range(length):
        readings: list[tuple[int, list[int]]] = []
        flags: list[str] = []
        for p in placements:
            if p.offset is None:
                continue
            j = idx - p.offset
            s = strips[p.strip]
            if 0 <= j < len(s.lines) and s.lines[j].complete:
                readings.append((p.strip, s.lines[j].clues))
                flags += [f"strip {p.strip}: {f}" for f in s.lines[j].flags]
        distinct = {tuple(c) for _, c in readings}
        if not readings:
            lines.append(LineResult(idx, None, readings, "missing", flags))
        elif len(distinct) > 1:
            lines.append(LineResult(idx, None, readings, "conflict", flags))
        else:
            clues = list(next(iter(distinct)))
            status = "flagged" if flags or not clues else "ok"
            lines.append(LineResult(idx, clues, readings, status, flags))
    return AxisResult(axis, length, placements, lines)


@dataclass
class Check:
    name: str
    ok: bool
    detail: str
    blocking: bool = True


def check_clues(rows: AxisResult, cols: AxisResult) -> list[Check]:
    """Format checks on the merged clue set (blocking unless noted)."""
    out: list[Check] = []
    for ax, other in ((rows, cols), (cols, rows)):
        bad = [ln.index + 1 for ln in ax.lines if ln.status in ("missing", "conflict")]
        out.append(Check(f"{ax.axis}_complete", not bad,
                         f"{len(bad)} {ax.axis} missing or conflicting: {bad[:20]}" if bad else f"all {ax.length} {ax.axis} read"))
        overflow = [
            ln.index + 1 for ln in ax.lines
            if ln.clues and sum(ln.clues) + len(ln.clues) - 1 > other.length
        ]
        out.append(Check(f"{ax.axis}_fit", not overflow,
                         f"{ax.axis} whose clues don't fit {other.length} cells: {overflow[:20]}" if overflow else "every line fits"))
        flagged = [ln.index + 1 for ln in ax.lines if ln.status == "flagged"]
        out.append(Check(f"{ax.axis}_flags", not flagged,
                         f"{len(flagged)} {ax.axis} to look at: {flagged[:20]}" if flagged else "no suspicious readings",
                         blocking=False))
    if all(ln.clues is not None for ln in rows.lines + cols.lines):
        rs = sum(sum(ln.clues or []) for ln in rows.lines)
        cs = sum(sum(ln.clues or []) for ln in cols.lines)
        out.append(Check("totals", rs == cs, f"row clues add up to {rs}, column clues to {cs}"))
    else:
        out.append(Check("totals", False, "can't compare totals until every line is read"))
    return out
