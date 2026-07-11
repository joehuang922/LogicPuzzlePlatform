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
    "Other cells may be empty or contain a single number (treat as top_right). "
    "For each cell, output an object with 'top_right' (integer, 0 if empty) "
    "and 'bottom_left' (integer, 0 if empty). "
    "Respond with ONLY a JSON array of arrays of objects. "
    'Example: [[{"top_right":3,"bottom_left":5},{"top_right":0,"bottom_left":0}]]. '
    "No explanation, just the JSON."
)


DEFAULT_PROMPTS: dict[str, str] = {
    "int": INT_CELL_PROMPT,
    "symbol": SYMBOL_CELL_PROMPT,
    "directed_int": DIRECTED_INT_CELL_PROMPT,
    "dual_int": DUAL_INT_CELL_PROMPT,
}
