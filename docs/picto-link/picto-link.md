# Picto Link

**Puzzle Type ID:** 27

Black-and-white Link-a-Pix (Conceptis "ピクトリンク" / Paint-by-Pairs). The grid
holds pairs of equal-valued clues. The player links each pair with a path of
cells whose total length equals the clue value; the filled cells reveal a
picture. This is **not** Number Link (type 17): here a value appears in *many*
pairs, the clue dictates the path *length*, a `1` is a self-contained single
cell, and the grid is **not** required to be fully filled.

## Question structure description

A rectangular grid of cells. Some cells contain a positive integer clue. Each
distinct arrangement of equal values forms **pairs** — every clue value `n ≥ 2`
appears an even number of times and is matched into pairs of endpoints that must
be joined by a path of exactly `n` cells. A clue value of `1` is special: it is a
**single isolated cell** that is its own complete path (there is no partner to
link to). All other cells are empty.

### Canonical JSON structure

```json
{
  "cells": [
    [2, 0, 0, 0, 1],
    [2, 0, 0, 0, 0],
    [0, 4, 0, 0, 4],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0]
  ]
}
```

- `cells`: rows x cols array of integers.
  - `0` = empty cell.
  - Any positive integer `n` = a clue. The clue value is the **path length** (total
    number of cells in the path, counting both endpoints).
  - `1` clues stand alone (a single filled cell). Clues with value `n ≥ 2` come in
    matched pairs of endpoints.
  - There is **no upper limit** on clue values. Values need not be contiguous. The
    same value may appear in multiple independent pairs (e.g. several `2` pairs).

### Sample images

- [big.jpg](big.jpg) — large board (clues 1–12)
- [medium.jpg](medium.jpg) — medium board (clues 1–10)

## Answer structure description

The answer stores the drawn paths as line segments (edges) between adjacent cell
centers, plus the set of single filled cells. Each linked pair is a chain of
segments running from one endpoint to its matching partner. A `1` clue has no
segment (it touches no neighbor), so it is recorded in `singles`.

A cell is **filled** iff it is touched by at least one edge **or** it appears in
`singles`. The two domains are disjoint: a `1` clue can never carry an edge, and a
cell on a length-≥2 path is always touched by an edge. `1` clues are deliberately
**not** pre-filled — the player enacts every mark (consistent with how fillomino
`1`s, norinori 2-cell rooms, and LITS 4-cell rooms are player-placed even though
forced), so the board starts clean.

### Canonical JSON structure

```json
{
  "edges": {
    "h": [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    "v": [
      [1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0]
    ]
  },
  "singles": [[0, 4]]
}
```

- `edges.h`: rows x (cols-1) array. `1` = horizontal segment between `(row, col)`
  and `(row, col+1)`. `0` = none.
- `edges.v`: (rows-1) x cols array. `1` = vertical segment between `(row, col)`
  and `(row+1, col)`. `0` = none.
- `singles`: array of `[row, col]` pairs, one per filled single cell. Only ever
  holds `1`-clue cells.

The example above links the two `2` clues at `(0,0)`/`(1,0)` with one vertical
segment (2 cells), the two `4` clues at `(2,1)`/`(2,4)` with three horizontal
segments (4 cells), and fills the lone `1` at `(0,4)`.

## Rules

- Link each pair of matching clues (value `n ≥ 2`) with a single continuous path
  of exactly `n` cells, counting both endpoints.
- Paths run horizontally or vertically between adjacent cell centers (no diagonals)
  and may bend freely.
- A clue of value `1` is a single filled cell on its own — it is never linked to
  anything.
- Paths may not cross or overlap: every cell is used by **at most one** path, and no
  two path segments share a cell.
- A clue endpoint cell has exactly one segment connected to it (the start/end of its
  path). A non-endpoint cell on a path has exactly two segments (pass-through or
  turn). No cell may have three or more segments (no branching).
- A path's two endpoints must be the matching pair for its value, and no path may
  pass through any other clue cell.
- The grid is **not** required to be fully filled. Cells on no path stay empty; the
  filled cells form the hidden picture.

### Success finishing criteria

Every clue is used by exactly one path: each value-`n ≥ 2` pair is joined by a
single non-branching path of exactly `n` cells, each `1` clue is filled as a single
cell, no two paths cross or share a cell, and no path passes through a foreign clue.

## Puzzle Player

### Interactions

- **Drag to draw/erase a path** (clues `n ≥ 2`): Press on a clue endpoint cell or on
  any cell already part of a drawn path, then drag into an adjacent cell to extend
  the path segment by segment. Releasing ends the stroke.
  - Starting a drag from a clue endpoint (or the free end of an existing path) grows
    that path.
  - Dragging back onto the previous cell of the current stroke retracts (erases) the
    last segment.
  - Extending into a cell already occupied by another path is blocked (no crossing);
    extending onto the current path's own earlier cell is blocked (no self-loops).
- **Tap a `1` clue** to toggle its single filled state (stored in `singles`). `1`
  clues take no drag.
- Path segments render as thick lines connecting cell centers; filled cells
  (including singles) are shaded. All paths use a single uniform color.
- Clue values render as the digit at the cell center.
- Tapping (a click with no drag) on a filled path cell that is not a clue endpoint
  clears the segments touching that cell, for quick correction.

### Progress calculation

**Clues correctly linked.** `(clue cells belonging to a complete, correct path /
total clue cell count) * 100`. A `1` clue counts once the player fills it. An
endpoint of a value-`n ≥ 2` clue counts once it is joined to its matching partner by
a non-branching path of exactly `n` cells. The bar starts at 0 (nothing drawn, no
singles filled) and reaches 100 only when every clue is satisfied.

## Puzzle Editor

### Interactions

- Click a cell to increment its clue: `0` (empty) → `1` → `2` → … (no upper limit).
- Shift-click (or right-click) a cell to decrement, for quick correction (down to
  `0`).
- Rows/Cols shown as read-only fields (determined by the JSON).
- The editor highlights validation state: each value `n ≥ 2` should appear an even
  number of times (it is matched into pairs). Values that cannot be paired are
  flagged. `1` clues may appear any number of times.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Grid lines in the samples are **solid** red rulings, so the parser uses
  `detect_grid_lines` (not the dashed `auto_detect_grid_lines` path).
- Uses an OCR/LLM digit recognizer to read the printed clue in each cell; empty cells
  map to `0`. Multi-digit clues (10–12 in the samples) must be read as a single
  integer, not split across columns.
- Validates dimensions and that every value `n ≥ 2` appears an even number of times.

# Misc

## Coordinate convention

`cells` is indexed `cells[row][col]` with row 0 at the top, col 0 at the left. Edge
arrays follow the same convention: `edges.h[row][col]` is the segment between
`(row, col)` and `(row, col+1)`; `edges.v[row][col]` is the segment between
`(row, col)` and `(row+1, col)`. `singles` entries are `[row, col]`. Player-entered
state is stored as these edges and singles keyed by the same indices.
