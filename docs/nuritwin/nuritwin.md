# Nuritwin

**Puzzle Type ID:** 9

## Question structure description

A rectangular grid of cells divided into rooms by thick borders. Some rooms contain a number indicating the required size of each black-cell-component within that room. The player must blacken cells to satisfy twin-component constraints per room and global connectivity constraints.

### Canonical JSON structure

```json
{
  "cells": [
    [3, 2, 2, 2, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 2, 2, 0, 0, 0, 0, 2, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 2, 0, 0, 0, 0, 0],
    [2, 0, 0, 0, 0, 0, 2, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  ],
  "grids": {
    "h": [[1, 0, 0, 1, 0, 0, 0, 1, 0, 0], ...],
    "v": [[0, 1, 0, 0, 1, 0, 1, 0, 0], ...]
  }
}
```

- `cells`: rows x cols array of integers.
  - `0` = empty (no number in that cell).
  - Positive integer (e.g. `2`, `3`) = the room's clue number, indicating each black-cell-component in the room must have exactly that many cells.
- `grids.h`: (rows-1) x cols array. `1` = thick horizontal border between row r and row r+1. `0` = thin/no border.
- `grids.v`: rows x (cols-1) array. `1` = thick vertical border between col c and col c+1. `0` = thin/no border.

Rooms are defined by connected components of cells separated by thick borders (same convention as nurimaze).

### Sample images

- [board-nuritwin.jpg](board-nuritwin.jpg) — 10x10 board with numbered rooms

## Answer structure description

The answer is a per-cell state grid indicating which cells are blackened.

### Canonical JSON structure

```json
{
  "states": [
    [1, 0, 1, 1, 0, 0, 1, 0, 0, 1],
    [...]
  ]
}
```

- `states`: rows x cols array. `0` = unset, `1` = black, `2` = marked (explicitly not-black).

## Rules

1. In every room (defined by thick borders), there must be exactly two connected components of black cells, and these two components must have the same size (number of cells).
2. If a room contains a number N, each of the two black-cell-components in that room must have exactly N cells (so the room contains 2N black cells total). Rooms without numbers have no size constraint (but still need exactly two equal-size components).
3. All black cells on the entire board must form a single connected component (connected horizontally or vertically).
4. No 2x2 block of cells may be entirely black.

### Success finishing criteria

Every room contains exactly two equal-size connected black components, all black cells globally form one connected component, and no 2x2 block is all black.

## Puzzle Player

### Interactions

- Left-click a cell to cycle its state: empty → black → marked (dot) → empty.
- Right-click a cell to cycle in reverse: empty → marked (dot) → black → empty.
- Black cells render as dark gray fill. Marked cells show a small centered dot.
- Numbers in cells remain visible regardless of cell state.
- Thick room borders are rendered prominently to distinguish rooms.

### Progress calculation

`(cells with any non-empty state / total cell count) * 100`. A cell is considered "touched" once the player assigns it any state (black = 1 or marked = 2). Unset cells (state = 0) are not counted.

## Puzzle Editor

### Interactions

- Click a cell to select/focus it (highlighted).
- Type digits (0-9) to enter/append a number (same keyboard-input pattern as Pencils editor). Numbers have no upper bound — any positive integer is valid.
- Delete/Backspace to clear the focused cell's number to 0.
- Arrow keys to navigate between cells.
- Escape to deselect.
- Click a border (edge) between two cells to toggle it between thick (room boundary) and thin (same room).
- Rows/Cols editable via input fields to resize the grid.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Detects the grid using perspective warping.
- Classifies borders as thick or thin to determine room structure.
- Uses LLM-based cell recognizer (Gemini) to identify numbers in each cell.
- Validates dimensions, cell value ranges, and grid border consistency.

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` strings. For example, column 3, row 5 is `"3,5"`. The state value at each key is: `0` = unset, `1` = black, `2` = marked (not-black).
