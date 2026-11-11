"""Tests for the Shikaku parser on phone photos.

Pinned against hand-checked canons in ``docs/shikaku/`` (photos of Nikoli 193 boards
at Android upload size, 2000px long side). In several of them a disc sits off-centre
in its cell, so its number reaches the edge of the OCR crop; the parser used to take
such a number for paper and drop the clue.

Clues are white numbers on dark discs, lifted to dark-on-light by ``_disc_digit`` and
read by EasyOCR through ``cell_ocr.read_cells``. A canned backend returns the canon so
the test is fast and deterministic; it checks that exactly the clue cells reach the
recognizer and that each one carries a glyph the recognizer can read. (Live EasyOCR
matched every canon exactly when these tests were written.)
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.recognition import OcrBackend, _is_blank, _render_glyph
from puzzle_parsers.shikaku.parser import ShikakuParser

DOCS_DIR = Path(__file__).parents[2] / "docs" / "shikaku"
SAMPLES = [f"photo-nikoli193-{n}" for n in (1, 2, 3, 4, 9)]


class _CannedOcr(OcrBackend):
    """Answers each crop with the canon clue at the same position, in order."""

    def __init__(self, clues: list[int]):
        self.clues = clues
        self.crops: list = []

    def recognize_cells(self, cells, *, multi_digit=False, min_confidence=0.0, allowlist=None):
        self.crops = [c for row in cells for c in row]
        assert len(self.crops) == len(self.clues)
        return [list(self.clues)]

    @property
    def supports_full_image(self) -> bool:
        return False

    def recognize_full_image(self, image_path, num_subboards):  # pragma: no cover
        raise NotImplementedError


def _expected(name: str) -> list[list[int]]:
    return json.loads((DOCS_DIR / f"{name}.canon.json").read_text())["cells"]


@pytest.mark.parametrize("name", SAMPLES)
def test_canon_is_a_valid_shikaku(name):
    cells = _expected(name)
    assert sum(map(sum, cells)) == len(cells) * len(cells[0])


@pytest.mark.parametrize("name", SAMPLES)
def test_every_clue_reaches_the_recognizer_readable(name):
    expected = _expected(name)
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    assert image is not None
    ocr = _CannedOcr([v for row in expected for v in row if v])
    board = ShikakuParser(ocr_backend=ocr)._parse_image(image)
    assert board.cells == expected
    for crop in ocr.crops:
        assert not _is_blank(crop)
        assert _render_glyph(crop) is not None
