"""Combo sudoku: layout of any sub-board arrangement, and one read per cell.

The layout tests run on every sample in ``docs/combo-sudoku`` (cross,
staircase, pinwheel, samurai, irregular overlaps, a 14-board two-page spread
with a page fold) at full and Android upload size, plus tilted and keystoned
copies. They need no OCR; clue reads are checked against the answer keys by
hand with ``python -m puzzle_parsers.combo_sudoku <image> --debug <dir>``.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from puzzle_parsers.combo_sudoku.layout import LayoutError, _min_covers, find_layout
from puzzle_parsers.combo_sudoku.models import ComboSudokuBoard, SubBoard
from puzzle_parsers.combo_sudoku.parser import (
    ComboSudokuParser,
    _pick_boards,
    sudoku_conflicts,
)
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import OcrBackend

DOCS = Path(__file__).resolve().parents[2] / "docs" / "combo-sudoku"

# Sub-board origins (x, y) in rooms, as printed.
LAYOUTS = {
    "sample_warped.jpg": [(2, 0), (0, 2), (4, 2), (2, 4)],
    "board_2.jpg": [(0, 0), (1, 1), (2, 2), (3, 3)],
    "board_3.jpg": [(1, 0), (0, 1), (2, 2), (1, 3)],
    "board_4.jpg": [(0, 0), (2, 2), (0, 4), (4, 4)],
    "board_5.jpg": [(3, 0), (1, 1), (2, 3), (0, 5)],
    "board_6.jpg": [(0, 0), (4, 0), (2, 2), (0, 4), (4, 4)],
    "board_7.jpg": [(3, 0), (5, 1), (1, 2), (0, 4), (2, 5)],
    "board_8.jpg": [(4, 0), (12, 0), (2, 1), (10, 1), (0, 3), (8, 3), (13, 4), (2, 5),
                    (6, 5), (10, 5), (4, 6), (12, 6), (0, 7), (8, 7)],
}


def _android(img: np.ndarray) -> np.ndarray:
    s = 2000 / max(img.shape[:2])
    small = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    return cv2.imdecode(cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 85])[1], 1)


def _rotate(img: np.ndarray, deg: float) -> np.ndarray:
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1.0)
    return cv2.warpAffine(img, m, (w, h), borderValue=(255, 255, 255))


def _keystone(img: np.ndarray, k: float) -> np.ndarray:
    h, w = img.shape[:2]
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[w * k, 0], [w * (1 - k), 0], [w, h], [0, h]])
    return cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (w, h),
                               borderValue=(255, 255, 255))


@pytest.fixture(scope="module")
def samples() -> dict[str, np.ndarray]:
    return {name: cv2.imread(str(DOCS / name)) for name in LAYOUTS}


def _boards(img: np.ndarray) -> list[tuple[int, int]]:
    layout = find_layout(img)
    assert len(layout.boards) == 1, layout.boards
    return sorted(layout.boards[0])


@pytest.mark.parametrize("name", sorted(LAYOUTS))
def test_layout_of_every_sample(samples, name):
    img = samples[name]
    assert _boards(img) == sorted(LAYOUTS[name])
    assert _boards(_android(img)) == sorted(LAYOUTS[name])


@pytest.mark.parametrize("name", sorted(LAYOUTS))
@pytest.mark.parametrize("distort", [
    lambda im: _rotate(im, 1), lambda im: _rotate(im, -2), lambda im: _rotate(im, 3),
    lambda im: _keystone(im, 0.06),
], ids=["rot1", "rot-2", "rot3", "keystone6"])
def test_layout_survives_a_hand_held_photo(samples, name, distort):
    assert _boards(distort(_android(samples[name]))) == sorted(LAYOUTS[name])


def test_blank_page_is_a_clear_error():
    with pytest.raises(LayoutError):
        find_layout(np.full((800, 600, 3), 255, np.uint8))


def _rooms(*boards: tuple[int, int]) -> set[tuple[int, int]]:
    # boards as (x, y); rooms as (row, col)
    return {(y + i, x + j) for x, y in boards for i in range(3) for j in range(3)}


def test_min_cover_needs_no_fixed_shape_or_count():
    boards = [(x, y) for x in (0, 4, 8, 12) for y in (0, 4)] + [(2, 2), (6, 2), (10, 2)]
    covers = _min_covers(_rooms(*boards))
    assert covers == [sorted((y, x) for x, y in boards)]


def test_min_cover_rejects_a_shape_no_boards_explain():
    assert _min_covers(_rooms((0, 0)) | {(3, 0)}) == []


def _canvas_values(rows: int, cols: int, fill: dict[tuple[int, int], int]) -> list[list[int]]:
    return [[fill.get((r, c), 0) for c in range(cols)] for r in range(rows)]


def test_clues_settle_a_shape_two_board_sets_explain():
    # Two candidate sets over the same canvas; only the first keeps its clues valid.
    values = _canvas_values(9, 15, {(0, 0): 5, (0, 4): 5})
    assert _pick_boards([[(2, 0)], [(0, 0)]], values) == [(2, 0)]
    with pytest.raises(LayoutError):
        _pick_boards([[(0, 0)], [(2, 0)]], _canvas_values(9, 15, {}))


def test_sudoku_conflicts_counts_repeats():
    hints = [[0] * 9 for _ in range(9)]
    hints[0][0] = hints[0][8] = 4  # same row
    hints[4][4] = hints[5][5] = 7  # same box
    assert sudoku_conflicts(hints) == 2


class PatternOcr(OcrBackend):
    """Reads each canvas cell as a digit from its position, with no OCR."""

    supports_full_image = False

    def recognize_cells(self, cells, *, multi_digit=False, min_confidence=0.0, allowlist=None):
        return [[(r * 4 + c) % 9 + 1 for c in range(len(row))] for r, row in enumerate(cells)]

    def recognize_full_image(self, image_path, num_subboards):
        raise NotImplementedError


def test_shared_cells_are_read_once(samples, tmp_path):
    path = tmp_path / "board_4.jpg"
    cv2.imwrite(str(path), _android(samples["board_4.jpg"]))
    board = ComboSudokuParser(ocr_backend=PatternOcr()).parse_file(path)
    by_pos = {(s.x, s.y): s.hints for s in board.subboards}
    assert sorted(by_pos) == sorted(LAYOUTS["board_4.jpg"])
    # The middle board's corners are the other boards' corner rooms.
    assert [r[0:3] for r in by_pos[(2, 2)][0:3]] == [r[6:9] for r in by_pos[(0, 0)][6:9]]
    assert [r[0:3] for r in by_pos[(2, 2)][6:9]] == [r[6:9] for r in by_pos[(0, 4)][0:3]]
    assert [r[6:9] for r in by_pos[(2, 2)][6:9]] == [r[0:3] for r in by_pos[(4, 4)][0:3]]


@pytest.mark.parametrize("key", sorted(DOCS.glob("board_*_ans.json")), ids=lambda p: p.name)
def test_answer_keys_match_the_layouts_and_sudoku_rules(key):
    board = ComboSudokuBoard(**json.loads(key.read_text()))
    image = key.name.replace("_ans.json", ".jpg")
    assert sorted((s.x, s.y) for s in board.subboards) == sorted(LAYOUTS[image])
    assert all(sudoku_conflicts(s.hints) == 0 for s in board.subboards)


def test_validate():
    parser = ComboSudokuParser()
    good = ComboSudokuBoard(subboards=[SubBoard(x=0, y=0, hints=[[0] * 9 for _ in range(9)])])
    assert parser.validate(PuzzleData(puzzle_type="combo_sudoku", grid=good.model_dump()))
    assert not parser.validate(PuzzleData(puzzle_type="other"))
    bad = {"subboards": [{"x": 0, "y": 0, "hints": [[1, 2]]}]}
    assert not parser.validate(PuzzleData(puzzle_type="combo_sudoku", grid=bad))
