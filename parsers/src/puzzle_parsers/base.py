from __future__ import annotations

from abc import ABC, abstractmethod

from PIL import Image

from puzzle_parsers.models import PuzzleData


class PuzzleParser(ABC):
    puzzle_type: str

    @abstractmethod
    def parse(self, image: Image.Image) -> PuzzleData:
        ...

    @abstractmethod
    def validate(self, data: PuzzleData) -> bool:
        ...
