# Shakashaka

**Puzzle Type ID:** 11

## Question structure description

A grid of m rows × n columns. Some cells are black (opaque); some black cells contain a number (0–4). The remaining cells are white (empty) and form the player's workspace.

### Canonical JSON structure

```json
{
  "cells": [
    [5, 5, -1, -1, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, 5, -1, -1, -1, -1, 2, -1],
    [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    [-1, -1, 3, -1, -1, 5, -1, -1, -1, -1],
    [-1, -1, -1, -1, 4, -1, -1, -1, -1, 5],
    [-1, -1, -1, -1, -1, -1, 1, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    [-1, 5, -1, -1, -1, -1, -1, 2, -1, -1],
    [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, -1, -1, 0, -1]
  ]
}
```

- `cells`: rows × cols 2D array of integers.
  - `-1` = white/empty (playable cell)
  - `0`–`4` = black cell with that number displayed
  - `5` = black cell with no number

### Sample images

- [board-shakashaka.jpg](board-shakashaka.jpg) — multiple puzzles
- [board-shakashaka-medium.jpg](board-shakashaka-medium.jpg) — medium difficulty board

## Answer structure description

The answer is a per-cell assignment for every white cell, indicating which triangle orientation (if any) is placed there.

### Canonical JSON structure

```json
{
  "states": [
    [0, 0, 1, 0, 0, 3, 0, 0, 0, 2],
    [0, 4, 0, 0, 0, 0, 0, 5, 0, 0]
  ]
}
```

- `states`: rows × cols array (same dimensions as `cells`). Values only apply to white cells (cells where `cells[r][c] === -1`):
  - `0` = unset (not yet decided)
  - `1` = triangle with right angle at top-left (◤)
  - `2` = triangle with right angle at top-right (◥)
  - `3` = triangle with right angle at bottom-left (◣)
  - `4` = triangle with right angle at bottom-right (◢)
  - `5` = marked as empty (dot) — player asserts this cell has no triangle

## Rules

1. Place black right-angled triangles (with one of four orientations) into some white cells.
2. Each numbered black cell indicates exactly how many of its 4 orthogonally adjacent cells contain a triangle (any orientation).
3. After all triangles are placed, every contiguous white region must form a rectangle. **Rectangles may be axis-aligned OR rotated 45 degrees (diamond/oblique).** A triangle's hypotenuse forms a diagonal boundary — two adjacent triangles' hypotenuses can combine to create the edges of an oblique rectangle.
4. A white region is defined by the remaining white area after treating black cells and triangle-filled portions as opaque. Specifically:
   - A cell with a triangle is half-black (the triangle part) and half-white (the remaining part).
   - The white halves of adjacent cells connect across shared edges/corners to form contiguous white shapes.
   - All such white shapes must be rectangles (axis-aligned or 45° rotated).

### Success finishing criteria

Every white cell is assigned a value (triangle orientation or dot-mark) AND all rules above are satisfied simultaneously.

## Puzzle Player

### Interactions

- The cell is logically divided into four quadrants: top-left, top-right, bottom-left, bottom-right.
- Clicking a quadrant assigns the triangle whose right angle is at that corner:
  - Top-left click → ◤ (value 1)
  - Top-right click → ◥ (value 2)
  - Bottom-left click → ◣ (value 3)
  - Bottom-right click → ◢ (value 4)
- Clicking the same quadrant again removes the assignment (back to unset).
- A mode toggle (two square icons below the board, like nonogram) lets the user switch between:
  - **Triangle mode** (default): clicks place triangles as described above.
  - **Mark mode**: clicking any part of a cell toggles the dot mark (value 5). Clicking a marked cell removes the mark.
- Black cells are not interactive.

### Progress calculation

`(white cells with a non-zero state / total white cell count) * 100`. A white cell is "filled" once the player assigns any value (triangle 1–4 or dot-mark 5).

## Puzzle Editor

### Interactions

- Click a white cell to make it a black cell (no number, value 5).
- Click a black cell to cycle: no-number (5) → 0 → 1 → 2 → 3 → 4 → back to white (-1).
- Grid dimensions are controlled via the JSON textarea.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Detects the grid by finding the outer border and subdividing into cells.
- Classifies each cell as black or white based on fill color.
- For black cells, uses OCR/LLM to detect the presence and value of a number (0–4).
- Validates dimensions, cell value ranges (-1 for empty, 0–5 for black cells).

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` strings. For example, column 3, row 5 is `"3,5"`. The state value at each key is: `0` = unset, `1` = ◤, `2` = ◥, `3` = ◣, `4` = ◢, `5` = dot mark.

## Visual rendering notes

- Grid lines are dashed (both player and editor views).
- Black cells render as solid black fill; numbered black cells show the number in white text centered.
- Triangles render as filled black right-angled triangles occupying exactly half the cell.
- Dot marks render as a small centered circle/dot.
- The board border is a solid thick line.
