from __future__ import annotations

from typing import Type

from puzzle_parsers.base import PuzzleParser


class ParserRegistry:
    def __init__(self) -> None:
        self._parsers: dict[str, Type[PuzzleParser]] = {}

    def register(self, parser_cls: Type[PuzzleParser]) -> Type[PuzzleParser]:
        self._parsers[parser_cls.puzzle_type] = parser_cls
        return parser_cls

    def get(self, puzzle_type: str) -> Type[PuzzleParser] | None:
        return self._parsers.get(puzzle_type)

    @property
    def supported_types(self) -> list[str]:
        return list(self._parsers.keys())


registry = ParserRegistry()
