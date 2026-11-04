"""Tests for the Tentai Show parser.

Dot detection on the sample boards in ``docs/tentaishow/``. No OCR, so the
pipeline is deterministic and both samples are pinned to their answer keys:
the Easy board was hand-checked, the Medium board matches the production key.
Also checked as an Android-style JPEG: HoughCircles used to lose 8 more dots
to compression.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.tentaishow.parser import TentaishowParser

DOCS_DIR = Path(__file__).parents[2] / "docs" / "tentaishow"
SAMPLES = ["board-tentaishow", "board-tentaishow-medium"]


def _dots(board) -> set[tuple[int, int, int]]:
    return {(d.dr, d.dc, d.color) for d in board.dots}


def _expected(name: str) -> tuple[tuple[int, int], set[tuple[int, int, int]]]:
    key = json.loads((DOCS_DIR / f"{name}.canon.json").read_text())
    return (key["width"], key["height"]), {(d["dr"], d["dc"], d["color"]) for d in key["dots"]}


@pytest.mark.parametrize("name", SAMPLES)
def test_sample_matches_key(name):
    size, dots = _expected(name)
    board = TentaishowParser().parse_file(DOCS_DIR / f"{name}.png")
    assert (board.width, board.height) == size
    assert _dots(board) == dots


@pytest.mark.parametrize("name", SAMPLES)
def test_sample_matches_key_after_jpeg(name):
    size, dots = _expected(name)
    image = cv2.imread(str(DOCS_DIR / f"{name}.png"))
    image = cv2.imdecode(cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 85])[1], 1)
    board = TentaishowParser()._parse_image(image)
    assert (board.width, board.height) == size
    assert _dots(board) == dots
