from __future__ import annotations

from abc import ABC, abstractmethod

from PIL import Image

from puzzle_parsers.models import PuzzleData
from puzzle_parsers.validate import validate_canon


class PuzzleParser(ABC):
    puzzle_type: str

    def parse(self, image: Image.Image) -> PuzzleData:
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
