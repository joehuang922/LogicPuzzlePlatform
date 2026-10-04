"""Tests for the shared Gemini cell recognizer, focused on batch handling."""
from __future__ import annotations

import json
import threading
import time

import numpy as np

from puzzle_parsers.recognition import GeminiRecognizer, _split_rows


class _FakeResponse:
    def __init__(self, text: str) -> None:
        self.text = text


# Montage tile geometry for an 8x8 source tile (see llm_vision.cells_to_png_bytes):
# tile_size=min(64,8,8)=8, border=2, label_h=14.
_CELL_W = 8 + 2 * 2
_CELL_H = 8 + 2 * 2 + 14


class _FakeModel:
    """Stand-in for a genai model.

    Returns, for each montage, a JSON grid whose every cell encodes that cell's
    absolute (row, col) as "r,c". Batch dimensions are recovered from the montage
    image size and the absolute row offset from the batch prompt, so the response
    is correct regardless of which batch it belongs to. An optional per-call delay
    lets a later batch finish before an earlier one, exercising order preservation.
    """

    def __init__(self, delays: dict[int, float] | None = None) -> None:
        self.delays = delays or {}
        self.calls = 0
        self._lock = threading.Lock()

    def generate_content(self, content, request_options=None):
        montage, prompt = content
        width, height = montage.size
        num_cols = width // _CELL_W
        num_rows = height // _CELL_H
        # The batch prompt names its absolute row span: "rows R to S of ...".
        start_row = 0
        for line in prompt.splitlines():
            line = line.strip()
            if "(rows " in line and " of the full grid" in line:
                seg = line.split("(rows ", 1)[1]
                start_row = int(seg.split(" to ", 1)[0])
        delay = self.delays.get(start_row, 0.0)
        if delay:
            time.sleep(delay)
        with self._lock:
            self.calls += 1
        grid = [
            [f"{start_row + r},{c}" for c in range(num_cols)]
            for r in range(num_rows)
        ]
        return _FakeResponse(json.dumps(grid))


def _cells(rows: int, cols: int) -> list[list[np.ndarray]]:
    tile = np.zeros((8, 8), dtype=np.uint8)
    return [[tile for _ in range(cols)] for _ in range(rows)]


def test_single_batch_passes_through():
    rec = GeminiRecognizer(client=_FakeModel())
    out = rec.recognize(_cells(3, 4), "prompt", max_cells_per_batch=200)
    assert len(out) == 3
    assert out[0][0] == "0,0"
    assert out[2][3] == "2,3"


def test_multi_batch_preserves_row_order_when_batches_finish_out_of_order():
    # 30 rows x 2 cols, 20 cells/batch -> 10 rows/batch -> 3 batches starting at
    # rows 0, 10, 20. Delay the first batch most so later batches return first;
    # the recognizer must still reassemble rows in ascending order.
    delays = {0: 0.15, 10: 0.05, 20: 0.0}
    fake = _FakeModel(delays=delays)
    rec = GeminiRecognizer(client=fake)
    out = rec.recognize(_cells(30, 2), "prompt", max_cells_per_batch=20)
    assert fake.calls == 3
    assert len(out) == 30
    for r in range(30):
        assert out[r] == [f"{r},0", f"{r},1"], f"row {r} out of order: {out[r]}"


def test_multi_batch_runs_concurrently():
    # Three batches each sleeping 0.2s must finish in well under their 0.6s sum
    # if they truly run in parallel.
    delays = {0: 0.2, 10: 0.2, 20: 0.2}
    rec = GeminiRecognizer(client=_FakeModel(delays=delays))
    start = time.monotonic()
    rec.recognize(_cells(30, 2), "prompt", max_cells_per_batch=20)
    elapsed = time.monotonic() - start
    assert elapsed < 0.5, f"batches did not overlap (took {elapsed:.2f}s)"


def test_split_rows_balances_instead_of_leaving_a_fat_trailing_batch():
    # 22 rows x 10 cols, cap 200 -> cap allows 20 rows/batch, so 2 batches are
    # needed; they must split evenly (11+11), not greedily (20+2).
    spans = _split_rows(22, 10, 200)
    assert spans == [(0, 11), (11, 22)]
    sizes = [end - start for start, end in spans]
    assert max(sizes) - min(sizes) <= 1


def test_split_rows_single_batch_when_under_cap():
    assert _split_rows(3, 4, 200) == [(0, 3)]


def test_split_rows_covers_every_row_without_gaps_or_overlap():
    for num_rows in (1, 7, 20, 21, 44, 100):
        spans = _split_rows(num_rows, 10, 200)
        rows_per_batch = max(1, 200 // 10)
        assert spans[0][0] == 0
        assert spans[-1][1] == num_rows
        for (_, prev_end), (next_start, _) in zip(spans, spans[1:]):
            assert prev_end == next_start  # contiguous, no gap/overlap
        sizes = [end - start for start, end in spans]
        assert max(sizes) <= rows_per_batch  # honours the per-batch cell cap
        assert max(sizes) - min(sizes) <= 1  # balanced
