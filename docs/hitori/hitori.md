# Hitori

**Puzzle Type ID:** 26

## Question structure description

A rectangular grid where **every** cell holds a positive integer. There are no empty cells, no regions, and no other markings. Numbers repeat within rows and columns; the solver shades cells to remove those duplicates. Values usually range from 1 to the larger grid side (1–8 on an 8x8 board, 1–17 on a 17x17 board), so two-digit numbers are common on large boards.

The canonical representation is a plain `rows x cols` integer grid, the same shape as Nurikabe, except that `0` is not allowed: every cell is a number.

### Canonical JSON structure

```json
{
  "cells": [
    [7, 8, 4, 3, 6, 5, 7, 2],
    [7, 5, 6, 2, 4, 8, 8, 8],
    [7, 2, 8, 4, 5, 3, 7, 6],
    [3, 4, 5, 2, 7, 4, 6, 1],
    [4, 1, 8, 5, 6, 7, 2, 3],
    [2, 7, 3, 1, 2, 4, 4, 4],
    [2, 3, 4, 8, 5, 6, 3, 7],
    [2, 6, 7, 2, 3, 2, 5, 4]
  ]
}
```

- `cells`: `rows x cols` array of positive integers (`>= 1`). Values have no fixed upper bound. The example is puzzle 1 from `board-hitori-8x8.jpg`.

### Sample images

- [board-hitori-8x8.jpg](board-hitori-8x8.jpg): 8x8 board (puzzle 1, Easy). The page also shows a partial 6x6 worked example (途中経過) and the edges of puzzles 2 and 3.
- [board-hitori-17x17.jpg](board-hitori-17x17.jpg): 17x17 board (puzzle 3, Hard), numbers 1–17. The bottoms of two other 8x8 boards appear above it.

## Answer structure description

The answer is the state of every cell: shaded (removed) or not. Marking a cell is only a solver aid and means the same as unshaded.

### Canonical JSON structure

```json
{
  "states": [
    [1, 0, 0, 0, 0, 0, 2, 0],
    [0, 0, 0, 0, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0],
    [0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 1, 0, 1, 0],
    [0, 0, 0, 0, 0, 0, 1, 0],
    [1, 0, 0, 1, 0, 0, 0, 0]
  ]
}
```

- `states`: `rows x cols` array of integers. `0` = unset, `1` = shaded, `2` = marked (circled; the player has decided the cell stays unshaded). This example only shows the format and is not a verified solution.

## Rules

- Shade some cells so that no number appears more than once among the **unshaded** cells of any row or column.
- Shaded cells must not touch each other orthogonally. Diagonal contact is allowed.
- All unshaded cells must form one orthogonally connected group. Shaded cells may not split the board.

### Success finishing criteria

The puzzle is solved when all of the following hold. Cells in state `0` and `2` both count as unshaded.

- No row or column contains a repeated value among its unshaded cells.
- No two shaded cells are orthogonally adjacent.
- The unshaded cells form a single orthogonally connected region.

Marking is never required. A board with every remaining cell left at `0` can still be solved.

## Puzzle Player

### Interactions

- Every cell has three states: unset, shaded, and marked. Marked is a solver aid for a cell the player has decided stays unshaded.
- Left click cycles a cell forward: empty → shaded → marked → empty. Right click cycles backward: empty → marked → shaded → empty. There is no drag-paint, and each click changes one cell. This is the shared shade/mark interaction. On Android the engine implements `ShadeMarkEngine` and the board's `onTapCell` is wired to `vm::tapShadeCell`.
- Every cell is playable. Unlike Nurikabe, there are no read-only clue cells.
- **Appearance:**
  - Shaded cells are filled with the shared `ROOM_SHADE` gray, with the number still drawn in black. Hitori has no rooms, but the number has to stay readable so the player can check remaining duplicates.
  - Marked cells draw a circle around the number, as in the scanned worked example.
  - Unset cells show only the number.
  - Grid lines are thin and solid, with a thicker outer border.
  - Numbers are sized to fit two digits per cell on large boards.

### Progress calculation

`(cells set to shaded or marked / total cells) * 100`. A cell counts once the player sets it to `1` or `2`; unset cells do not count. Every Hitori cell is a decision, so the denominator is the whole grid.

## Puzzle Editor

A grid editor like the Nurikabe editor. Each cell holds a required positive integer.

### Interactions

- Click a cell to edit its value by typing a positive integer. A cell cannot be left empty: clearing it is rejected or reverts to the previous value.
- Rows/Cols inputs resize the grid. Existing values are kept where they still fit, and new cells default to `1`.
- The JSON textarea is the source of truth; visual edits update it, and edits to it update the grid.

## Puzzle Parser

- **Grid lines:** the grid is plain and rectangular, ruled with thin solid lines inside a thick outer border, with no regions. The lines are crisp in both samples, so the parser uses `detect_grid_lines`.
- **Multiple boards per page:** both sample photos also show neighboring puzzles: partial boards, the worked example, and puzzle numbers in black boxes. The parser must pick the largest complete bordered grid and ignore the rest.
- **Perspective:** the 17x17 photo is slightly curved and skewed near the edges. The pipeline detects the outer border and warps it to a rectangle before locating grid lines.
- **OCR:** every cell holds a number, so there are no empty cells to detect. The main risks are:
  - Two-digit values (10–17) printed in a condensed font that nearly fills the cell. They must not be read as two separate digits or lose a digit when cropped.
  - Confusing `1` with `7`, and `11` with `17`.
  - The cell crop margin must stay small enough to keep both digits of a two-digit number.
- **Plausibility check:** in the samples all values are between 1 and `max(rows, cols)`. An OCR result outside that range is a likely misread and is flagged.
- **Accuracy bar:** measured by how many cell values the parser reads correctly. Grid geometry must be right; individual OCR misses are expected and are fixed with the editor's per-cell entry.
- **Validation:** `cells` must be a rectangular integer grid with every value `>= 1`.

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` (zero-based, column first). The value is `1` for a shaded cell and `2` for a marked cell; a missing key or `0` means unset. The saved answer uses the `{states: [...]}` grid format directly, with the same `0`/`1`/`2` encoding, matching Nurikabe and Heyawake.
