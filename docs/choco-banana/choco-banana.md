# Choco Banana

**Puzzle Type ID:** 16

## Question structure description

A rectangular grid. Some cells contain a positive integer clue; all other cells are empty. There are no thick borders or regions — the only given information is the scattered number clues. The player shades some cells (chocolate) and leaves others unshaded (banana) according to the rules below.

### Canonical JSON structure

```json
{
  "cells": [
    [0, 2, 0, 0, 0, 3, 0, 0, 1, 1],
    [0, 5, 0, 0, 0, 0, 2, 0, 4, 0],
    [2, 0, 0, 0, 0, 0, 0, 9, 0, 0],
    [0, 0, 0, 4, 6, 0, 9, 0, 0, 0],
    [2, 6, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 4, 0, 2, 0, 0, 0, 0, 0],
    [0, 6, 0, 0, 0, 0, 8, 0, 8, 0],
    [0, 0, 4, 0, 2, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 7]
  ]
}
```

- `cells`: rows x cols array of integers.
  - `0` = empty cell (no clue).
  - `N > 0` = a clue indicating the size of the connected group (shaded **or** unshaded) that this cell belongs to.

The clue value does not by itself say whether the cell is chocolate or banana — that is deduced from the shape rules.

### Sample images

- [board-choco-banana.png](board-choco-banana.png) — 10x10 board (Easy)
- [board-choco-banana-medium.png](board-choco-banana-medium.png) — larger board (Medium)

## Answer structure description

The answer is the tri-state mark of every cell, so a saved answer can be restored to the player board exactly as the player left it: which cells are chocolate (shaded), which are explicitly marked banana (white-mark), and which are still unknown.

### Canonical JSON structure

```json
{
  "states": [
    [0, 1, 2, 0, 1],
    [1, 1, 2, 1, 1],
    [2, 1, 2, 1, 2],
    [1, 1, 2, 1, 1],
    [1, 2, 2, 2, 1]
  ]
}
```

- `states`: rows x cols array of integers. `0` = unknown, `1` = shaded (chocolate), `2` = white-mark (definitely banana/unshaded). (The example above is illustrative of the format, not a verified solution.)
- For rule validation the state is collapsed to two values: `1` is shaded; both `0` and `2` are treated as unshaded. The `2` state is preserved only so a snapshot restores the player's white-marks.

## Rules

- Every cell is either shaded (chocolate) or unshaded (banana).
- Every group of orthogonally-connected **shaded** cells must form a rectangle (including a single cell or a 1×n line, which count as rectangles).
- Every group of orthogonally-connected **unshaded** cells must **not** form a rectangle.
- A number in a cell indicates the total number of cells in the connected group (shaded or unshaded) that the cell is part of. The clue applies whether the cell ends up chocolate or banana.

### Success finishing criteria

Every cell is assigned a state (shaded or unshaded) AND every shaded group is a rectangle AND every unshaded group is not a rectangle AND every numbered cell belongs to a group whose size equals its clue.

## Puzzle Player

### Interactions

- **Left-click** a cell to cycle it toward shaded: unknown → shaded → unknown.
- **Right-click** a cell to mark it as definitely unshaded (a white/banana mark): unknown → white-mark → unknown.
- Tri-state per cell (unknown / shaded / white-mark), matching the LITS board's left/right-click interaction model.
- Shaded cells are filled a chocolate/dark color; white-marked cells show a small centered dot (or X); unknown cells stay blank. Clue numbers are always drawn on top.
- The full tri-state grid is persisted as the answer (`states`), so reopening a puzzle restores shaded cells and white-marks exactly. For solution validation, a white-marked cell and an unknown cell are both treated as unshaded — the puzzle is checked as a two-state (shaded / not-shaded) grid; the white-mark is only a solving aid.

### Progress calculation

`(cells decided / total cell count) * 100`. A cell counts as "decided" once the player has marked it either shaded or white (i.e. it is no longer unknown). Unknown cells are not counted.

## Puzzle Editor

### Interactions

- Click a cell to open a numeric prompt (same as the Fillomino editor) and enter its clue. There is no upper ceiling on the clue value; enter `0` or leave it empty to clear the clue.
- Rows/Cols inputs allow resizing the grid (preserves existing clues where possible).
- Only the `cells` clue array is editable — there are no borders or symbols.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

### Appearance

- Empty cells may show a faint dot so they are visually distinct from clue cells; clue cells show their number.

## Puzzle Parser

- The grid lines are solid — uses `detect_grid_lines` (standard solid-line detection).
- Detects the outer grid geometry and determines dimensions from the internal line spacing.
- Uses OCR / LLM-based digit recognition to read the clue number in each cell (empty vs. a positive integer).
- There are no regions or thick borders to classify — the only content is the per-cell clue array.
- Validates that `cells` is an integer array of the correct rows×cols shape with all values ≥ 0.

# Misc

## Coordinate convention

Player-entered values are keyed as `"c:col,row"`. The value encodes the tri-state: `1` = shaded, `2` = white-mark (definitely unshaded); absent or `0` = unknown. The persisted answer uses the structured `{states: [...]}` grid format directly, preserving all three states (`0` unknown, `1` shaded, `2` white-mark).
