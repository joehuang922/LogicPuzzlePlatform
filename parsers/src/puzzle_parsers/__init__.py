from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.combo_sudoku.parser import ComboSudokuParser
from puzzle_parsers.nurimaze.parser import NurimazeParser
from puzzle_parsers.models import PuzzleData, PuzzleMetadata
from puzzle_parsers.registry import ParserRegistry, registry

registry.register(ComboSudokuParser)
registry.register(NurimazeParser)

__all__ = [
    "ComboSudokuParser",
    "NurimazeParser",
    "ParserRegistry",
    "PuzzleData",
    "PuzzleMetadata",
    "PuzzleParser",
    "registry",
]
