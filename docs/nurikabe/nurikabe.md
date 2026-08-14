# Nurikabe

**Puzzle Type ID:** 24

## Question structure description

A rectangular grid of cells. Some cells carry a positive integer clue; all other cells are empty. Each clue is the seed of a white "island" whose size (in cells) equals the clue. The remaining cells form a single connected black "sea" (wall). The only given information is the set of numbered cells and their values.

This is a clue-in-cell puzzle, so the canonical representation is a plain `rows x cols` integer grid — identical in shape to Number Link and Shikaku. `0` marks an empty cell; a positive integer marks a clue cell.

### Canonical JSON structure

```json
{
  "cells": [
    [0, 5, 0, 0, 0],
    [0, 0, 0, 3, 0],
    [2, 0, 0, 0, 0],
    [0, 3, 0, 0, 0],
    [0, 0, 0, 1, 0]
  ]
}
```

- `cells`: `rows x cols` array of integers. `0` = empty cell, any positive integer = an island clue placed in that cell (the island containing this cell must have exactly that many white cells). Clue values have no fixed upper bound.

### Sample images

- [board-nurikabe.png](board-nurikabe.png) — 10x10 board (Easy)
- [board-nurikabe-medium.png](board-nurikabe-medium.png) — 10x18 board (Easy)

## Answer structure description

The answer is the paint state of every cell: which cells are black (sea) and which are white (island). Clue cells are always white by rule.

### Canonical JSON structure

```json
{
  "states": [
    [0, 0, 1, 0, 1],
    [1, 1, 0, 0, 1],
    [0, 1, 1, 1, 0],
    [1, 0, 0, 1, 0],
    [1, 1, 0, 0, 0]
  ]
}
```

- `states`: `rows x cols` array of integers. `0` = unset, `1` = black (sea), `2` = white-marked (a solver aid dot on a cell the player believes is island/white). (The example above is illustrative of the format, not a verified solution.)

## Rules

- Each numbered cell is part of a white **island** of exactly that many cells. Every island contains **exactly one** number.
- All remaining (unnumbered, non-island) cells form the black **sea**.
- Islands may not touch each other orthogonally — every pair of distinct islands must be separated by at least one sea cell.
- All black sea cells are **orthogonally connected** (one single sea).
- The sea contains no **2x2 block** of black cells ("no pools").

### Success finishing criteria

Every clue's connected white region has size equal to the clue and contains exactly that one clue; every white cell belongs to some clued island (equivalently, no white region is clueless and none holds two clues); all black cells form a single orthogonally-connected region; and no 2x2 area is entirely black.

## Puzzle Player

### Interactions

- Each non-clue cell has three states: unset (empty), black (sea), and white-marked (a centered dot). "White-marked" is a solver aid — a cell the player has deduced is island/white but wants to flag without painting it.
- Left click cycles a cell forward: empty → black → marked → empty. Right click cycles backward: empty → marked → black → empty. There is no drag-paint; each click flips a single cell.
- Clue cells are read-only: they are always white islands and cannot be painted or marked.
- Black cells are filled dark; white-marked cells show a small centered dot; unset and clue cells stay light. Clue numbers render on top of their cell.

### Progress calculation

`(non-clue cells assigned a state / total non-clue cells) * 100`. A non-clue cell counts toward progress as soon as the player sets it to black (`1`) or white-marked (`2`); unset cells do not count. Clue cells are excluded from both numerator and denominator since they are fixed white by rule. This "how much of the board have you decided" metric matches Nurikabe's fill-everything structure.

## Puzzle Editor

A grid editor like Number Link / Shikaku: a rectangular array of cells, each holding an optional positive integer clue.

### Interactions

- Click a cell to edit its clue value (type a positive integer, or clear it to make the cell empty).
- Rows/Cols inputs allow resizing the grid (preserves existing clues where they still fit).
- The JSON textarea is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- The board is a plain rectangular grid with no regions. The sample scans render grid lines as thin solid rulings that scanning degrades into faint, broken segments, so the parser uses `auto_detect_grid_lines` (auto-sweeps erode sizes for optimal detection) rather than the crisp-line `detect_grid_lines`, matching the Number Link scan character.
- Detects the outer border, warps to a rectangle, and locates the grid lines to determine dimensions. Cell ROIs are cropped with an inner margin, then a numeric OCR backend reads each cell (empty cells → `0`).
- No border/region classification is needed — Nurikabe has no thick room walls.
- **Accuracy bar:** judged by digit-recognition correctness (clues-off), analogous to the Number Link / Shikaku metric. Missing or misread clues are the dominant failure mode; the editor's per-cell clue entry covers the remaining misses. Grid geometry must be right, but individual OCR misses are expected and correctable.
- Validates that `cells` is a rectangular integer grid with all values `>= 0` and at least one positive clue.

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` (zero-based, column first) with value `1` for a black (sea) cell and `2` for a white-marked cell (solver aid). Absent or `0` = unset. The persisted answer uses the structured `{states: [...]}` grid format directly, where each entry is `0` (unset), `1` (black), or `2` (white-marked) — mirroring Heyawake.
