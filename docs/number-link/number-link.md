# Number Link

**Puzzle Type ID:** 17

## Question structure description

A rectangular grid of cells. Some cells contain a positive integer. Each integer value appears in **exactly two** cells (a pair of endpoints). All other cells are empty. The player draws a continuous path connecting each pair of matching numbers.

### Canonical JSON structure

```json
{
  "cells": [
    [1, 0, 5, 0, 0, 0, 0, 0, 0, 0],
    [2, 0, 0, 6, 0, 7, 0, 0, 0, 6],
    [0, 3, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 4, 0, 0, 0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 8, 5],
    [0, 0, 0, 0, 2, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 4, 0, 0, 0],
    [0, 8, 0, 0, 0, 0, 0, 0, 0, 7],
    [0, 0, 0, 0, 0, 0, 0, 3, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  ]
}
```

- `cells`: rows x cols array of integers.
  - `0` = empty cell.
  - Any positive integer `n` = a numbered endpoint. Every distinct positive value must appear in exactly two cells.
  - There is **no upper limit** on clue values — a large board can use arbitrarily high numbers (e.g. 17+). Values need not be contiguous.

### Sample images

- [board-number-link.png](board-number-link.png) — 10x10 board (numbers 1–8)
- [board-number-link-medium.png](board-number-link-medium.png) — larger board (numbers 1–17)

## Answer structure description

The answer is a set of line segments (edges) between adjacent cell centers, stored as horizontal and vertical edge arrays. Each drawn path is a chain of these segments running from one numbered endpoint to its matching partner.

### Canonical JSON structure

```json
{
  "edges": {
    "h": [
      [0, 1, 1, 0, 0, 0, 0, 0, 0],
      ...
    ],
    "v": [
      [1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      ...
    ]
  }
}
```

- `edges.h`: rows x (cols-1) array. `1` = horizontal segment drawn between cell (row, col) and cell (row, col+1). `0` = no segment.
- `edges.v`: (rows-1) x cols array. `1` = vertical segment drawn between cell (row, col) and cell (row+1, col). `0` = no segment.

## Rules

- Connect each pair of matching numbers with a single continuous path.
- Paths run horizontally or vertically between adjacent cell centers (no diagonals).
- Paths may not cross or overlap one another — every cell is used by at most one path, and no two path segments share a cell.
- **Fill rule (Nikoli-strict):** every cell in the grid must be used by exactly one path. No cell may be left empty.
- A numbered endpoint cell has exactly one segment connected to it (it is the start/end of its path). A non-endpoint cell on a path has exactly two segments connected to it (the path passes straight through or turns).
- Paths may not branch — no cell may have three or more segments.

### Success finishing criteria

Every pair of matching numbers is connected by exactly one continuous non-branching path AND no two paths cross or share a cell AND every cell in the grid is used by exactly one path (fully filled).

## Puzzle Player

### Interactions

- **Drag to draw/erase**: Press on a numbered endpoint cell or on any cell already part of a drawn path, then drag into an adjacent cell to extend the path segment by segment. Releasing ends the stroke.
  - Starting a drag from a numbered endpoint (or the free end of an existing path) grows that path.
  - Dragging back onto the previous cell of the current stroke retracts (erases) the last segment.
  - Extending a path into a cell already occupied by another path is blocked (paths cannot cross); extending onto the current path's own earlier cell is blocked (no self-loops).
- Path segments render as thick lines connecting cell centers. All paths use a single uniform color (per-pair coloring may be added later).
- Numbered endpoints render as the digit inside a rounded token at the cell center.
- Tapping (a click with no drag) on a filled path cell that is not an endpoint clears the segments touching that cell, allowing quick correction.

### Progress calculation

`(cells used by at least one path segment / total cell count) * 100`. A cell counts as "filled" once it has any adjacent drawn segment (an endpoint with one segment, or a through/turn cell with two). Numbered endpoint cells with no drawn segment yet do not count. Reaches 100% only when every cell is touched by a path.

## Puzzle Editor

### Interactions

- Click a cell to increment its number: `0` (empty) → `1` → `2` → … (no upper limit; keeps counting up).
- Shift-click (or right-click) a cell to decrement, for quick correction (down to `0`).
- Rows/Cols shown as read-only fields (determined by the JSON).
- The editor highlights validation state: each distinct positive value should appear exactly twice. Values appearing once or more than twice are flagged so the author can fix them before saving.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Detects the grid. The sample images use **dashed/dotted grid lines**, so the parser uses `auto_detect_grid_lines` (auto-sweeps erode sizes to find the faint dashed rulings) rather than `detect_grid_lines`.
- Uses an OCR/LLM digit recognizer to read the printed number in each cell; empty cells map to `0`. Multi-digit numbers (10–17 in the larger sample) must be read as a single integer, not split across columns.
- Validates dimensions and that every distinct positive value appears exactly twice.

# Misc

## Coordinate convention

`cells` is indexed `cells[row][col]` with row 0 at the top, col 0 at the left. Edge arrays follow the same convention: `edges.h[row][col]` is the segment between `(row, col)` and `(row, col+1)`; `edges.v[row][col]` is the segment between `(row, col)` and `(row+1, col)`. Player-entered path state is stored as edges keyed by these indices.
