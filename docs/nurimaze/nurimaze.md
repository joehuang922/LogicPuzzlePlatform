# Nurimaze

**Puzzle Type ID:** 3

## Question structure description

A grid divided into rooms by thick borders. Some cells contain special symbols: S (start), G (goal), circles (waypoints), and triangles (forbidden waypoints). Players must paint rooms black or mark them white to create a maze path.

### Canonical JSON structure

```json
{
  "cells": [
    [3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 2, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 4]
  ],
  "grids": {
    "h": [[1, 0, 0, 1, ...], ...],
    "v": [[0, 1, 0, 0, ...], ...]
  }
}
```

- `cells`: rows x cols array of integers.
  - `0` = empty, `1` = circle, `2` = triangle, `3` = S (start), `4` = G (goal).
- `grids.h`: (rows-1) x cols array. `1` = thick horizontal border between row r and row r+1. `0` = thin/no border.
- `grids.v`: rows x (cols-1) array. `1` = thick vertical border between col c and col c+1. `0` = thin/no border.

Rooms are defined by connected components of cells separated by thick borders.

### Sample images

- [board-nurimaze.jpg](nurimaze/board-nurimaze.jpg) — small board
- [board-nurimaze-big.jpg](nurimaze/board-nurimaze-big.jpg) — larger board

## Answer structure description

The answer is a per-cell state grid indicating which rooms are painted black, which are marked white.

### Canonical JSON structure

```json
{
  "states": [
    [1, 1, 2, 2, 1, 1, 2, 2, 1, 2],
    [...]
  ]
}
```

- `states`: rows x cols array. `0` = unset, `1` = black (painted), `2` = marked (white/path).

## Rules

- Paint each room entirely black or mark it entirely white (room-level operation — all cells in a room share the same state).
- Rooms containing special symbols (S, G, circle, triangle) cannot be painted black; they can only be marked white.
- No 2x2 block of cells may be all the same state (all-black or all-non-black).
- All white/marked cells must form a single connected region with no loop (the maze is
  a tree; dead ends are fine). So there is exactly one route from S to G.
- The route from S to G (through non-black cells) must pass through ALL circle cells.
- The route from S to G must NOT pass through any triangle cells.

### Success finishing criteria

All rooms are assigned a state (no unset rooms remain) AND all rules above are satisfied simultaneously.

## Puzzle Player

### Interactions

- Click a cell to toggle the state of its entire room.
- Rooms with special symbols: toggle between unset (white) and marked (dot indicator). Cannot be painted black.
- Normal rooms: cycle unset → black → marked → unset.
- Black rooms render as dark gray fill. Marked rooms show a small centered dot.

### Progress calculation

`(cells whose state != empty / total cell count) * 100`. A cell is considered non-empty once the player has assigned it any state (black = 1 or marked = 2). Unset cells (state = 0) are not counted.

## Puzzle Editor

### Interactions

- Click the center of a cell to cycle its symbol: empty → circle → triangle → S → G → empty.
- Click a border (edge) between two cells to toggle it between thick (room boundary) and thin (same room).
- Rows/Cols shown as read-only fields (determined by the JSON).
- Legend: 0=empty, 1=circle, 2=triangle, 3=S, 4=G.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

## Auto-solve

`player/solver/src/plugins/nurimaze` gates creates and edits (docs/auto-solve). Rooms are
black or white; propagation applies the no-2x2, no-loop and connected rules (a room
that would close a loop goes black, a room that is the only link between white rooms
goes white), and the route rule on partial boards (S still reaches G avoiding
triangles; each circle keeps two separate paths, to S and to G). Each undecided room is
then tried both ways before guessing. Production boards: 10x10 and the 45x31 photo are
settled by deduction alone (45x31 in ~0.35 s), the 17x17 needs some search (~2 s). A
misread board is usually proven impossible, and propagation names where it breaks,
which is how the 45x31 photo's parser errors were found.

## Puzzle Parser

- Detects the grid using perspective warping, then `flatten_board`: the giant
  boards (45x31) are photos of a curved page whose grid lines drift up to half a
  cell (`board-nurimaze-45x31-photo.jpg`, `board-nurimaze-17x17-photo.jpg`).
- Classifies borders as thick or thin to determine room structure (shared
  `classify_border_thickness`; its cut is Otsu's or the density valley between
  the classes, whichever closes rooms better).
- Uses LLM-based cell recognizer (Gemini) to identify symbols in each cell (empty, circle, triangle, S, G).
- Validates dimensions, cell value ranges (0-4), and grid border consistency.

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` strings. For example, column 3, row 5 is `"3,5"`. The state value at each key is: `0` = unset, `1` = black, `2` = marked.
