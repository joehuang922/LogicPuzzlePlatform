"""Tests for the Corner Chain parser.

Grid geometry is deterministic and pinned on the real sample photos in
``docs/corner-chain/`` at full size and Android sizes. Both photos also show
parts of the neighbouring puzzles, which guards that the detector picks the one
complete board. Clues need EasyOCR and are left out (no OCR backend: every cell
reads 0); the hand-checked canons in ``<name>.canon.json`` hold the expected
clues for a manual run with ``--ocr easyocr``.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from puzzle_parsers.corner_chain.grid_detector import detect_corner_chain_grid
from puzzle_parsers.corner_chain.parser import CornerChainParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.validate import validate_canon

DOCS_DIR = Path(__file__).parents[2] / "docs" / "corner-chain"
SAMPLES = ["corner-chain-board-1", "corner-chain-board-2"]


@pytest.mark.parametrize("name", SAMPLES)
@pytest.mark.parametrize("width", [None, 1080, 800])
def test_detects_grid_dimensions_on_sample_photos(name, width):
    image = cv2.imread(str(DOCS_DIR / f"{name}.jpg"))
    assert image is not None
    if width is not None:
        image = cv2.resize(
            image, (width, image.shape[0] * width // image.shape[1]), interpolation=cv2.INTER_AREA
        )
    geom = detect_corner_chain_grid(image)
    assert (geom.rows, geom.cols) == (10, 10)
    assert len(geom.h_lines) == 11
    assert len(geom.v_lines) == 11


@pytest.mark.parametrize("name", SAMPLES)
def test_sample_canons_are_valid(name):
    canon = json.loads((DOCS_DIR / f"{name}.canon.json").read_text())
    validate_canon("corner-chain", canon)
    assert CornerChainParser().validate(PuzzleData(puzzle_type="corner-chain", grid=canon))


def test_validate_rejects_no_clues_ragged_or_wrong_type():
    parser = CornerChainParser()
    assert not parser.validate(PuzzleData(puzzle_type="corner-chain", grid={"cells": [[0, 0], [0, 0]]}))
    assert not parser.validate(PuzzleData(puzzle_type="corner-chain", grid={"cells": [[1, 2], [3]]}))
    assert not parser.validate(PuzzleData(puzzle_type="nurikabe", grid={"cells": [[2, 0], [0, 0]]}))
