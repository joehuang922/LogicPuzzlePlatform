"""Prompt for the vision OCR backends' plain-digit montage (GeminiOcrBackend,
ClaudeOcrBackend). Composite cells (two numbers, arrows, symbols, pencil heads)
are read through ``cell_classify.classify_cells`` and its target types.
"""
from __future__ import annotations



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
