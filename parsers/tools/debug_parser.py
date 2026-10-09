"""Parser debugging harness for the parse-then-refine workflow.

Given a puzzle *name* and a source image, this reproduces the three views we
look at every time we refine a parser, writing them all to one directory:

  1. **Geometry** — the border/warp/gridline images the parser itself emits via
     ``parse_file(debug_dir=...)``. These show whether quadrilateral contour
     detection and grid-line fitting landed correctly (ghost rows/columns show
     up here, not in OCR).
  2. **Clue-cell montage** — ``byclass.png``, every cell the OCR classified as a
     clue, grouped by predicted value. Reading glyphs against their predicted
     bucket surfaces systematic misclassifications (e.g. a column of 3-glyphs
     under ``=5``) independently of grid alignment. Crops are the *exact* ROIs
     the parser extracted — we instrument ``recognize_cells`` rather than
     re-deriving per-parser crop margins, so this stays correct as parsers
     change.
  3. **Parsed board** — the parser's own final overlay (``04_cells.png`` /
     ``05_parsed.png`` / etc.) plus ``board.json`` and a value ``histogram.txt``.

Optional ``--oracle`` re-reads the same crops with Gemini and prints a
confusion matrix (EasyOCR vs. Gemini), for when the visual audit is
inconclusive and we want an objective accuracy number. It costs one batch of
API calls and needs ``GEMINI_API_KEY``.

Usage::

    python -m tools.debug_parser nurikabe ~/scan.jpg
    python -m tools.debug_parser nurikabe ~/scan.jpg --oracle --out /tmp/foo

This is a *diagnostic* tool: it never writes to the repo or the database, only
to the output directory (default ``/tmp/parser_debug/<name>/``).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import sys
from collections import Counter
from pathlib import Path

import cv2
import numpy as np

# ``lambda_handler`` (the single source of truth for name->parser construction
# and OCR-backend wiring) lives in parsers/, alongside this package's parent.
_PARSERS_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PARSERS_ROOT))

from lambda_handler import _OCR_TYPES, _build_parser  # noqa: E402

# Puzzle name -> type id, mirroring lambda_handler._build_parser's dispatch.
# Keep in sync with that function (and seed.sql) when types are added.
NAME_TO_TYPE: dict[str, int] = {
    "sudoku": 1,
    "combo_sudoku": 2,
    "nurimaze": 3,
    "double_choco": 4,
    "slitherlink": 5,
    "nonogram": 6,
    "masyu": 7,
    "pencils": 8,
    "nuritwin": 9,
    "slalom": 10,
    "shakashaka": 11,
    "kakuro": 12,
    "yajilin": 13,
    "fillomino": 14,
    "lits": 15,
    "choco_banana": 16,
    "number_link": 17,
    "akari": 18,
    "hell_golf": 19,
    "tentaishow": 20,
    "heyawake": 21,
    "shikaku": 22,
    "norinori": 23,
    "nurikabe": 24,
    "ripple_effect": 25,
}


def _normalize_name(name: str) -> str:
    """Accept 'number-link', 'Number Link', 'numberlink' -> 'number_link'."""
    key = name.strip().lower().replace("-", "_").replace(" ", "_")
    if key in NAME_TO_TYPE:
        return key
    collapsed = key.replace("_", "")
    for canonical in NAME_TO_TYPE:
        if canonical.replace("_", "") == collapsed:
            return canonical
    raise SystemExit(
        f"Unknown puzzle name {name!r}. Known: {', '.join(sorted(NAME_TO_TYPE))}"
    )


def _get_ocr_backend(parser):
    """Return the parser's OCR backend, whichever attribute name it uses."""
    return getattr(parser, "_ocr", None) or getattr(parser, "ocr", None)


def _instrument(backend) -> list[dict]:
    """Wrap ``recognize_cells`` to capture (crops, predictions) per call.

    Returns a list that fills in as the parse runs — one entry per
    ``recognize_cells`` invocation (combo_sudoku calls it several times).
    """
    captures: list[dict] = []
    original = backend.recognize_cells

    def wrapped(cells, **kwargs):
        preds = original(cells, **kwargs)
        captures.append({"cells": cells, "preds": preds})
        return preds

    backend.recognize_cells = wrapped
    return captures


def _render_byclass(captures: list[dict], out_path: Path) -> dict[int, int]:
    """Montage every clue-predicted crop, grouped by predicted value.

    Returns the value histogram so the caller can also write it as text.
    """
    by_value: dict[int, list[tuple[int, int, int, np.ndarray]]] = {}
    for ci, cap in enumerate(captures):
        cells, preds = cap["cells"], cap["preds"]
        for r, (row_crops, row_preds) in enumerate(zip(cells, preds)):
            for c, (crop, pred) in enumerate(zip(row_crops, row_preds)):
                if pred and pred > 0 and getattr(crop, "size", 0) > 0:
                    by_value.setdefault(pred, []).append((ci, r, c, crop))

    histogram = {v: len(items) for v, items in sorted(by_value.items())}
    if not by_value:
        return histogram

    TS, HDR, PER_ROW = 140, 120, 10
    blocks = []
    multi_call = len(captures) > 1
    for value in sorted(by_value):
        items = by_value[value]
        n = len(items)
        mrows = math.ceil(n / PER_ROW)
        block = np.full((mrows * TS, HDR + PER_ROW * TS, 3), 255, np.uint8)
        cv2.putText(block, f"={value}", (10, TS // 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 0, 255), 4)
        cv2.putText(block, f"n={n}", (10, TS // 2 + 36),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
        for i, (ci, r, c, crop) in enumerate(items):
            rr, cc = divmod(i, PER_ROW)
            y0, x0 = rr * TS, HDR + cc * TS
            gray = crop if crop.ndim == 2 else cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            tile = cv2.resize(gray, (TS - 10, TS - 26), interpolation=cv2.INTER_AREA)
            block[y0 + 22:y0 + 22 + tile.shape[0], x0 + 5:x0 + 5 + tile.shape[1]] = \
                cv2.cvtColor(tile, cv2.COLOR_GRAY2BGR)
            label = f"{ci}:{r},{c}" if multi_call else f"{r},{c}"
            cv2.putText(block, label, (x0 + 5, y0 + 16),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 0, 0), 1)
        blocks.append(block)

    width = max(b.shape[1] for b in blocks)
    blocks = [cv2.copyMakeBorder(b, 2, 2, 0, width - b.shape[1],
                                 cv2.BORDER_CONSTANT, value=(0, 0, 0))
              for b in blocks]
    cv2.imwrite(str(out_path), np.vstack(blocks))
    return histogram


def _run_oracle(captures: list[dict], out_path: Path) -> None:
    """Re-read captured crops with Gemini; write an EasyOCR-vs-Gemini matrix."""
    if not os.environ.get("GEMINI_API_KEY"):
        print("  [oracle] GEMINI_API_KEY not set; skipping oracle.")
        return
    from puzzle_parsers.recognition import GeminiRecognizer

    prompt = (
        "This image shows cropped cells from a logic-puzzle grid, each labeled "
        "row,col. For each cell, read the printed integer (it may be multi-digit, "
        "e.g. 10, 12), or -1 if the cell is blank. Respond ONLY a JSON array of "
        "arrays (rows), one integer per cell. No explanation."
    )
    rec = GeminiRecognizer(model="gemini-2.5-flash")

    lines: list[str] = []
    disagreements = Counter()
    total = diff = 0
    for ci, cap in enumerate(captures):
        cells, preds = cap["cells"], cap["preds"]
        try:
            oracle = rec.recognize(cells, prompt, max_cells_per_batch=400)
        except Exception as exc:  # noqa: BLE001 - oracle is best-effort
            lines.append(f"call {ci}: oracle failed: {exc}")
            continue
        for r, (prow, orow) in enumerate(zip(preds, oracle)):
            for c, (p, o) in enumerate(zip(prow, orow)):
                o = o if (isinstance(o, int) and o > 0) else 0
                if p == 0 and o == 0:
                    continue  # both agree blank; not interesting
                total += 1
                if p != o:
                    diff += 1
                    disagreements[(p, o)] += 1
                    lines.append(f"  ({r:2d},{c:2d}) easyocr={p} gemini={o}")

    header = [
        f"non-blank cells compared: {total}",
        f"disagreements: {diff} ({100 * diff / total:.0f}%)" if total else "no cells",
        "",
        "confusion (easyocr -> gemini : count):",
    ]
    header += [f"  {p} -> {o} : {n}" for (p, o), n in disagreements.most_common()]
    header += ["", "per-cell disagreements:"]
    out_path.write_text("\n".join(header + lines) + "\n")
    print(f"  [oracle] {diff}/{total} disagree -> {out_path.name}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Debug a puzzle parser on one image")
    ap.add_argument("name", help="Puzzle name, e.g. nurikabe, number-link")
    ap.add_argument("image", help="Path to the source image")
    ap.add_argument("--out", default=None, help="Output dir (default /tmp/parser_debug/<name>)")
    ap.add_argument("--oracle", action="store_true", help="Also run the Gemini confusion matrix")
    args = ap.parse_args()

    name = _normalize_name(args.name)
    ptype = NAME_TO_TYPE[name]
    image_path = Path(args.image).expanduser()
    if not image_path.exists():
        raise SystemExit(f"Image not found: {image_path}")

    out = Path(args.out) if args.out else Path(f"/tmp/parser_debug/{name}")
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    print(f"=== debug_parser: {name} (type {ptype}) ===")
    print(f"  image: {image_path}")
    print(f"  out:   {out}")

    parser = _build_parser(ptype)
    if parser is None:
        raise SystemExit(f"No parser for type {ptype}")

    captures: list[dict] = []
    backend = _get_ocr_backend(parser)
    is_ocr = ptype in _OCR_TYPES and backend is not None
    if is_ocr:
        captures = _instrument(backend)
    else:
        print("  (non-OCR parser: geometry + board only, no clue montage)")

    board = parser.parse_file(str(image_path), debug_dir=str(out))

    # Board JSON + histogram.
    grid = board.model_dump() if hasattr(board, "model_dump") else board
    (out / "board.json").write_text(json.dumps(grid, indent=2) + "\n")

    hist = _render_byclass(captures, out / "byclass.png") if captures else {}
    if captures:
        positives = sum(hist.values())
        hist_lines = [f"clue-cell predictions: {positives} positive",
                      f"histogram: {dict(hist)}"]
        (out / "histogram.txt").write_text("\n".join(hist_lines) + "\n")

    if args.oracle and captures:
        _run_oracle(captures, out / "oracle.txt")

    # Manifest: list what landed, grouped by role.
    geometry = sorted(p.name for p in out.glob("*.png") if p.name != "byclass.png")
    print("\n=== outputs ===")
    print("  geometry / board images:")
    for f in geometry:
        print(f"    {out / f}")
    if captures:
        print(f"  clue-cell montage: {out / 'byclass.png'}")
        print(f"  histogram:         {out / 'histogram.txt'}  {dict(hist)}")
    print(f"  board JSON:        {out / 'board.json'}")
    if args.oracle and captures:
        print(f"  oracle matrix:     {out / 'oracle.txt'}")


if __name__ == "__main__":
    main()
