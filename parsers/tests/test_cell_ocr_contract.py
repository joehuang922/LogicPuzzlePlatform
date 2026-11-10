"""Every EasyOCR grid parser reads clues through ``puzzle_parsers.cell_ocr``.

All sources print clues in the same Nikoli font, so cropping and recognition
are shared; a parser chooses only its clue rules (``allow_multi_digits``,
``allow_zero``, ``max_value``). These checks stop a
new (or edited) parser from hand-rolling its own crop/OCR path, and from being
left out of ``_OCR_TYPES`` (which silently hands it ``ocr_backend=None`` in
production — hitori shipped that way and read every cell as unreadable).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

PARSERS_ROOT = Path(__file__).resolve().parent.parent
PKG = PARSERS_ROOT / "src" / "puzzle_parsers"
sys.path.insert(0, str(PARSERS_ROOT))

# The OCR implementation itself, and the one shared entry point.
_OCR_CORE = {PKG / "recognition.py", PKG / "cell_ocr.py"}
# Not a grid-cell clue reader: nonogram OCRs the clue strips outside the grid.
_EXEMPT_PACKAGES = {"nonogram"}
# Clues are single digits by the puzzle's rules (combo and unequal sudoku 1-9,
# akari and shakashaka 0-4, slitherlink 0-3); every other puzzle allows
# multi-digit clues. Plain sudoku decides by board size (see below).
_SINGLE_DIGIT_PACKAGES = {
    "combo_sudoku", "unequal_sudoku", "akari", "shakashaka", "slitherlink",
}

_DIRECT_OCR = re.compile(r"\.recognize_cells\(|\.readtext\(|\._reader\b|import easyocr")
_SHARED_READ = re.compile(r"\b(read_cells|read_grid_clues)\(")


def _parser_sources() -> list[Path]:
    return [
        p
        for p in PKG.rglob("*.py")
        if p not in _OCR_CORE
        and p.name != "__main__.py"
        and p.relative_to(PKG).parts[0] not in _EXEMPT_PACKAGES
    ]


def _package(path: Path) -> str:
    return path.relative_to(PKG).parts[0]


def test_no_parser_calls_easyocr_directly():
    offenders = [
        f"{p.relative_to(PKG)}:{i}: {line.strip()}"
        for p in _parser_sources()
        for i, line in enumerate(p.read_text().splitlines(), 1)
        if _DIRECT_OCR.search(line)
    ]
    assert not offenders, (
        "Read cell clues via puzzle_parsers.cell_ocr.read_grid_clues / read_cells "
        "instead of calling the OCR backend directly:\n" + "\n".join(offenders)
    )


def test_only_sudoku_types_disable_multi_digits():
    for p in _parser_sources():
        src = p.read_text()
        for m in re.finditer(r"allow_multi_digits=(True|False)", src):
            expected = "False" if _package(p) in _SINGLE_DIGIT_PACKAGES else "True"
            assert m.group(1) == expected, (
                f"{p.relative_to(PKG)}: allow_multi_digits={m.group(1)}; only "
                f"{sorted(_SINGLE_DIGIT_PACKAGES)} read single-digit clues"
            )


def test_every_shared_ocr_parser_is_in_ocr_types(monkeypatch):
    import lambda_handler

    users = {_package(p) for p in _parser_sources() if _SHARED_READ.search(p.read_text())}
    assert users, "expected at least one parser on the shared cell OCR path"

    # Build each registered parser without loading EasyOCR, then map its class
    # back to its package to see whether it reads clues via cell_ocr.
    sentinel = object()
    monkeypatch.setattr(lambda_handler, "_get_ocr", lambda: sentinel)
    missing = []
    for type_id in range(1, 200):
        parser = lambda_handler._build_parser(type_id)
        if parser is None:
            continue
        pkg = type(parser).__module__.split(".")[1]
        if pkg in users and type_id not in lambda_handler._OCR_TYPES:
            missing.append(f"type {type_id} ({pkg})")
    assert not missing, (
        "These parsers read clues with EasyOCR but are not in lambda_handler._OCR_TYPES, "
        "so production builds them with ocr_backend=None: " + ", ".join(missing)
    )


def test_sudoku_reads_multi_digits_only_above_9x9():
    # A 9x9 board's clues are 1-9; a 16x16 to 30x30 board's run to 16-30.
    src = (PKG / "sudoku" / "parser.py").read_text()
    assert "allow_multi_digits=size > 9, max_value=size" in src


@pytest.mark.parametrize("pkg", sorted(_SINGLE_DIGIT_PACKAGES))
def test_single_digit_packages_exist(pkg):
    assert (PKG / pkg).is_dir()


# A cell sliced straight out of the board by its grid lines, e.g.
# ``gray[y1 + my: y2 - my, x1 + mx: x2 - mx]``.
_HAND_CROP = re.compile(r"\[\s*\(?y[01]\s*(?:\+[^:\]]*)?:\s*y[12]\b")
# Out of the plan's scope: nonogram's clue strips and slitherlink's dot lattice.
_CROP_EXEMPT = {"nonogram", "slitherlink"}


def test_cells_are_cropped_with_crop_cell():
    pkg = Path(__file__).resolve().parent.parent / "src" / "puzzle_parsers"
    offenders = [
        f"{p.relative_to(pkg)}:{i}: {line.strip()}"
        for p in sorted(pkg.glob("*/*.py"))
        if p.parent.name not in _CROP_EXEMPT
        for i, line in enumerate(p.read_text().splitlines(), 1)
        if _HAND_CROP.search(line)
    ]
    assert not offenders, "Crop cells with cell_ocr.crop_cell(..., margin=):\n" + "\n".join(offenders)
