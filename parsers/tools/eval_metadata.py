"""Measure title/author extraction against hand-labelled sample scans.

Runs only grid detection plus the metadata call for each entry in
``metadata_expected.json`` (no cell OCR), then prints per-image results and
exact-match rates. Comparison is NFKC-normalized, so full-width "！" matches "!".
Costs one Gemini call per image and needs ``GEMINI_API_KEY``.

Usage::

    python -m tools.eval_metadata                 # all labelled images
    python -m tools.eval_metadata --type nonogram
    python -m tools.eval_metadata --crops /tmp/metadata_crops   # also save crops
"""
from __future__ import annotations

import argparse
import json
import unicodedata
from pathlib import Path

import cv2

from puzzle_parsers.metadata_extract import (
    context_crop,
    default_metadata_extractor,
    locate_board,
)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_EXPECTED = Path(__file__).with_name("metadata_expected.json")


def _detect_quad(puzzle_type: str, image):
    """Board corners as parse() would get them: the type's own quad, else generic."""
    if puzzle_type == "shakashaka":
        from puzzle_parsers.shakashaka.grid_detector import detect_shakashaka_grid
        return detect_shakashaka_grid(image).quad
    if puzzle_type == "nurikabe":
        from puzzle_parsers.nurikabe.grid_detector import detect_nurikabe_grid
        return detect_nurikabe_grid(image).quad
    if puzzle_type == "nonogram":
        from puzzle_parsers.nonogram.grid_detector import detect_nonogram_grid
        return detect_nonogram_grid(image).quad
    return locate_board(image)


def _norm(value: str | None) -> str | None:
    if value is None:
        return None
    return " ".join(unicodedata.normalize("NFKC", value).split())


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--type", help="only evaluate this puzzle type")
    ap.add_argument("--crops", type=Path, help="directory to save the crops sent")
    args = ap.parse_args()

    extractor = default_metadata_extractor()
    if extractor is None:
        raise SystemExit("Metadata extractor unavailable (GEMINI_API_KEY set?)")

    cases = json.loads(_EXPECTED.read_text())
    if args.type:
        cases = [c for c in cases if c["type"] == args.type]
    if args.crops:
        args.crops.mkdir(parents=True, exist_ok=True)

    hits = {"title": 0, "author": 0}
    for case in cases:
        path = _REPO_ROOT / case["image"]
        image = cv2.imread(str(path))
        crop = context_crop(image, _detect_quad(case["type"], image))
        if args.crops:
            cv2.imwrite(str(args.crops / f"{path.stem}.jpg"), crop)
        try:
            found = extractor.extract(crop)
        except Exception as exc:  # noqa: BLE001 - report and keep evaluating
            found = {"title": None, "author": None}
            print(f"  ! {path.name}: {type(exc).__name__}: {exc}")

        marks = []
        for field in ("title", "author"):
            ok = _norm(found[field]) == _norm(case[field])
            hits[field] += ok
            marks.append(
                f"{field}={found[field]!r}"
                + ("" if ok else f" (expected {case[field]!r})")
            )
        status = "ok  " if all(_norm(found[f]) == _norm(case[f]) for f in hits) else "MISS"
        print(f"{status} {path.name}: " + ", ".join(marks))

    n = len(cases)
    if n:
        print(
            f"\ntitle {hits['title']}/{n}  author {hits['author']}/{n}  "
            f"({n} images)"
        )


if __name__ == "__main__":
    main()
