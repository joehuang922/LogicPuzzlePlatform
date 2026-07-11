# Double Choco

**Puzzle Type ID:** 4

## Question structure description

A rectangular grid where each cell has a color (white or gray) and optionally a number clue. All internal grid lines are dashed (no pre-existing room boundaries). The player must draw thick borders to divide the grid into rooms.

### Canonical JSON structure

```json
{
  "cells": [
    [[0, 0], [0, 3], [1, 0], [1, 0], [0, 2], [1, 0]],
    [[0, 0], [1, 0], [1, 0], [0, 0], [0, 0], [1, 4]],
    [[1, 0], [1, 0], [0, 0], [0, 0], [1, 0], [1, 0]],
    [[0, 0], [0, 0], [1, 0], [1, 3], [0, 0], [0, 0]]
  ]
}
```

- `cells`: rows x cols array of `[color, number]` tuples.
  - `color`: `0` = white, `1` = gray.
  - `number`: `0` = no clue, `>0` = the number displayed in the cell.

### Sample images

- [board-double-choco.jpg](double-choco/board-double-choco.jpg) — small board
- [board-double-choco-medium.jpg](double-choco/board-double-choco-medium.jpg) — medium board

## Answer structure description

The answer is a set of thick border edges that divide the grid into rooms.

### Canonical JSON structure

```json
{
  "grids": {
    "h": [[0, 1, 0, 1, 0, 0], [1, 0, 0, 0, 1, 0], [0, 0, 1, 1, 0, 0]],
    "v": [[0, 1, 0, 0, 1], [1, 0, 0, 1, 0], [0, 0, 1, 0, 0], [0, 1, 0, 0, 1]]
  }
}
```

- `grids.h`: (rows-1) x cols array. `1` = thick horizontal edge placed between row r and row r+1.
- `grids.v`: rows x (cols-1) array. `1` = thick vertical edge placed between col c and col c+1.

## Rules

- Divide the grid into rooms by placing thick borders on internal edges.
- Each room must contain an equal number of white cells and gray cells.
- Within each room, the white cells must form a connected group and the gray cells must form a connected group.
- The shape formed by the white cells must be the same as the shape formed by the gray cells (allowing rotation and reflection).
- If a cell contains a number clue, it indicates the count of cells of that color in the room (e.g., a "3" in a white cell means the room has 3 white cells and 3 gray cells).
- Every thick border must separate two different rooms (no redundant borders within a single room).

### Success finishing criteria

At least one thick border exists AND all rules above are satisfied for every room in the partition.

## Puzzle Player

### Interactions

- Click an internal edge (horizontal or vertical border between two cells) to toggle it between thin (dashed) and thick (solid).
- Thick borders are drawn as solid bold lines; thin borders remain dashed.
- Cell colors (white/gray) and number clues are displayed as read-only.

### Progress calculation

(Left empty for now)

## Puzzle Editor

### Interactions

- Left-click a cell to toggle its color between white (0) and gray (1).
- Right-click a cell to set its number via a prompt dialog.
- Rows/Cols displayed as read-only fields.
- "Create Empty Board" button available when JSON is invalid, to bootstrap a new board with specified dimensions.
- JSON textarea is the source of truth; visual edits update it bidirectionally.
- Legend: Colors: white=0, gray=1 | Numbers: 0=empty.

## Puzzle Parser

- Detects grid geometry and perspective-warps the board image.
- Classifies cell colors using adaptive Otsu thresholding on mean pixel intensities.
- Recognizes numbers in cells via EasyOCR or contour-based heuristic fallback.
- Validates that all cells are [color, number] pairs with color in {0, 1} and number >= 0.

# Misc

## Coordinate convention

Player-entered values (transient) are keyed as `"h:row,col"` for horizontal edges and `"v:row,col"` for vertical edges. Value `1` = thick border placed. The persisted answer uses the structured `{grids: {h, v}}` format directly.
