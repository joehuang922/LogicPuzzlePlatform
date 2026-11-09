# Corner Chain (隅角チェーン)

**Puzzle Type ID:** 30

## Question structure description

A rectangular grid of cells with no rooms. Some cells carry a positive integer clue; all other cells are empty. The player shades cells black; the unshaded cells split into orthogonally-connected white regions called **islands** (シマ). A clue gives the size of the island it sits in.

This is a clue-in-cell puzzle, so the canonical representation is a plain `rows x cols` integer grid — identical in shape to Nurikabe. `0` marks an empty cell; a positive integer marks a clue cell.

### Canonical JSON structure

The rule sheet's 5x5 example:

```json
{
  "cells": [
    [3, 0, 0, 4, 4],
    [0, 0, 0, 0, 0],
    [2, 0, 0, 0, 0],
    [0, 0, 0, 0, 5],
    [0, 0, 0, 0, 5]
  ]
}
```

- `cells`: `rows x cols` array of integers. `0` = empty cell, any positive integer = the size of the island containing that cell. Clue values have no fixed upper bound (samples go up to 8).

### Sample images

- [corner-chain-board-1.jpg](corner-chain-board-1.jpg) — 10x10 board (puzzle 1), photo of a magazine page; the top of puzzle 2 is also visible below it.
- [corner-chain-board-2.jpg](corner-chain-board-2.jpg) — 10x10 board (puzzle 2); the bottom row of puzzle 1 and the top of puzzle 3 are also visible.
- [rule.jpg](rule.jpg) — rule sheet with a 5x5 example and its answer.

## Answer structure description

The paint state of every cell. Clue cells are always white by rule.

### Canonical JSON structure

Answer to the example above:

```json
{
  "states": [
    [0, 0, 1, 0, 0],
    [1, 0, 1, 0, 0],
    [0, 1, 0, 1, 1],
    [0, 1, 0, 0, 0],
    [1, 1, 1, 1, 0]
  ]
}
```

- `states`: `rows x cols` array of integers. `0` = unset, `1` = black, `2` = white-marked (solver-aid dot). For checking, `0` and `2` are both white.

## Rules

1. Shade some cells black.
2. A number gives the number of cells in its **island**: the orthogonally-connected region of white cells containing it, bounded by black cells and the board edge.
3. An island may contain any number of clues (or none). Clue cells may not be shaded.
4. An island with an **even** number of cells must be a rectangle (squares included). An island with an **odd** number of cells must **not** be a rectangle. (So a single-cell island is never allowed: 1 is odd and a 1x1 is a square.)
5. All islands must be linked into one network through shared **corners**: build a graph whose nodes are islands, with an edge between two islands that touch diagonally at a vertex; the graph must be connected. (Islands never touch orthogonally, since they would then be one island.) Black cells have no connectivity requirement.

### Success finishing criteria

Treating every non-black cell as white: no clue cell is black; every island's size equals each clue inside it; every even-sized island exactly fills its bounding box; every odd-sized island does not fill its bounding box; and the islands form a single diagonally-linked network (one island alone also satisfies this).

## Puzzle Player

### Interactions

Same as Nurikabe:

- Each non-clue cell has three states: unset, black, and white-marked (a centered dot).
- Left click cycles forward: empty → black → marked → empty. Right click cycles backward: empty → marked → black → empty. No drag-paint.
- Clue cells are read-only.
- Black cells are filled dark (no rooms here, so not `ROOM_SHADE`); marked cells show a small centered dot; clue numbers render on top of their cell.
- Android: `CornerChainEngine` implements `ShadeMarkEngine` (tap cycles empty → black → marked) and plays on `NurikabeBoard`, whose `onTapCell` is wired to `vm::tapShadeCell`. Admin authoring reuses the Nurikabe clue editor and mini board with `CornerChainAuthoring`'s warnings (a 1, a clue bigger than the grid, different clues side by side).

### Progress calculation

Same as Nurikabe: `(non-clue cells set to black or marked / total non-clue cells) * 100`. Clue cells are excluded from both numerator and denominator.

## Puzzle Editor

Same as Nurikabe: a grid of cells, each holding an optional positive integer clue.

### Interactions

- Click a cell to edit its clue value (type a positive integer, or clear it to make the cell empty).
- Rows/Cols inputs resize the grid (keeping existing clues that still fit).
- The JSON textarea is the source of truth; visual edits update it in both directions.

## Puzzle Parser

- Plain rectangular grid, solid thin lines, no rooms: reuse the Nurikabe pipeline (`rectify_board` → `find_grid_lines`), no wall classification.
- Samples are phone photos of a magazine page showing one full board plus parts of the neighbouring boards. The border detector must take the one complete board, not a cut-off neighbour or the title band.
- Clues are plain Nikoli-font numbers read with `cell_ocr.read_grid_clues(..., allow_multi_digits=True)`; zero is not a clue (`allow_zero=False`). The type id goes in `_OCR_TYPES`.
- Clues sit near the centre of the cell but sometimes lean to the left (e.g. the `5`s in column 0 of board 1), so the shared crop margins should cover them.
- **Accuracy bar:** grid geometry must be right; individual OCR misses can be fixed in the editor.
- Validates that `cells` is a rectangular integer grid with all values `>= 0` and at least one positive clue.

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` (zero-based, column first) with value `1` for black and `2` for white-marked. Absent or `0` = unset. The persisted answer is the `{states: [...]}` grid (row-major, `states[row][col]`), mirroring Nurikabe.
