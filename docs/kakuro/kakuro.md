# Kakuro

**Puzzle Type ID:** 12

## Question structure description

An m x n grid where each cell is either a "clue cell" or an "empty cell." Clue cells are visually split by a diagonal (upper-left to lower-right) and may contain a right-clue (sum for horizontal run) and/or a down-clue (sum for vertical run). Empty cells are where the player enters digits 1-9.

### Canonical JSON structure

```json
{
  "cells": [
    [{"type": "clue", "right": 16, "down": null}, {"type": "empty"}, {"type": "empty"}, {"type": "clue", "right": null, "down": 4}],
    [{"type": "clue", "right": 3, "down": 7}, {"type": "empty"}, {"type": "empty"}, {"type": "empty"}]
  ]
}
```

- `cells`: rows x cols array of cell objects.
  - Clue cell: `{"type": "clue", "right": <number|null>, "down": <number|null>}`. `right` is the sum for the horizontal run to the right. `down` is the sum for the vertical run below.
  - Empty cell: `{"type": "empty"}`.

### Sample images

- [board-kakuro.png](kakuro/board-kakuro.png) — large board
- [board-kakuro-medium.png](kakuro/board-kakuro-medium.png) — medium board

## Answer structure description

The answer is a 2D array matching the grid dimensions. Clue cells remain 0; empty cells contain the assigned digit (1-9).

### Canonical JSON structure

```json
{
  "values": [
    [0, 9, 7, 0],
    [0, 2, 1, 3]
  ]
}
```

- `values`: rows x cols array of integers. `0` = clue cell (no entry). `1`-`9` = digit assigned to an empty cell.

## Rules

1. Each empty cell must be filled with a digit from 1 to 9.
2. For each clue with a `right` value: the digits in the contiguous horizontal run of empty cells immediately to its right must sum to that value.
3. For each clue with a `down` value: the digits in the contiguous vertical run of empty cells immediately below it must sum to that value.
4. Within any single horizontal or vertical run, all digits must be distinct (no repeats).

### Success finishing criteria

All empty cells are assigned a digit AND all sum constraints are satisfied AND no run contains duplicate digits.

## Puzzle Player

### Interactions

- Click an empty cell to select it; a 1-9 numpad popup appears.
- Tap a digit on the numpad to place it in the selected cell.
- Tap the same digit again (or a clear button) to erase it.
- Clue cells are non-interactive (display only).
- Invalid entries (duplicate in run, or completed run with wrong sum) are highlighted in red.

### Progress calculation

`(empty cells with a digit assigned / total empty cell count) * 100`. Any digit placed counts toward progress regardless of correctness.

## Puzzle Editor

### Interactions

- Click a cell to cycle its type: empty -> clue -> empty.
- When a cell is a clue, editable number fields appear for the right-clue and down-clue (null if left blank).
- Rows/Cols controls to resize the grid.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Detects the grid using solid-line detection (`detect_grid_lines`).
- Classifies each cell as clue or empty based on the presence of a diagonal line (dark triangle regions).
- For clue cells, uses OCR to read the right and down numbers.
- Validates that clue cells contain at least one non-null clue value.

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` strings. For example, column 3, row 5 is `"3,5"`. Values are integers 1-9 (or absent/empty if not yet filled).

The answer's `values` 2D array uses `[row][col]` indexing (row-major). `values[row][col] = 0` for clue cells, `1-9` for filled empty cells.
