from puzzle_parsers.base import PuzzleParser
from puzzle_parsers.combo_sudoku.parser import ComboSudokuParser
from puzzle_parsers.double_choco.parser import DoubleChocoParser
from puzzle_parsers.nurimaze.parser import NurimazeParser
from puzzle_parsers.slitherlink.parser import SlitherlinkParser
from puzzle_parsers.models import PuzzleData, PuzzleMetadata
from puzzle_parsers.registry import ParserRegistry, registry

registry.register(ComboSudokuParser)
registry.register(DoubleChocoParser)
registry.register(NurimazeParser)
registry.register(SlitherlinkParser)

__all__ = [
    "ComboSudokuParser",
    "DoubleChocoParser",
    "NurimazeParser",
    "SlitherlinkParser",
    "ParserRegistry",
    "PuzzleData",
    "PuzzleMetadata",
    "PuzzleParser",
    "registry",
]
