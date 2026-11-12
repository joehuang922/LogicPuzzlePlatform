"""Skeleton Puzzle parser: the cell mask from the grid, the word list by Gemini.

``grid_detector`` finds which lattice squares are cells. The word list below
the board is free text (kana words, some with a parenthesised hint), not cell
clues, so the area under the board goes to Gemini in one call; the slot/word
count check in the editor and API catches a dropped or merged word.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.recognition import CellRecognizer, GeminiRecognizer
from puzzle_parsers.skeleton_puzzle.grid_detector import SkeletonGeometry, detect_skeleton_grid
from puzzle_parsers.skeleton_puzzle.models import SkeletonPuzzleBoard, SkeletonWord

# Hiragana, katakana (small ones included), ー and the iteration marks; mirrors the API.
KANA = re.compile(r"^[ぁ-ゖゝゞァ-ヺー-ヾ]+$")

WORD_LIST_PROMPT = """This image is the word list printed below a Japanese skeleton puzzle
(スケルトンパズル). Words are grouped under headings such as 3文字, 4文字, 5文字 (the number of
letters). Each word is kana (katakana or hiragana); some words are followed by a hint in
parentheses, e.g. アイコ（トマト）, sometimes printed small under the word.

Return a JSON array with every word, in print order (group by group, each group's words top
to bottom, and a group's columns left to right):
[{"word": "アイコ", "hint": "トマト"}, {"word": "モギリ"}]

Rules:
- "word" is exactly the kana as printed, keeping small kana (ッ, ャ, ュ, ョ, ァ, ...) and ー.
- "hint" is the text inside the parentheses, without the parentheses; omit it when there is none.
- Skip headings, page numbers, the puzzle's instructions and anything that is not a listed word.
- Return only the JSON array."""


class SkeletonPuzzleParser(PuzzleParser):
    puzzle_type = "skeleton-puzzle"
    locates_board = True

    def __init__(self, recognizer: CellRecognizer | None = None, **kwargs) -> None:
        self._recognizer = recognizer or GeminiRecognizer(**kwargs)

    def _parse(self, image: Image.Image) -> PuzzleData:
        img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        board = self._parse_image(img_array)
        return PuzzleData(puzzle_type=self.puzzle_type, grid=board.canon())

    def parse_file(self, image_path: str | Path, debug_dir: str | None = None) -> SkeletonPuzzleBoard:
        image_path = Path(image_path)
        img_array = cv2.imread(str(image_path))
        if img_array is None:
            raise ValueError(f"Could not read image: {image_path}")
        return self._parse_image(img_array, debug_dir=debug_dir)

    def _parse_image(self, img_array: np.ndarray, debug_dir: str | None = None) -> SkeletonPuzzleBoard:
        geom = detect_skeleton_grid(img_array, debug_dir=debug_dir)
        self._board_located(img_array, geom.quad)
        return SkeletonPuzzleBoard(cells=geom.cells, words=self._read_words(img_array, geom))

    def _read_words(self, img_array: np.ndarray, geom: SkeletonGeometry) -> list[SkeletonWord]:
        """Gemini reads the area below the board."""
        top = int(min(img_array.shape[0] - 1, max(geom.quad[:, 1])))
        below = img_array[top:, :]
        if below.shape[0] < 20:
            return []
        rgb = cv2.cvtColor(below, cv2.COLOR_BGR2RGB)
        raw = self._recognizer.recognize_image(Image.fromarray(rgb), WORD_LIST_PROMPT)
        return words_from_response(raw)

    def validate(self, data: PuzzleData) -> bool:
        if data.puzzle_type != self.puzzle_type:
            return False
        try:
            board = SkeletonPuzzleBoard(**data.grid)
        except Exception:
            return False
        return not format_problems(board)

    def to_json(self, board: SkeletonPuzzleBoard, output_path: str | Path) -> None:
        Path(output_path).write_text(json.dumps(board.canon(), ensure_ascii=False, indent=4) + "\n")


def words_from_response(raw: object) -> list[SkeletonWord]:
    """Gemini's JSON array as words; anything malformed is dropped, a hint may be missing."""
    if isinstance(raw, dict):
        raw = raw.get("words", [])
    if not isinstance(raw, list):
        return []
    words = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        word = str(item.get("word") or "").strip()
        if not word:
            continue
        hint = item.get("hint")
        hint = str(hint).strip().strip("()（）").strip() if hint else None
        words.append(SkeletonWord(word=word, hint=hint or None))
    return words


def slot_lengths(cells: list[list[int]]) -> Counter:
    """Count of slots (maximal across/down runs of 2+ cells) by length."""
    out: Counter = Counter()
    rows = len(cells)
    cols = len(cells[0]) if rows else 0
    lines = [[cells[r][c] for c in range(cols)] for r in range(rows)]
    lines += [[cells[r][c] for r in range(rows)] for c in range(cols)]
    for line in lines:
        run = 0
        for v in line + [0]:
            if v == 1:
                run += 1
            else:
                if run >= 2:
                    out[run] += 1
                run = 0
    return out


def format_problems(board: SkeletonPuzzleBoard) -> list[str]:
    """What the editor and the API's semanticChecks refuse."""
    cells = board.cells
    if not cells or not cells[0]:
        return ["No cells"]
    cols = len(cells[0])
    problems = []
    if any(len(row) != cols or any(v not in (0, 1) for v in row) for row in cells):
        problems.append("cells must be a rectangle of 0/1")
    for i, w in enumerate(board.words):
        if not KANA.match(w.word):
            problems.append(f'Word {i + 1} "{w.word}" must be kana (and ー) only')
        elif len(w.word) < 2:
            problems.append(f'Word {i + 1} "{w.word}" is under 2 letters')
    words = Counter(len(w.word) for w in board.words)
    slots = slot_lengths(cells)
    for n in sorted(set(words) | set(slots)):
        if words[n] != slots[n]:
            problems.append(f"{slots[n]} slots of length {n} but {words[n]} words of {n} letters")
    return problems
