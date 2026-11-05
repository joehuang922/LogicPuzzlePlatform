"""Predefined schema types and prompt templates for cell content recognition.

Each schema represents a pattern of cell content that appears in logic puzzles.
Schemas ship with default prompt templates used by CellRecognizer implementations.
"""
from __future__ import annotations

from dataclasses import dataclass


# Case A: single integer (sudoku, slitherlink, double_choco)
# Represented as plain int: 0 = empty, 1-9 = digit
IntCell = int

INT_CELL_PROMPT = (
    "This image shows a grid of cells cropped from a logic puzzle. "
    "Each cell is labeled with its row,col position. "
    "For each cell, identify the digit (0-9) if one is clearly printed, "
    "or -1 if the cell is empty/blank. "
    "Respond with ONLY a JSON array of arrays (rows of integers). "
    "Example for a 3x3: [[0,-1,3],[-1,5,-1],[7,-1,-1]]. No explanation, just the JSON."
)


# Pencils clue montage: every tile shown is a non-empty cell (blank cells are
# filtered out before the montage is built), so the model must never answer 0.
# Each cell holds either a positive integer clue or a pencil-head arrowhead,
# encoded as a negative int by direction. The head belongs to the cell where the
# flat base of the triangle sits, not the cell the tip points toward.
PENCILS_CLUE_PROMPT = (
    "This image shows a grid of cells cropped from a Pencils puzzle. "
    "Each cell is labeled with its row,col position. Every cell shown has "
    "content — none are blank. "
    "Ignore any faint dashed lines or partial ink at cell edges — those are grid "
    "artifacts, not content. Focus only on the main content of each cell. "
    "Each cell contains one of:\n"
    "- A positive integer (1, 2, 3, ... possibly two digits like 10, 13, 20, 24) "
    "representing a number clue. Read the entire number, not just the first digit.\n"
    "- A pencil head icon: a small filled triangular arrowhead pointing in one "
    "direction. The head BELONGS TO the cell where the FLAT BASE of the triangle "
    "sits, NOT the cell the tip points toward. Output -1 if the tip points UP, "
    "-2 if DOWN, -3 if LEFT, -4 if RIGHT.\n"
    "Respond with ONLY a JSON array of arrays (rows of integers), one entry per "
    "cell. Example for a 1x3: [[3,-2,10]]. No explanation, just the JSON."
)


# Case B: symbol enum (nurimaze)
# Represented as plain int: 0=empty, 1=circle, 2=triangle, 3=S, 4=G
SymbolCell = int

SYMBOL_CELL_PROMPT = (
    "This image shows a grid of cells cropped from a nurimaze puzzle. "
    "Each cell is labeled with its row,col position. "
    "Classify each cell as one of:\n"
    "- 0: empty (no symbol)\n"
    "- 1: circle (hollow ring)\n"
    "- 2: triangle (hollow triangle)\n"
    "- 3: S (the letter S, marking the start)\n"
    "- 4: G (the letter G, marking the goal)\n\n"
    "Respond with ONLY a JSON array of arrays (rows of integers). "
    "Example for a 3x3: [[0,0,1],[3,0,0],[0,4,2]]. No explanation, just the JSON."
)


# Case C: directed integer (e.g., "10→")
@dataclass
class DirectedIntCell:
    """A cell containing a number with a directional arrow."""

    value: int  # 0 = empty
    direction: str  # "up" | "down" | "left" | "right" | ""


DIRECTED_INT_CELL_PROMPT = (
    "This image shows a grid of cells cropped from a logic puzzle. "
    "Each cell is labeled with its row,col position. "
    "Each cell may contain a number with a directional arrow (→←↑↓), "
    "just a number, or be empty. "
    "For each cell, output an object with 'value' (integer, 0 if empty) "
    "and 'direction' (one of 'up', 'down', 'left', 'right', or '' if none). "
    "Respond with ONLY a JSON array of arrays of objects. "
    'Example: [[{"value":10,"direction":"right"},{"value":0,"direction":""}]]. '
    "No explanation, just the JSON."
)


# Case D: dual integer split by diagonal
@dataclass
class DualIntCell:
    """A cell containing two numbers split by a diagonal line (upper-left to lower-right)."""

    top_right: int  # number in the top-right half, 0 = empty
    bottom_left: int  # number in the bottom-left half, 0 = empty


DUAL_INT_CELL_PROMPT = (
    "This image shows a grid of cells cropped from a logic puzzle. "
    "Each cell is labeled with its row,col position. "
    "Some cells are split by a diagonal line from upper-left to lower-right, "
    "with a number in the top-right half and a number in the bottom-left half. "
    "Other cells may be empty or contain a single number (treat it as the "
    "top-right number). "
    'For each cell output a short string "TR/BL" where TR is the top-right '
    "number (0 if none) and BL is the bottom-left number (0 if none), "
    'e.g. "3/5", "7/0", "0/12", "0/0". '
    "Respond with ONLY a JSON array of arrays of these strings, one per cell. "
    'Example for a 1x3: [["3/5","0/0","7/0"]]. No explanation, just the JSON.'
)


DEFAULT_PROMPTS: dict[str, str] = {
    "int": INT_CELL_PROMPT,
    "symbol": SYMBOL_CELL_PROMPT,
    "directed_int": DIRECTED_INT_CELL_PROMPT,
    "dual_int": DUAL_INT_CELL_PROMPT,
}
