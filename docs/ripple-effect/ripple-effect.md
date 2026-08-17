# Ripple Effect

**Puzzle Type ID:** 25

## Question structure description

A rectangular grid divided into **rooms** (irregular polyominoes) by thick
borders. Every cell belongs to exactly one room, and the rooms tile the grid
exactly (no gaps, no overlaps). Some cells carry a positive integer clue; all
other cells are empty. The player fills every empty cell with a number.

Two kinds of information are given and fixed:

1. **The room partition** — which cells belong to which room, expressed as the
   thick borders drawn along cell edges (same edge encoding as Fillomino's
   answer / LITS's question). The board perimeter is an implicit border.
2. **The clues** — pre-filled numbers in some cells.

### Canonical JSON structure

```json
{
  "cells": [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 3, 0, 0, 0, 0, 3],
    [3, 0, 0, 0, 0, 3, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 3, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 3],
    [3, 0, 0, 0, 3, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0]
  ],
  "edges": {
    "h": [
      [0, 1, 0, 1, 0, 0, 1, 0],
      [1, 0, 1, 1, 0, 1, 0, 1],
      [0, 1, 0, 0, 1, 0, 1, 0],
      [1, 0, 1, 0, 0, 1, 0, 1],
      [0, 1, 0, 1, 1, 0, 1, 0],
      [1, 0, 1, 0, 0, 1, 0, 1],
      [0, 1, 0, 1, 0, 0, 1, 0]
    ],
    "v": [
      [1, 0, 1, 0, 1, 0, 1],
      [0, 1, 0, 1, 0, 1, 0],
      [1, 0, 1, 0, 1, 0, 1],
      [0, 1, 0, 1, 0, 1, 0],
      [1, 0, 1, 0, 1, 0, 1],
      [0, 1, 0, 1, 0, 1, 0],
      [1, 0, 1, 0, 1, 0, 1],
      [0, 1, 0, 1, 0, 1, 0]
    ]
  }
}
```

- `cells`: `rows x cols` array of integers. `0` = empty cell, positive integer =
  a pre-filled clue in that cell.
- `edges.h`: `(rows-1) x cols` array. `1` = thick room border between cell
  `[r][c]` and cell `[r+1][c]`; `0` = same room (thin interior line). Only
  internal edges — the board boundary is an implicit border.
- `edges.v`: `rows x (cols-1)` array. `1` = thick room border between cell
  `[r][c]` and cell `[r][c+1]`; `0` = same room. Only internal edges.

The rooms are the connected components of cells once the thick borders are
treated as walls. (The `edges` values above are illustrative of the format, not
a verified partition of the sample board.)

### Sample images

- [board-ripple-effect.png](board-ripple-effect.png) — 8x8 board (Easy)
- [board-ripple-effect-medium.png](board-ripple-effect-medium.png) — taller
  board (Medium)

## Answer structure description

The answer is the fully filled number grid. Every cell (including the original
clue cells) holds its final value.

### Canonical JSON structure

```json
{
  "numbers": [
    [1, 2, 1, 2, 1, 3, 2, 1],
    [2, 1, 3, 1, 2, 1, 3, 3],
    [3, 2, 1, 3, 1, 3, 1, 2],
    [1, 3, 2, 1, 2, 1, 2, 1],
    [2, 1, 3, 2, 3, 2, 1, 3],
    [1, 2, 1, 3, 1, 3, 2, 3],
    [3, 1, 2, 1, 3, 1, 3, 1],
    [1, 3, 1, 2, 1, 2, 1, 2]
  ]
}
```

- `numbers`: `rows x cols` array of positive integers. Every cell must be
  filled. Clue cells retain their given value. (The values above illustrate the
  format, not a verified solution.)

## Rules

- The grid is pre-divided into rooms (polyominoes) by thick borders.
- Fill every cell with a positive integer.
- Within each room of size **N**, the numbers `1, 2, ..., N` each appear
  **exactly once** (so a room of 3 cells contains one 1, one 2, and one 3).
- **Ripple constraint:** if the same number **K** appears more than once in a
  single row or column, the equal numbers must be separated by **at least K
  cells** between them. Equivalently, two cells in the same row (or column)
  holding value K must be at least `K + 1` positions apart. This spacing rule
  applies across room boundaries — it is a full-row / full-column constraint.

### Success finishing criteria

Every cell holds a positive integer; every room of size N contains exactly the
set `{1..N}`; and for every row and every column, any two equal values K are at
least `K + 1` cells apart (no two equal values K within K cells of each other) —
all satisfied simultaneously.

## Puzzle Player

### Interactions

- Click/tap a cell to select it. On desktop the player types a digit directly;
  on mobile a hidden `inputmode="numeric"` input is focused to raise the OS
  number keyboard. Typing a number replaces the selected cell's value.
- Press Delete/Backspace to clear the selected cell.
- Pre-filled clue cells are rendered in a darker/bold style and cannot be
  edited or cleared.
- Room borders render as thick solid lines; interior cell lines are thin. The
  board perimeter is always thick. Borders are not interactive in the player —
  the partition is fixed.
- Cells that violate a rule (duplicate within a room, or a ripple-spacing
  conflict in the row/column) may be highlighted as an optional solver aid, but
  values are always accepted.

### Progress calculation

`(non-clue cells that hold a number / total non-clue cells) * 100`. Only cells
that were originally empty count toward the denominator; placing a number in
such a cell increments progress. Clearing it decrements. Clue cells are
excluded from both numerator and denominator since they are fixed. This
"how much of the board have you filled" metric matches Ripple Effect's
fill-every-cell structure (same as Fillomino).

## Puzzle Editor

### Interactions

- Click a cell to select it, then type a number to set its clue value (0 or
  Backspace clears it back to empty).
- Click a border (edge) between two cells to toggle it thick/thin, which
  re-partitions the grid into rooms. Unlike Heyawake, rooms are **not** required
  to be rectangles — any polyomino partition is valid.
- Rows/Cols numeric controls resize the grid (preserves existing clues and
  borders where they still fit).
- The JSON textarea is the source of truth; visual edits update it
  bidirectionally.

### Appearance

- Same as the player view. Empty cells show nothing; clue cells show their
  number. Thick borders delineate rooms; thin lines separate cells within a
  room.

## Puzzle Parser

- Detects the grid using perspective warping and solid grid-line detection.
  Interior lines and room borders are both solid; the room borders are the
  thicker/darker rulings. The scans render lines as thin solid grey that
  scanning degrades into faint, broken segments, so grid geometry is recovered
  with the shared robust grid-detection path (square-cell reconciliation) used
  by the other border-partition puzzles.
- Classifies each interior edge as thick (room boundary) or thin (same room) to
  recover the room partition, producing the `edges.h` / `edges.v` grids. This is
  the same border-classification step as LITS / Norinori, routed through the
  shared quad-border detection helper.
- Uses OCR / an LLM-based digit recognizer to read the clue in each cell (most
  cells are empty → `0`). Clue values are small positive integers (typically
  1–5, bounded by the largest room size).
- **Accuracy bar:** judged jointly by border edges-off (the room partition) and
  clues-off (the digit recognition), mirroring the LITS + Fillomino metrics.
  1–2 edges off is shippable and correctable in the editor; missing or misread
  clues are the dominant digit failure mode and are likewise correctable.
- `validate()` checks that `cells` is a rectangular integer grid with all values
  `>= 0`, that the `edges` grids have the correct shapes for those dimensions,
  and that every clue is a positive integer no larger than the size of the room
  it sits in. A failing board is reported for review, but the parser still
  returns its best-effort result.

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` strings (zero-based, column
first) with the value being the integer entered. For example, column 3, row 5
holding a 2 is `"3,5": 2`. Cleared/empty cells are omitted from the value map.
The persisted answer uses the structured `{numbers: [...]}` grid format, filled
row-major with row 0 = top. Room edge coordinates in the canon follow the
Fillomino convention: `h[r][c]` is the border below cell `[r][c]`, and
`v[r][c]` is the border to the right of cell `[r][c]`.
