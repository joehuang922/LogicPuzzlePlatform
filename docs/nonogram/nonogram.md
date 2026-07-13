# Nonogram

**Puzzle Type ID:** 6

## Question structure description

A grid of m rows × n columns of empty cells. Numeric clues are given along the top (column clues) and left side (row clues). Each clue is a list of integers describing consecutive groups of filled cells in that row/column.

### Canonical JSON structure

```json
{
  "rowClues": [
    [2, 1, 1, 2],
    [2, 2],
    [2, 2, 2],
    [3, 2, 3],
    [2, 2],
    [1, 4, 1],
    [2, 4, 2],
    [3, 2, 3],
    [4, 4],
    [10]
  ],
  "colClues": [
    [4, 4],
    [4, 5],
    [2, 3, 2, 1],
    [3, 3, 1, 2],
    [3, 3, 1, 3],
    [2, 1, 1, 2, 1],
    [1, 3, 1, 2, 3],
    [3, 2, 4, 5],
    [4, 4]
  ]
}
```

- `rowClues`: array of length equal to the number of rows. Each element is an array of positive integers representing the consecutive filled-cell groups for that row, in order from left to right. An empty row has `[0]` (single zero).
- `colClues`: array of length equal to the number of columns. Each element is an array of positive integers representing the consecutive filled-cell groups for that column, in order from top to bottom. An empty column has `[0]` (single zero).
- Dimensions are derived: `rows = rowClues.length`, `cols = colClues.length`.

### Sample images

- [board-nonogram.jpg](board-nonogram.jpg) — 11×10 small board
- [board-nonogram-medium.jpg](board-nonogram-medium.jpg) — 25×25 medium board
- [board-nonogram-big.jpg](board-nonogram-big.jpg) — 35×35 large board

## Answer structure description

The answer is a per-cell state grid indicating which cells are filled (black).

### Canonical JSON structure

```json
{
  "cells": [
    [1, 1, 0, 1, 0, 1, 0, 1, 1, 0],
    [0, 0, 0, 0, 1, 1, 0, 1, 1, 0]
  ]
}
```

- `cells`: rows × cols array. `0` = empty, `1` = filled (black). Only the filled/empty distinction matters for correctness; the "crossed" state is a player convenience and is not stored in the answer.

## Rules

- Each row must contain exactly the groups specified by its row clue, in order from left to right.
- Each column must contain exactly the groups specified by its column clue, in order from top to bottom.
- Each number in a clue represents a consecutive horizontal (row) or vertical (column) run of filled cells.
- Between any two consecutive groups in the same row/column, there must be at least one empty cell.
- A clue of `[0]` means the entire row/column is empty.

### Success finishing criteria

Every row and every column satisfies its clue simultaneously.

## Puzzle Player

### Interactions

- **Cell states**: Each cell has three visual states: unset (empty background), filled (black), crossed (X mark, indicating player deduced it is empty).
- **Mode selector**: Two salient square buttons at the bottom of the board:
  - Black square (default mode): drag/click fills cells black.
  - Crossed square (cross mode): drag/click marks cells with X.
- **Drag interaction**:
  - In black mode: left-drag across cells to fill them black. Right-drag across cells to mark them crossed.
  - In cross mode: both left-drag and right-drag mark cells crossed.
  - Dragging over a cell that is already in the target state resets it to unset (no circular cycling). For example, left-dragging in black mode over an already-black cell makes it unset.
- **Single click**: Behaves like a single-cell drag (same rules as above).
- **Clue highlighting**: As rows/columns are completed, their clues dim or change color to indicate satisfaction.

### Progress calculation

(Left empty for now)

## Puzzle Editor

### Interactions

- Rows/Cols editable as numeric inputs at the top.
- Row clues and column clues shown as editable comma-separated lists adjacent to the grid.
- JSON textarea is the source of truth; visual edits update it bidirectionally.
- Grid preview shows current clues visually.

## Puzzle Parser

- Detects the grid by identifying the rectangular playing area (the cells) distinct from the clue region.
- Clue region identification: the area above the grid (column clues) and to the left (row clues) contains stacked numbers in small sub-cells.
- OCR each clue sub-cell to extract the numeric values.
- Challenges: multi-digit numbers (10+), variable clue region width/height, dashed vs. solid grid lines in the clue area.
- Validates that row and column clue counts match the detected grid dimensions.

## Misc

### Coordinate convention

Player-entered values are keyed as `"col,row"` strings. For example, column 3, row 5 is `"3,5"`. The state value at each key is: `0` = unset, `1` = filled (black), `2` = crossed.
