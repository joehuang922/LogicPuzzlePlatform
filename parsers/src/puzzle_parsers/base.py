from __future__ import annotations

import time
from abc import ABC, abstractmethod
from contextlib import contextmanager

from PIL import Image

from puzzle_parsers.models import PuzzleData
from puzzle_parsers.validate import validate_canon


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

    def parse(self, image: Image.Image) -> PuzzleData:
        with timed(f"{self.puzzle_type} _parse total"):
            data = self._parse(image)
        validate_canon(self._schema_name, data.grid)
        return data

    @property
    def _schema_name(self) -> str:
        return self.puzzle_type.replace("_", "-")

    @abstractmethod
    def _parse(self, image: Image.Image) -> PuzzleData:
        ...

    @abstractmethod
    def validate(self, data: PuzzleData) -> bool:
        ...
