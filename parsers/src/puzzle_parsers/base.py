from __future__ import annotations

import time
from abc import ABC, abstractmethod
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import contextmanager
from contextvars import ContextVar

from numpy.typing import NDArray
from PIL import Image

from puzzle_parsers.metadata_extract import (
    MetadataExtractor,
    context_crop,
    default_metadata_extractor,
)
from puzzle_parsers.models import PuzzleData
from puzzle_parsers.validate import validate_canon

# How long parse() waits, once the board is parsed, for a metadata call that is
# still running. Covers the extractor's primary + fallback model timeouts.
METADATA_WAIT_SECONDS = 35.0

# Metadata calls run here, concurrently with the parser's own cell recognition.
_metadata_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="metadata")

# The in-flight metadata call of the parse() running on this thread, if any.
_pending_metadata: ContextVar[list[Future]] = ContextVar("pending_metadata")


@contextmanager
def timed(label: str):
    """Log the wall-clock duration of a parse stage to stdout (CloudWatch).

    The handler already prints before/after the whole parse; these finer stage
    timings split that span so a timeout can be attributed to grid detection vs.
    OCR rather than being an opaque 120s black hole.
    """
    start = time.perf_counter()
    try:
        yield
    finally:
        print(f"  [timing] {label}: {time.perf_counter() - start:.1f}s")


class PuzzleParser(ABC):
    puzzle_type: str

    # Reads title/author from around the board; None uses the shared default.
    metadata_extractor: MetadataExtractor | None = None

    def parse(self, image: Image.Image) -> PuzzleData:
        pending: list[Future] = []
        token = _pending_metadata.set(pending)
        try:
            with timed(f"{self.puzzle_type} _parse total"):
                data = self._parse(image)
        except BaseException:
            for future in pending:
                future.cancel()
            raise
        finally:
            _pending_metadata.reset(token)
        validate_canon(self._schema_name, data.grid)
        if pending:
            with timed(f"{self.puzzle_type} metadata wait"):
                self._merge_metadata(data, pending[0])
        return data

    def _board_located(self, image: NDArray, quad: NDArray) -> None:
        """Start reading the board's title/author while the parse carries on.

        Parsers call this once grid detection has found the board, with the
        image the quad's corners are expressed in (not the warped board).
        Only the first call per parse counts; outside parse() (e.g.
        ``parse_file`` debugging) it does nothing.
        """
        pending = _pending_metadata.get(None)
        if pending is None or pending:
            return
        extractor = self.metadata_extractor or default_metadata_extractor()
        if extractor is None:
            return
        try:
            crop = context_crop(image, quad)
        except Exception as exc:  # noqa: BLE001 - metadata must never break a parse
            print(f"  [metadata] crop failed ({type(exc).__name__}: {exc})")
            return
        pending.append(_metadata_pool.submit(extractor.extract, crop))

    def _merge_metadata(self, data: PuzzleData, future: Future) -> None:
        try:
            found = future.result(timeout=METADATA_WAIT_SECONDS)
        except Exception as exc:  # noqa: BLE001 - metadata must never break a parse
            future.cancel()
            print(f"  [metadata] extraction failed ({type(exc).__name__}: {exc})")
            return
        print(f"  [metadata] {found}")
        # Fill only what the parser didn't set itself.
        current = data.metadata
        data.metadata = current.model_copy(update={
            "title": current.title or found.get("title"),
            "author": current.author or found.get("author"),
        })

    @property
    def _schema_name(self) -> str:
        return self.puzzle_type.replace("_", "-")

    @abstractmethod
    def _parse(self, image: Image.Image) -> PuzzleData:
        ...

    @abstractmethod
    def validate(self, data: PuzzleData) -> bool:
        ...
