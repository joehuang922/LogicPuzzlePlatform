# Tile Paint

**Puzzle Type ID:** 40

Japanese name: タイルペイント (Nikoli). Not incubating. A **picture puzzle**: the
giant boards draw a picture when solved.

## Question structure description

A rectangular grid of cells. Some cells are **clue cells**, drawn like Kakuro
clue cells: split by a diagonal from upper-left to lower-right, with an
optional number in the upper-right triangle (the **right** clue) and an
optional number in the lower-left triangle (the **down** clue). The printed
boards always have a full clue row along the top (down clues only) and a full
clue column along the left (right clues only), with a blank corner cell; a few
more clue cells are scattered inside the board, usually carrying both numbers.

Every other cell is a **tile cell**. Thick walls divide the tile cells into
**tiles** (rooms) of any shape and size. The board edge and the sides of every
clue cell are walls too.

A clue's **run** is the straight line of tile cells starting next to the clue
cell (to the right for a right clue, below for a down clue) and ending at the
board edge or the next clue cell. The run crosses tile walls freely.

### Canonical JSON structure

```json
{
  "cells": [
    [{"right": null, "down": null}, {"right": null, "down": 1}, {"right": null, "down": 4}, {"right": null, "down": 1}, {"right": null, "down": 2}],
    [{"right": 1, "down": null}, null, null, null, null],
    [{"right": 2, "down": null}, null, null, null, null],
    [{"right": 3, "down": null}, null, null, null, null],
    [{"right": 2, "down": null}, null, null, null, null]
  ],
  "grids": {
    "h": [[0, 1, 1, 1, 1], [0, 1, 0, 1, 1], [0, 1, 1, 1, 1], [0, 1, 1, 1, 0]],
    "v": [[0, 0, 0, 0], [1, 1, 1, 1], [1, 1, 1, 0], [1, 1, 0, 1], [1, 1, 1, 1]]
  }
}
```

(This is the printed rule example, 例題: a 4x4 tile area with its clue row and column.)

- `cells`: rows x cols array. `null` = tile cell. An object = clue cell:
  - `right`: integer `>= 0` counting shaded cells in the run to the right, or
    `null` (no number in the upper-right triangle).
  - `down`: integer `>= 0` counting shaded cells in the run below, or `null`.
  - `{"right": null, "down": null}` is a blank clue cell (the top-left corner).
- `grids.h`: (rows-1) x cols. `h[r][c] = 1` when a wall lies between cell
  `(r, c)` and `(r+1, c)`, `0` otherwise.
- `grids.v`: rows x (cols-1). `v[r][c] = 1` when a wall lies between cell
  `(r, c)` and `(r, c+1)`, `0` otherwise.
- An edge beside a clue cell is ignored when tiles are built: the parser and
  editors write `1` between a clue cell and a tile cell (drawn thick) and `0`
  between two clue cells (drawn thin).
- Tiles are the connected components of tile cells, joined across `0` edges.
  The board's outer perimeter is always a wall.

### Sample images

- [board-tile-paint-small.jpg](board-tile-paint-small.jpg) — 11x11 incl. the clue row/column (10x10 tiles area), one inner clue cell; a second board is cut off below it
- [board-tile-paint-medium.jpg](board-tile-paint-medium.jpg) — 25x25 incl. clues, plus the rule example and the top of the small board
- [board-tile-paint-big.jpg](board-tile-paint-big.jpg) — "the giant", a tall board (about 29 x 40 incl. clues) with the printed rules and example

## Answer structure description

A per-cell state grid over the whole board.

### Canonical JSON structure

```json
{
  "states": [
    [0, 0, 0, 0, 0],
    [0, 2, 1, 2, 2],
    [0, 1, 1, 2, 2],
    [0, 2, 1, 1, 1],
    [0, 2, 1, 2, 1]
  ]
}
```

- `states`: rows x cols. `0` = unset, `1` = shaded, `2` = marked (player
  asserts the tile stays white). Clue cells are always `0`. Every cell of a
  tile holds the same state.

Only `1` matters to the win check; `0` and `2` both count as unshaded.

## Rules

1. Shade some of the tiles.
2. A tile is either fully shaded or fully unshaded; never only part of it.
3. A number in a clue cell gives how many shaded cells its run holds: the
   upper-right number counts the run to the right, the lower-left number the
   run below, each up to the board edge or the next clue cell.

### Success finishing criteria

Every clue number equals the shaded cells in its run (tiles are shaded whole by
construction of the interaction).

## Puzzle Player

### Interactions

- **Left-click** any cell of a tile cycles the whole tile: unset → shaded →
  marked → unset. **Right-click** cycles backwards: unset → marked → shaded →
  unset. No drag.
- Clue cells take no input.
- Android uses the shared shade/mark interaction: the engine implements
  `ShadeMarkEngine` with `shadeGroup` returning the tapped cell's tile (and
  `null` on a clue cell); taps go to `vm::tapShadeCell`.
- **Errors: On** (`liveValidate`): a clue number is drawn red when its run
  already has more shaded cells than the number, or when its shaded plus
  unset cells are fewer than the number.

### Appearance

- Thin solid grid lines, thick walls between tiles, around clue cells and
  around the board.
- Shaded cells use the shared room shade (`ROOM_SHADE` on web,
  `BoardColors.ROOM_SHADE` on Android) so walls stay visible. Marked cells show
  a small centred dot.
- Clue cells: white like the print, a thin diagonal from upper-left to
  lower-right (none on a blank clue cell such as the corner), the right number in the upper-right triangle and the down number
  in the lower-left triangle (black, about 0.4 cell).
- **Preview panel** above the board (when not readonly), as in Nonogram /
  Picto Link: the board without a leading all-clue row and column, shaded cells
  black, marked cells white, unset cells `#d9d9d9`, inner clue cells white.
  Cells 3-8px, about 160px max.
- **Solved thumbnail (Android):** `renderThumbnail` draws the same picture
  (shaded black, everything else white once solved).

### Progress calculation

`(tiles that are shaded or marked / total tiles) * 100`. A tile counts once its
cells hold a non-zero state (the first cell of the tile in row-major order is
checked). Clue cells are not tiles.

## Puzzle Editor

### Interactions

Mode chips above the board:

- **Walls**: click near a cell edge to toggle the wall there. Edges beside a
  clue cell are fixed walls and don't toggle.
- **Clues**: click a cell to toggle it between tile cell and clue cell. On a
  clue cell, number fields for **right** and **down** appear (blank = none).
  Clicking the upper-right triangle focuses the right field, the lower-left
  the down field.
- Add / remove a row at the bottom and a column at the right.
- Walls may be edited freely; nothing is refused or auto-fixed.

### Format problems (hard block, also in the API's `semanticChecks`)

- `cells`, `grids.h` and `grids.v` don't have matching dimensions.
- A wall between two tile cells that doesn't close off a tile (both sides
  still belong to the same tile: a half-drawn wall).
- A clue number whose run is empty (a right clue in the last column or right
  before another clue cell; a down clue in the last row or right above
  another clue cell).

### Misread warnings (overridable)

- A clue number larger than its run's length.
- No clue numbers at all.
- No tiles (every cell is a clue cell).

### Appearance

Same as the player view, without shading; the edge under the pointer is
highlighted in Walls mode and the selected clue cell is outlined in Clues
mode.

## Puzzle Parser

`parsers/src/puzzle_parsers/tile_paint/`.

- **Board:** the shared `rectify_board` (which flattens). The small and medium
  photos also show parts of neighbouring boards and the rule example, so the
  largest complete bordered grid is chosen. Grid lines are solid
  (`detect_grid_lines` / `find_grid_lines`); the big board's thin lines are
  faint and dense (~40 rows), the medium photo is tilted.
- **Clue cells:** a cell is a clue cell when it carries the upper-left to
  lower-right diagonal (dark pixels along the diagonal, little on the
  anti-diagonal). The top row and left column are expected to be clue cells.
- **Clue numbers:** a clue cell holds up to two numbers in its triangles, so it
  goes through `cell_classify.classify_cells` with `DualIntegerTarget` (like
  Kakuro), not EasyOCR. Numbers are multi-digit (up to the run length, 15 on
  the samples) and 0 is a clue.
- **Walls:** `grid_utils.classify_border_thickness(warped_gray, grid)`; edges
  beside clue cells are written as `1`.
- `validate()` reports format problems and misread warnings as above.
- Each sample's parse is hand-checked and pinned as
  `docs/tile-paint/<sample>.canon.json`, at full and Android size; a CP-SAT
  solve confirms a unique solution.

## Android port

- **Player:** `TilePaintEngine` (`ShadeMarkEngine`, tile `shadeGroup`, same
  `"col,row"` keys, extract / progress / completion ported from the web),
  `TilePaintBoard` on `ZoomableBoard` with `liveValidate`, `PicturePreview`
  above the board, and `renderThumbnail` for the collection.
- **Admin review editor** (`TilePaintAuthoring`, `TilePaintEditor`): mode chips
  **Walls** (tap an edge to toggle its wall) and **Clues** (tap a cell to toggle
  clue / tile; tap a clue cell's upper-right or lower-left triangle to edit that
  number in a number field, blank = none), add / remove row and column at the
  bottom / right, and the problems list. Builds on `WallRoomsAuthoring` and the
  Kakuro clue-cell field. `TilePaintMiniBoard` for the batch tile, framed red on
  problems.

# Misc

## Coordinate convention

Player values are keyed `"col,row"` (column 3, row 5 is `"3,5"`), value `1` =
shaded, `2` = marked; unset cells are omitted. Every cell of a tile carries the
tile's state. Canon arrays are row-major (`cells[row][col]`, `states[row][col]`),
zero-based, row 0 at the top. Clue cells and the leading clue row / column are
part of the grid coordinates.
