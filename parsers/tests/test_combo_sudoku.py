from unittest.mock import MagicMock, patch

import numpy as np
from PIL import Image

from puzzle_parsers.combo_sudoku.models import ComboSudokuBoard, SubBoard
from puzzle_parsers.recognition import OcrBackend
from puzzle_parsers.combo_sudoku.parser import ComboSudokuParser


SAMPLE_HINTS = [[0] * 9 for _ in range(9)]
SAMPLE_HINTS[0][4] = 2
SAMPLE_HINTS[0][5] = 5


class FakeOcrBackend(OcrBackend):
    """Test double that returns canned results without any external calls."""

    def __init__(self, hints: list[list[int]] | None = None, num_subboards: int = 4):
        self._hints = hints or SAMPLE_HINTS
        self._num_subboards = num_subboards

    @property
    def supports_full_image(self) -> bool:
        return True

    def recognize_cells(self, cells):
        return self._hints

    def recognize_full_image(self, image_path, num_subboards):
        return [self._hints] * num_subboards


def test_validate_valid():
    parser = ComboSudokuParser()
    from puzzle_parsers.models import PuzzleData

    board = ComboSudokuBoard(
        room_width=3,
        room_height=3,
        subboards=[
            SubBoard(x=2, y=0, hints=[list(range(9)) for _ in range(9)]),
        ],
    )
    data = PuzzleData(puzzle_type="combo_sudoku", grid=board.model_dump())
    assert parser.validate(data) is True


def test_validate_wrong_type():
    parser = ComboSudokuParser()
    from puzzle_parsers.models import PuzzleData

    data = PuzzleData(puzzle_type="other")
    assert parser.validate(data) is False


def test_validate_bad_grid():
    parser = ComboSudokuParser()
    from puzzle_parsers.models import PuzzleData

    data = PuzzleData(
        puzzle_type="combo_sudoku",
        grid={"room_width": 3, "room_height": 3, "subboards": [{"x": 0, "y": 0, "hints": [[1, 2]]}]},
    )
    assert parser.validate(data) is False


def test_to_json(tmp_path):
    parser = ComboSudokuParser()
    board = ComboSudokuBoard(
        room_width=3,
        room_height=3,
        subboards=[SubBoard(x=2, y=0, hints=SAMPLE_HINTS)],
    )
    out = tmp_path / "test.json"
    parser.to_json(board, out)
    import json

    result = json.loads(out.read_text())
    assert result["room_width"] == 3
    assert result["subboards"][0]["x"] == 2
    assert result["subboards"][0]["hints"][0][4] == 2


def test_parse_file_with_fake_backend(tmp_path):
    backend = FakeOcrBackend()
    parser = ComboSudokuParser(ocr_backend=backend)

    img = Image.new("RGB", (100, 100), color="white")
    img_path = tmp_path / "test.jpg"
    img.save(img_path)

    board = parser.parse_file(img_path)
    assert len(board.subboards) == 4
    assert board.subboards[0].hints[0][4] == 2


def test_backend_supports_full_image_property():
    backend = FakeOcrBackend()
    assert backend.supports_full_image is True


def test_ocr_backend_abstract():
    import pytest

    with pytest.raises(TypeError):
        OcrBackend()
