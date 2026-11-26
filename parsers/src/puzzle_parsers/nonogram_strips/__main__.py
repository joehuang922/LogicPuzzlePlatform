"""Read big-nonogram clue strips and merge them into one clue set.

    python -m puzzle_parsers.nonogram_strips --width 175 --height 110 \\
        --rows top.jpg bottom.jpg --cols left.jpg right.jpg \\
        --out clues.json [--debug debug_dir]

``--rows`` strips show row clues (left of the board), ``--cols`` strips show
column clues (above it). The JSON holds the merged ``rowClues`` / ``colClues``
(``null`` for a line still to settle), every line's readings and status,
where each strip was placed, the checks, and per strip the cell boxes of each
clue line in the original image, for an editor to show next to the numbers.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2

from puzzle_parsers.nonogram_strips.geometry import draw
from puzzle_parsers.nonogram_strips.merge import check_clues, merge_axis
from puzzle_parsers.nonogram_strips.reader import StripReading, box_to_original, read_strip


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--width", type=int, required=True, help="board columns")
    ap.add_argument("--height", type=int, required=True, help="board rows")
    ap.add_argument("--rows", nargs="*", default=[], help="row clue strip images")
    ap.add_argument("--cols", nargs="*", default=[], help="column clue strip images")
    ap.add_argument("--out", required=True)
    ap.add_argument("--debug", help="write geometry overlays here")
    args = ap.parse_args(argv)

    from puzzle_parsers.recognition import EasyOcrBackend

    ocr = EasyOcrBackend()
    debug = Path(args.debug) if args.debug else None
    if debug:
        debug.mkdir(parents=True, exist_ok=True)

    readings: dict[str, list[StripReading]] = {"rows": [], "cols": []}
    files: dict[str, list[str]] = {"rows": args.rows, "cols": args.cols}
    shapes: dict[str, list] = {"rows": [], "cols": []}
    for axis in ("rows", "cols"):
        for i, path in enumerate(files[axis]):
            img = cv2.imread(path)
            if img is None:
                print(f"can't read {path}", file=sys.stderr)
                return 2
            t = time.time()
            max_clue = args.width if axis == "rows" else args.height
            r = read_strip(img, axis, ocr, max_clue=max_clue)  # type: ignore[arg-type]
            g = r.geometry
            print(
                f"{axis}[{i}] {Path(path).name}: {len(r.lines)} lines "
                f"({sum(ln.complete for ln in r.lines)} complete), borders "
                f"start={r.start_border} end={r.end_border}, "
                f"pitch {g.row_pitch:.0f}/{g.cell_pitch:.0f}px, {time.time() - t:.1f}s",
                file=sys.stderr,
            )
            readings[axis].append(r)
            shapes[axis].append(img.shape)
            if debug:
                d = draw(g)
                s = 2000 / max(d.shape[:2])
                cv2.imwrite(str(debug / f"{axis}_{i}.jpg"), cv2.resize(d, None, fx=s, fy=s, interpolation=cv2.INTER_AREA))

    rows = merge_axis("rows", readings["rows"], args.height)
    cols = merge_axis("cols", readings["cols"], args.width)
    checks = check_clues(rows, cols)

    def axis_json(ax):
        return {
            "placements": [
                {"strip": p.strip, "file": files[ax.axis][p.strip], "offset": p.offset,
                 "how": p.how, "agree": p.agree, "disagree": p.disagree}
                for p in ax.placements
            ],
            "lines": [
                {"index": ln.index, "clues": ln.clues, "status": ln.status, "flags": ln.flags,
                 "readings": [{"strip": s, "clues": c} for s, c in ln.readings]}
                for ln in ax.lines
            ],
        }

    out = {
        "width": args.width,
        "height": args.height,
        "rowClues": [ln.clues for ln in rows.lines],
        "colClues": [ln.clues for ln in cols.lines],
        "rows": axis_json(rows),
        "cols": axis_json(cols),
        "checks": [{"name": c.name, "ok": c.ok, "blocking": c.blocking, "detail": c.detail} for c in checks],
        "strips": {
            axis: [
                {
                    "file": files[axis][i],
                    "startBorder": r.start_border,
                    "endBorder": r.end_border,
                    "lines": [
                        {"clues": ln.clues, "complete": ln.complete, "flags": ln.flags,
                         "boxes": [box_to_original(b, r.orientation, shapes[axis][i]) for b in ln.boxes]}
                        for ln in r.lines
                    ],
                }
                for i, r in enumerate(readings[axis])
            ]
            for axis in ("rows", "cols")
        },
    }
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False))
    for ax in (rows, cols):
        for p in ax.placements:
            print(f"{ax.axis} strip {p.strip}: offset {p.offset} ({p.how}, agree {p.agree}, disagree {p.disagree})", file=sys.stderr)
    for c in checks:
        print(f"[{'ok' if c.ok else ('FAIL' if c.blocking else 'warn')}] {c.name}: {c.detail}", file=sys.stderr)
    return 0 if all(c.ok or not c.blocking for c in checks) else 1


if __name__ == "__main__":
    sys.exit(main())
