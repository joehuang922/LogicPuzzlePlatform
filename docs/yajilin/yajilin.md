# Yajilin

**Puzzle Type ID:** 13

## Question structure description

A rectangular grid of cells with solid borders. Some cells contain a clue: a number paired with a directional arrow (up, down, left, or right). The remaining cells are empty and must be either blackened or traversed by a loop.

### Canonical JSON structure

```json
{
  "cells": [
    [null, {"dir": "left", "num": 1}, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, {"dir": "up", "num": 0}, {"dir": "up", "num": 0}],
    [null, {"dir": "left", "num": 2}, null, {"dir": "right", "num": 3}, null, null, null, null, null],
    [null, null, {"dir": "right", "num": 3}, null, {"dir": "right", "num": 2}, null, null, null, null],
    [{"dir": "up", "num": 1}, null, null, null, null, null, null, null, {"dir": "right", "num": 0}],
    [null, null, {"dir": "down", "num": 2}, null, null, null, null, {"dir": "right", "num": 1}, null],
    [{"dir": "down", "num": 0}, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, {"dir": "up", "num": 2}, null, {"dir": "down", "num": 1}, null]
  ]
}
```

- `cells`: rows x cols array.
  - `null` = empty cell (no clue).
  - Object `{"dir": "<direction>", "num": <integer>}` = clue cell.
    - `dir`: one of `"up"`, `"down"`, `"left"`, `"right"`.
    - `num`: non-negative integer indicating the count of blackened cells in that direction from the clue.

### Sample images

- [board-yajilin.png](board-yajilin.png) — 9x9 board (small)
- [board-yajilin-medium.png](board-yajilin-medium.png) — larger board

## Answer structure description

The answer captures two things: which empty cells are blackened, and which edges form the loop.

### Canonical JSON structure

```json
{
  "blacks": [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 1, 0, 0]
  ],
  "edges": {
    "h": [
      [1, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 0, 0, 0, 0, 0]
    ],
    "v": [
      [1, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  }
}
```

- `blacks`: rows x cols array. `0` = not blackened, `1` = blackened. Clue cells are always `0`.
- `edges.h`: rows x (cols-1) array. `1` = horizontal line segment between cell (row, col) and (row, col+1). `0` = no segment.
- `edges.v`: (rows-1) x cols array. `1` = vertical line segment between cell (row, col) and (row+1, col). `0` = no segment.

## Rules

1. Every empty cell (non-clue) must be either blackened or have the loop pass through it — no cell may remain unused.
2. The loop must form exactly one closed path through cell centers, with no branches (every loop cell has exactly 2 edges).
3. Blackened cells cannot be orthogonally adjacent to each other.
4. Clue cells cannot be blackened and the loop does not pass through them.
5. Each clue `{"dir": d, "num": n}` means: looking from that cell in direction `d`, there are exactly `n` blackened cells (counting all cells in that direction until the grid edge).

### Success finishing criteria

All empty cells are either blackened or traversed by the loop AND the loop forms a single closed path with no branches AND no two blackened cells are orthogonally adjacent AND all directional clue constraints are satisfied.

## Puzzle Player

### Interactions

- **Left-click** an empty cell to cycle its state: empty → black → marked (grey dot) → empty.
- **Right-click** an empty cell to cycle backward: empty → marked → black → empty.
- **Drag** through cells to draw/erase loop segments. Press on a cell and drag through adjacent cells to toggle edges between their centers. If the first edge crossed was already drawn, the drag erases; otherwise it draws.
- The loop renders as solid dark lines connecting cell centers.
- Blackened cells render as filled dark squares.
- Marked cells (grey dot) are a solving aid — they indicate "definitely not black" and do not affect validation.
- Clue cells render as directed-integer cells (same layout as slalom gate numbers, but inverted colors: white/light cell background with black text). For up/down arrows, the arrow is on top and number below; for left/right arrows, the number is on the left and arrow on the right.

### Progress calculation

`(non-clue cells that are either blackened or have at least one adjacent loop edge / total non-clue cells) * 100`.

## Puzzle Editor

### Interactions

- Click a cell to cycle: empty → clue (opens a mini-editor for direction + number) → empty.
- When a cell is a clue, click to edit direction (cycle up/right/down/left) and number (increment, wrapping).
- Rows/Cols inputs allow resizing the grid.
- JSON textarea is the source of truth; visual edits update it bidirectionally.
- Clue cells render as directed-integer cells with the same layout as the player view (white cell, black text; arrow/number stacked or side-by-side depending on direction).

## Puzzle Parser

- Detects the grid using `detect_grid_lines` (solid grid lines).
- Determines grid dimensions from line spacing.
- Extracts cell ROIs from the center of each cell.
- Uses LLM recognizer (Gemini) to classify each cell as empty or clue, and for clue cells, extract the number and arrow direction.
- Validates that all clue numbers are non-negative integers and directions are valid.

# Misc

## Coordinate convention

Player-entered cell states are keyed as `"col,row"` strings. For example, column 3, row 5 is `"3,5"`. Cell state values: `1` = black, `2` = marked (grey dot). Loop edges use the edge-based format: `"eh_col,row"` for horizontal segment between (row, col) and (row, col+1), `"ev_col,row"` for vertical segment between (row, col) and (row+1, col). Values: `1` = drawn.
