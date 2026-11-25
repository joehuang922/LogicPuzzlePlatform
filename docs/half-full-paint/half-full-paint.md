# Half-Full Paint (半全ペイント)

**Puzzle Type ID:** 48

## Question structure description

A rectangular grid of thin solid lines, divided into rooms by thick walls (the outer border
is a wall). Circle clues in three colours — white (○), gray (halftone ◍) and black (●) —
sit on grid lines, never at a cell centre: on an **edge midpoint** (touching 2 cells) or an
**interior corner** (touching 4 cells), as in [Kuralin](../kuralin/kuralin.md). A circle
often sits on a wall, but walls and circles are independent clues.

### Canonical JSON structure

The rule sheet's 4x4 example:

```json
{
  "width": 4,
  "height": 4,
  "grids": {
    "h": [
      [0, 0, 0, 0],
      [1, 0, 1, 1],
      [0, 0, 1, 1]
    ],
    "v": [
      [1, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 0]
    ]
  },
  "circles": [
    {"dr": 1, "dc": 2, "color": 2},
    {"dr": 2, "dc": 5, "color": 0},
    {"dr": 4, "dc": 2, "color": 1},
    {"dr": 6, "dc": 1, "color": 0},
    {"dr": 6, "dc": 6, "color": 1},
    {"dr": 7, "dc": 4, "color": 2}
  ]
}
```

- `width`, `height`: columns and rows.
- `grids`: room walls, Country Road's layout.
  - `h`: `(height-1) x width`; `1` = a wall between (r, c) and (r+1, c).
  - `v`: `height x (width-1)`; `1` = a wall between (r, c) and (r, c+1).
- `circles`: Kuralin's doubled coordinates and colour codes. Cell (r, c) has its centre at
  `(2r+1, 2c+1)`, so a circle at `(dr, dc)` with one even coordinate is on an edge
  midpoint and with both even is on a corner. Valid circles have `1 ≤ dr ≤ 2·height−1`,
  `1 ≤ dc ≤ 2·width−1` and at least one even coordinate; no two share a spot.
  - `color`: `0` = white, `1` = black, `2` = gray.

### Sample images

- [board-half-full-paint-1.jpg](board-half-full-paint-1.jpg): puzzle 1 (6x6), with the
  example and its answer to the right, a finger at the top and the top of puzzle 2 below.
- [board-half-full-paint-2.jpg](board-half-full-paint-2.jpg): puzzle 2 (10x10), with the
  bottom of puzzle 1 and the example answer above and the edge of puzzle 3 to the right.
- [board-half-full-paint-3.jpg](board-half-full-paint-3.jpg): puzzle 3 (10x10), with the
  last lines of the rule text above and the edge of puzzle 2 to the left.

Every board is pinned as `<sample>.canon.json`, with `board-half-full-paint-example` for
the example. Under the rules below each has exactly one solution (CP-SAT,
`<sample>.solution.json`); the example's matches the printed answer.

## Answer structure description

Heyawake's per-cell state grid.

### Canonical JSON structure

Answer to the example above (no marks):

```json
{
  "states": [
    [0, 1, 0, 0],
    [1, 1, 0, 0],
    [0, 1, 1, 1],
    [0, 1, 0, 1]
  ]
}
```

- `states`: `height x width`. `0` = unset, `1` = shaded, `2` = marked unshaded (a dot).
  Only `1` counts for the rules; `0` and `2` are both unshaded.

## Rules

1. Shade some cells.
2. **Circles:** a circle's colour is the majority among the cells it touches (2 on an edge,
   4 on a corner): black = more shaded than unshaded, white = more unshaded than shaded,
   gray = as many shaded as unshaded.
3. **Rooms:** every room is all shaded, all unshaded, or exactly half shaded. (A room with
   an odd number of cells can't be half.)
4. In every room the shaded cells are connected, and so are its unshaded cells
   (orthogonally, inside the room). This only bites in a half-shaded room.

### Success finishing criteria

Every circle's colour matches the majority of its cells, every room is all / none / half
shaded, and in each room the shaded cells and the unshaded cells each form one connected
group.

## Puzzle Player

### Interactions

- Like Heyawake: **left-click** a cell cycles unset → shaded → dot → unset; **right-click**
  cycles backwards. No drag.
- Shaded cells are filled with `ROOM_SHADE` (it's a room board); dots are small and gray.
- **Errors: On** (`liveValidate`), from what the player decided (shaded, or dotted =
  unshaded; unset cells are open):
  - a circle turns red when its colour can no longer come out: black when shaded can't
    exceed half, white when unshaded can't, gray when either side already has more than
    half;
  - a room is tinted red when it can't be all, none or half any more: it has both shaded
    and dotted cells and more than half of either, or it is odd-sized and has both;
  - a room whose cells are all decided is tinted red if a colour in it is split.
- Rules live in `halfFullPaintRules.ts` with `halfFullPaintRules.test.ts`.

### Appearance

- Thin solid grid lines, thick walls and border, as in the print.
- Circles drawn on top of the walls at their lattice points, about a third of a cell
  across: white with a black outline, gray (`#9a9a9a`) with a black outline, solid black.
  A circle over a shaded cell stays readable (it has its own fill and outline).

### Progress calculation

`(cells with state 1 or 2 / all cells) * 100`.

## Puzzle Editor

### Interactions

- Mode chips above the board:
  - **Walls**: click near an interior edge to toggle its wall (the edge under the pointer
    is highlighted).
  - **Circles**: click near an edge midpoint or interior corner to cycle its circle:
    none → white → gray → black → none (the nearest valid lattice point is highlighted).
- Add / remove a row at the bottom and a column at the right.
- Walls are edited freely; nothing is refused or auto-fixed.

### Format problems (hard block, also in the API's `semanticChecks`)

- `grids.h` / `grids.v` don't match `width` x `height`.
- A wall that doesn't close off a room (both sides still in the same room).
- A circle at a cell centre or off the board, or two circles on one spot.

### Misread warnings (overridable)

- No circles.
- Only one room (usually walls that weren't read).

### Appearance

Same as the player view without shading; the hovered edge (Walls) or lattice point
(Circles) is highlighted, and problem spots are outlined red.

## Puzzle Parser

`parsers/src/puzzle_parsers/half_full_paint/`.

- **Board and grid:** `rectify_board` (which flattens) → `find_grid_lines`. Solid thin
  lines. Each photo shows parts of other boards (the example board on sample 1 is also
  complete); the border finder picks the puzzle.
- **Walls:** `grid_utils.classify_border_thickness`.
- **Circles:** Kuralin's ring probe at every edge midpoint and interior corner
  (`ring_probe.probe_ring` / `fill_ratio`) and its colour thresholds. That code moves from
  `kuralin/grid_detector.py` to a shared helper both parsers call. No OCR or Gemini: no
  `_OCR_TYPES` entry and no recognizer.
- Prototyped on the samples: all three read the right size, walls and circles (puzzle 1
  matches a hand transcription exactly; 2 and 3 checked against overlays), and each read
  has exactly one solution. Pinned in `tests/test_half_full_paint_parser.py` at full,
  2000 and 1080px.

## Android port

- **Player:** `HalfFullPaintEngine` (`ShadeMarkEngine`, key `"col,row"`, tap cycles
  unset → shaded → dot through `vm::tapShadeCell`) and `HalfFullPaintBoard` on
  `ZoomableBoard`, `BoardColors.ROOM_SHADE` fill, circles on top, `liveValidate`.
- **Admin review editor** (`HalfFullPaintAuthoring`, `HalfFullPaintEditor`): mode chips
  **Walls** (tap a line to toggle its wall) and **Circles** (tap near a lattice point to
  cycle none → white → gray → black), rows and columns added or removed at any edge
  (`GridEdgeControls`; circles shift with the board), and the problems list.
  `HalfFullPaintMiniBoard` for the batch tile, framed red on problems.
- Not a picture puzzle.

# Misc

## Coordinate convention

- Cells `[row][col]`, row 0 at the top; circles in doubled coordinates `(dr, dc)` as above.
- Player values: Heyawake's — key `"col,row"`, value `1` = shaded, `2` = dot; unset cells
  omitted. The answer is `{ states }` (height x width) built from them.
