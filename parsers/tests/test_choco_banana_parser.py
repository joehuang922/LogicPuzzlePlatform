"""Tests for the Choco Banana parser.

Grid geometry is deterministic and pinned against the hand-checked canons in
``docs/choco-banana/`` (10x10 and 17x17) at full and Android upload size (longest side
2000px; both samples are smaller, so Android sends them as is, and a 1080-wide copy
stands in for a phone photo scaled on the way up).

Clues are plain numbers read by EasyOCR through ``cell_ocr.read_grid_clues``. A canned
backend returns the canon so the test is fast and deterministic; it checks that every
cell is cropped and that reads pass through to the canon. (Live EasyOCR at native size
matched both canons exactly when these tests were written.)
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

import lambda_handler
from puzzle_parsers.choco_banana.parser import ChocoBananaParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import OcrBackend

DOCS_DIR = Path(__file__).parents[2] / "docs" / "choco-banana"
SAMPLES = ["board-choco-banana", "board-choco-banana-medium"]


class _CannedOcr(OcrBackend):
    def __init__(self, grid: list[list[int]]):
        self.grid = grid
        self.shape: tuple[int, int] | None = None

    def recognize_cells(self, cells, *, multi_digit=False, min_confidence=0.0, allowlist=None):
        self.shape = (len(cells), len(cells[0]))
        return [row[:] for row in self.grid]

    @property
    def supports_full_image(self) -> bool:
        return False

    def recognize_full_image(self, image_path, num_subboards):  # pragma: no cover
        raise NotImplementedError


def _expected(name: str) -> list[list[int]]:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())["cells"]


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("width", [None, 1080])
def test_parse_matches_canon_with_ocr_canned(name, width):
    expected = _expected(name)
    image = cv2.imread(str(DOCS_DIR / f"{name}.png"))
    assert image is not None
    if width is not None:
        image = cv2.resize(image, (width, image.shape[0] * width // image.shape[1]), interpolation=cv2.INTER_CUBIC)
    ocr = _CannedOcr(expected)
    board = ChocoBananaParser(ocr_backend=ocr)._parse_image(image)
    assert ocr.shape == (len(expected), len(expected[0]))
    assert board.cells == expected


def test_reads_with_easyocr_in_production():
    assert 16 in lambda_handler._OCR_TYPES


def test_validate():
    p = ChocoBananaParser()
    assert p.validate(PuzzleData(puzzle_type="choco_banana", grid={"cells": [[0, 2], [5, 0]]}))
    assert not p.validate(PuzzleData(puzzle_type="choco_banana", grid={"cells": [[0, -1], [0, 0]]}))
    assert not p.validate(PuzzleData(puzzle_type="choco_banana", grid={"cells": [[1]]}))
