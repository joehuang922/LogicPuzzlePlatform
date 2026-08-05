# Akari (Light Up)

**Puzzle Type ID:** 18

## Question structure description

A grid of m rows × n columns. Some cells are black (walls); some black cells contain a number (0–4). The remaining cells are white and form the player's workspace, where light bulbs are placed.

### Canonical JSON structure

```json
{
  "cells": [
    [-1, -1, -1, -1, -1, -1, -1, 2, -1, -1],
    [-1, 2, -1, -1, 5, 5, -1, -1, -1, 5],
    [-1, -1, -1, -1, -1, 5, -1, -1, -1, -1],
    [-1, 5, -1, 2, -1, -1, 1, -1, 5, -1],
    [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    [-1, -1, 5, -1, -1, -1, -1, -1, -1, -1],
    [-1, 4, -1, -1, 1, -1, -1, -1, 3, -1],
    [-1, -1, -1, -1, 1, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, 5, -1, -1, -1, -1, -1],
    [-1, -1, -1, 1, -1, -1, -1, -1, -1, -1]
  ]
}
```

- `cells`: rows × cols 2D array of integers.
  - `-1` = white/empty (playable cell)
  - `0`–`4` = black cell (wall) with that number displayed
  - `5` = black cell (wall) with no number

### Sample images

- [board-akari.png](board-akari.png) — 10×10 board
- [board-akari-medium.png](board-akari-medium.png) — larger board with numbers 0–4

## Answer structure description

The answer is a per-cell assignment for every white cell, indicating whether a light bulb is placed there.

### Canonical JSON structure

```json
{
  "states": [
    [0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0]
  ]
}
```

- `states`: rows × cols array (same dimensions as `cells`). Values only apply to white cells (cells where `cells[r][c] === -1`):
  - `0` = empty (no bulb)
  - `1` = light bulb placed
  - `2` = marked (dot) — player asserts this cell has no bulb

## Rules

1. Place light bulbs in some white cells.
2. Each bulb illuminates its own cell and shines light horizontally and vertically along its row and column until the light is blocked by a black cell (wall) or the grid edge.
3. No bulb may be illuminated by another bulb — two bulbs cannot see each other along an unobstructed row or column.
4. Every white cell must be illuminated by at least one bulb.
5. A numbered black cell indicates exactly how many of its 4 orthogonally adjacent cells contain a light bulb. Black cells without a number impose no constraint. A bulb cannot be placed on a black cell.

### Success finishing criteria

Every white cell is illuminated AND no two bulbs illuminate each other AND every numbered black cell has exactly the stated number of orthogonally adjacent bulbs.

## Puzzle Player

### Interactions

- **Left-click** a white cell cycles its state forward: empty (0) → bulb (1) → dot/no-bulb mark (2) → empty (0).
- **Right-click** a white cell cycles its state backward: empty (0) → dot (2) → bulb (1) → empty (0).
- Illumination is computed and displayed automatically: cells lit by at least one bulb are shaded. When two bulbs illuminate each other (an unobstructed row/column between them), both conflicting bulbs render in red.
- Black cells (walls) are not interactive.

### Progress calculation

`(white cells illuminated by at least one bulb / total white cell count) * 100`. A white cell counts once it is lit by any placed bulb (including bulb cells themselves). Reaches 100% only when every white cell is illuminated.

## Puzzle Editor

### Interactions

- Click a white cell to make it a black cell (no number, value 5).
- Click a black cell to cycle: no-number (5) → 0 → 1 → 2 → 3 → 4 → back to white (-1).
- Grid dimensions are controlled via the JSON textarea.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Detects the grid by finding the outer border and subdividing into cells. The sample images use **solid** grid lines, so the parser uses `detect_grid_lines` (not `auto_detect_grid_lines`).
- Classifies each cell as black or white based on fill color.
- For black cells, uses OCR/LLM to detect the presence and value of a number (0–4). Numberless black cells map to `5`.
- Validates dimensions and cell value ranges (`-1` for white, `0`–`5` for black cells).

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` strings. For example, column 3, row 5 is `"3,5"`. The state value at each key is: `0` = empty, `1` = bulb, `2` = dot mark. `cells` is indexed `cells[row][col]` with row 0 at the top and col 0 at the left.

## Visual rendering notes

- Grid lines are solid (both player and editor views).
- Black cells render as solid black fill; numbered black cells show the number in white text centered.
- Bulbs render as a filled circle/bulb glyph centered in the cell. A bulb that illuminates another bulb renders in red to flag the conflict.
- Dot marks render as a small centered dot.
- Illuminated white cells render with a light-yellow background tint.
- The board border is a solid thick line.
