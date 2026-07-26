# Fillomino

**Puzzle Type ID:** 14

## Question structure description

A grid of cells separated by dashed lines. Some cells contain pre-filled number clues (positive integers). The player must fill all empty cells with numbers and draw borders between cells to divide the grid into rooms (polyominoes), such that each room of size N contains only the number N.

### Canonical JSON structure

```json
{
  "cells": [
    [5, 5, 5, 0, 7, 0, 0, 0, 0, 0],
    [3, 3, 4, 0, 0, 0, 0, 0, 0, 6],
    [6, 5, 0, 0, 0, 0, 2, 0, 0, 0],
    [7, 0, 0, 0, 4, 0, 0, 0, 0, 0],
    [0, 0, 0, 6, 0, 0, 0, 5, 0, 0],
    [6, 0, 0, 0, 0, 4, 0, 0, 0, 0],
    [0, 0, 0, 6, 0, 0, 0, 0, 0, 7],
    [0, 0, 4, 0, 0, 0, 3, 0, 6, 0],
    [3, 0, 0, 0, 3, 0, 2, 0, 1, 0],
    [0, 0, 0, 4, 0, 6, 0, 6, 0, 3]
  ]
}
```

- `cells`: rows x cols array of integers. `0` = empty (no clue), positive integer = number clue.

### Sample images

- [board-fillomino.png](fillomino/board-fillomino.png) — 10x10 board
- [board-fillomino-medium.png](fillomino/board-fillomino-medium.png) — larger board

## Answer structure description

The answer consists of the fully filled number grid and the edge borders defining room boundaries.

### Canonical JSON structure

```json
{
  "numbers": [
    [5, 5, 5, 7, 7, 7, 7, 7, 7, 7],
    [3, 3, 4, 4, 4, 4, 6, 6, 6, 6],
    [6, 5, 5, 5, 5, 2, 2, 6, 6, 6],
    [7, 7, 7, 7, 4, 4, 4, 4, 5, 5],
    [...]
  ],
  "edges": {
    "h": [[1, 0, 1, 0, ...], ...],
    "v": [[1, 0, 0, 1, ...], ...]
  }
}
```

- `numbers`: rows x cols array of positive integers. Every cell must be filled.
- `edges.h`: (rows-1) x cols array. `1` = internal horizontal border between row r and row r+1 at column c. `0` = no border (same room). Only internal edges — the board boundary is implicit.
- `edges.v`: rows x (cols-1) array. `1` = internal vertical border between col c and col c+1 at row r. `0` = no border (same room). Only internal edges — the board boundary is implicit.

## Rules

- Fill every empty cell with a positive integer.
- Draw borders along cell edges to divide the grid into rooms (polyominoes).
- Each room must be an orthogonally connected group of cells.
- Every cell in a room must contain the same number N, where N equals the number of cells in that room.
- Two rooms that share an edge (share a cell boundary) cannot contain the same number.
- The board boundary (outer perimeter) is always treated as connected borders — the player only draws internal borders. This is the same convention as Double Choco.

### Success finishing criteria

All cells are filled with a positive integer AND all internal borders are placed such that the resulting rooms satisfy: every room of size N contains only the digit N, and no two adjacent rooms share the same digit.

## Puzzle Player

### Interactions

- Click/tap a cell to select it. On mobile, a hidden input with `inputmode="numeric"` is focused to trigger the OS number keyboard. On desktop, the player types directly on the keyboard. Typing a number replaces the current cell value.
- Press Delete/Backspace to clear the selected cell.
- Click/tap an edge between two cells to toggle the border: no border → border drawn → no border.
- Pre-filled clue cells are displayed in a darker/bold style and cannot be edited.
- Borders are drawn as thick solid lines between cells. The default dashed grid lines remain visible where no border is drawn.
- The board boundary (outer perimeter) is always shown as thick solid lines and is not interactive — only internal edges are toggleable.

### Progress calculation

`(non-empty cells that were originally empty / total empty cells) * 100`. Only cells originally without a clue count — placing a number in an empty cell increments progress.

## Puzzle Editor

### Interactions

- Click a cell to select it, then type a number to set the clue value (0 to clear).
- Rows/Cols inputs allow resizing the grid (preserves existing values where possible).
- Cells with a clue get a light blue background highlight.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Grid lines are dashed — uses `auto_detect_grid_lines` (auto-sweeps erode sizes for optimal detection).
- Detects the grid structure and determines dimensions from line spacing.
- Extracts cell ROIs from the center of each cell region.
- Uses LLM recognizer (Gemini) to classify each cell as empty or containing a positive integer (including multi-digit numbers like 11).
- Validates that all cell values are non-negative integers.

# Misc

## Coordinate convention

Player-entered values are keyed as:
- `"c:col,row"` for cell number values. The value is the integer entered (or `0`/absent for empty).
- `"h:row,col"` for horizontal edges (border between row and row+1 at col). Value: `1` = border drawn, `0` = no border.
- `"v:row,col"` for vertical edges (border between col and col+1 at row). Value: `1` = border drawn, `0` = no border.
