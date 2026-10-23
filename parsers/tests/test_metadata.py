"""Tests for best-effort title/author extraction around the board."""
from __future__ import annotations

import inspect
import sys
import threading
from unittest.mock import patch

import cv2
import numpy as np
import pytest
from PIL import Image

from puzzle_parsers import PuzzleData, PuzzleMetadata, PuzzleParser, metadata_extract
from puzzle_parsers.metadata_extract import (
    MAX_CROP_SIDE,
    MetadataExtractor,
    context_crop,
    metadata_from_response,
)
from puzzle_parsers.recognition import CellRecognizer

QUAD = np.float32([[100, 100], [300, 100], [300, 300], [100, 300]])


class _FakeRecognizer(CellRecognizer):
    def __init__(self, reply: object = None, error: Exception | None = None) -> None:
        self.reply = reply
        self.error = error
        self.images: list[Image.Image] = []
        self.prompts: list[str] = []
        self.threads: list[str] = []

    def recognize(self, cells, prompt, *, max_cells_per_batch=200):
        raise NotImplementedError

    def recognize_full_image(self, image_path, prompt):
        self.images.append(Image.open(image_path).copy())
        self.prompts.append(prompt)
        self.threads.append(threading.current_thread().name)
        if self.error is not None:
            raise self.error
        return self.reply

    @property
    def supports_full_image(self) -> bool:
        return True


class _BoardParser(PuzzleParser):
    puzzle_type = "dummy"
    locates_board = True

    def __init__(self, extractor=None, title: str | None = None) -> None:
        self.metadata_extractor = extractor
        self._title = title

    def _parse(self, image: Image.Image) -> PuzzleData:
        self._board_located(np.array(image)[:, :, ::-1], QUAD)
        return PuzzleData(
            puzzle_type=self.puzzle_type,
            metadata=PuzzleMetadata(title=self._title),
        )

    def validate(self, data: PuzzleData) -> bool:
        return True


@pytest.fixture(autouse=True)
def _no_canon_validation():
    with patch("puzzle_parsers.base.validate_canon"):
        yield


def _page() -> Image.Image:
    return Image.new("RGB", (400, 600), "white")


# --- metadata_from_response -------------------------------------------------

def test_number_and_author():
    assert metadata_from_response(
        {"number": "4", "title_text": None, "author": "セダム"}
    ) == {"title": "4", "author": "セダム"}


def test_number_and_title_text_combine():
    assert metadata_from_response(
        {"number": "30", "title_text": "ふわふわゆらり", "author": None}
    ) == {"title": "30 ふわふわゆらり", "author": None}


def test_full_width_number_is_normalized():
    assert metadata_from_response({"number": "２３"})["title"] == "23"


def test_non_numeric_number_is_dropped():
    assert metadata_from_response(
        {"number": "QUESTION", "title_text": "元気に遊ぼう!"}
    )["title"] == "元気に遊ぼう!"


@pytest.mark.parametrize("raw", [None, [], "4", {"number": "null", "author": ""}])
def test_junk_yields_nothing(raw):
    assert metadata_from_response(raw) == {"title": None, "author": None}


def test_overlong_author_is_dropped():
    assert metadata_from_response({"author": "x" * 200})["author"] is None


def test_whitespace_is_collapsed():
    assert metadata_from_response({"author": "  Joe\n Smith "})["author"] == "Joe Smith"


# --- context_crop -----------------------------------------------------------

def test_crop_keeps_margin_and_outlines_board_in_red():
    page = np.full((1000, 1000, 3), 255, np.uint8)
    crop = context_crop(page, QUAD)
    # 0.6 x 200px margin, clamped at the top-left page edge.
    assert crop.shape[:2] == (420, 420)
    b, g, r = crop[100, 150]  # on the box's top edge
    assert (b, g, r) == (0, 0, 255)


def test_crop_accepts_grayscale():
    page = np.full((500, 500), 255, np.uint8)
    assert context_crop(page, QUAD).ndim == 3


def test_crop_is_downscaled():
    page = np.full((6000, 6000, 3), 255, np.uint8)
    quad = np.float32([[1000, 1000], [5000, 1000], [5000, 5000], [1000, 5000]])
    assert max(context_crop(page, quad).shape[:2]) == MAX_CROP_SIDE


# --- MetadataExtractor ------------------------------------------------------

def test_extractor_sends_crop_and_prompt():
    rec = _FakeRecognizer({"number": "1", "author": "みのり"})
    crop = np.zeros((50, 80, 3), np.uint8)
    assert MetadataExtractor(rec).extract(crop) == {"title": "1", "author": "みのり"}
    assert rec.images[0].size == (80, 50)
    assert "RED" in rec.prompts[0]


# --- PuzzleParser wiring ----------------------------------------------------

def test_parse_merges_metadata_off_thread():
    rec = _FakeRecognizer({"number": "4", "author": "セダム"})
    data = _BoardParser(MetadataExtractor(rec)).parse(_page())
    assert data.metadata.title == "4"
    assert data.metadata.author == "セダム"
    assert rec.threads[0].startswith("metadata")


def test_parser_title_wins():
    rec = _FakeRecognizer({"number": "4", "author": "セダム"})
    data = _BoardParser(MetadataExtractor(rec), title="Mine").parse(_page())
    assert data.metadata.title == "Mine"
    assert data.metadata.author == "セダム"


def test_extraction_failure_does_not_fail_parse():
    rec = _FakeRecognizer(error=RuntimeError("boom"))
    data = _BoardParser(MetadataExtractor(rec)).parse(_page())
    assert data.metadata.title is None
    assert data.metadata.author is None


def test_only_first_board_located_counts():
    rec = _FakeRecognizer({"number": "1"})

    class Twice(_BoardParser):
        def _parse(self, image):
            self._board_located(np.array(image), QUAD)
            return super()._parse(image)

    Twice(MetadataExtractor(rec)).parse(_page())
    assert len(rec.images) == 1


class _PlainParser(PuzzleParser):
    """A parser that never reports its board, like most parsers."""

    puzzle_type = "plain"

    def __init__(self, extractor) -> None:
        self.metadata_extractor = extractor

    def _parse(self, image: Image.Image) -> PuzzleData:
        return PuzzleData(puzzle_type=self.puzzle_type)

    def validate(self, data: PuzzleData) -> bool:
        return True


def test_parser_without_quad_gets_generic_board():
    rec = _FakeRecognizer({"number": "5", "author": "四代目久方七"})
    page = np.full((1400, 1400, 3), 255, np.uint8)
    cv2.rectangle(page, (500, 500), (900, 900), (0, 0, 0), 6)
    data = _PlainParser(MetadataExtractor(rec)).parse(Image.fromarray(page))
    assert data.metadata.title == "5"
    assert data.metadata.author == "四代目久方七"
    # Crop is the detected 400px board plus a 240px margin each side.
    w, h = rec.images[0].size
    assert 860 <= w <= 900 and 860 <= h <= 900
    assert rec.threads[0].startswith("metadata")


def test_parser_with_quad_skips_generic_board():
    rec = _FakeRecognizer({"number": "1"})
    with patch("puzzle_parsers.base.locate_board") as generic:
        _BoardParser(MetadataExtractor(rec)).parse(_page())
    generic.assert_not_called()
    assert len(rec.images) == 1


def test_generic_board_failure_does_not_fail_parse():
    rec = _FakeRecognizer({"number": "1"})
    with patch("puzzle_parsers.base.locate_board", side_effect=RuntimeError("boom")):
        data = _PlainParser(MetadataExtractor(rec)).parse(_page())
    assert data.metadata.title is None
    assert rec.images == []


def test_parsers_that_skip_generic_board_report_their_own():
    # Every other parser falls back to the generic board; one that opts out
    # must report a quad itself, or it would silently lose title/author.
    for cls in _all_parser_classes():
        if cls.locates_board:
            assert "_board_located" in inspect.getsource(sys.modules[cls.__module__]), cls


def _all_parser_classes():
    import importlib
    import pkgutil

    import puzzle_parsers

    for mod in pkgutil.iter_modules(puzzle_parsers.__path__):
        if mod.ispkg:
            try:
                importlib.import_module(f"puzzle_parsers.{mod.name}.parser")
            except ModuleNotFoundError:
                continue
    stack = list(PuzzleParser.__subclasses__())
    seen = []
    while stack:
        cls = stack.pop()
        if cls.__module__.startswith("puzzle_parsers.") and cls not in seen:
            seen.append(cls)
        stack.extend(cls.__subclasses__())
    assert seen
    return seen


def test_board_located_outside_parse_is_noop():
    rec = _FakeRecognizer({"number": "1"})
    _BoardParser(MetadataExtractor(rec))._board_located(np.zeros((10, 10, 3), np.uint8), QUAD)
    assert rec.images == []


def test_disabled_default_extractor(monkeypatch):
    monkeypatch.setenv("PARSER_METADATA", "0")
    data = _BoardParser().parse(_page())
    assert data.metadata.title is None


def test_unavailable_default_extractor_is_skipped(monkeypatch):
    monkeypatch.delenv("PARSER_METADATA", raising=False)
    monkeypatch.setattr(metadata_extract, "_default_extractor", None)
    monkeypatch.setattr(metadata_extract, "_default_failed", False)
    with patch(
        "puzzle_parsers.recognition.GeminiRecognizer", side_effect=RuntimeError("no key")
    ):
        data = _BoardParser().parse(_page())
    assert data.metadata.title is None
    assert metadata_extract._default_failed is True


def test_eval_fixtures_point_at_real_images():
    import json
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    cases = json.loads((root / "parsers/tools/metadata_expected.json").read_text())
    assert cases
    for case in cases:
        assert (root / case["image"]).is_file(), case["image"]
        assert set(case) == {"image", "type", "title", "author"}
