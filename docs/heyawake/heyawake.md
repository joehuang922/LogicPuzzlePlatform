# Heyawake

**Puzzle Type ID:** 21

## Question structure description

A rectangular grid divided into rectangular rooms by thick borders. Some rooms
contain a single number (the clue) that specifies exactly how many of that
room's cells must be painted black. The player shades cells black subject to
the rules below.

Every room is an axis-aligned rectangle, and the rooms tile the grid exactly:
each cell belongs to exactly one room, with no gaps or overlaps.

### Canonical JSON structure

```json
{
  "width": 10,
  "height": 10,
  "rooms": [
    { "r": 0, "c": 0, "w": 3, "h": 2, "clue": 1 },
    { "r": 0, "c": 3, "w": 2, "h": 3, "clue": 2 },
    { "r": 0, "c": 5, "w": 5, "h": 1, "clue": null }
  ]
}
```

- `width`: grid width in cells (number of columns).
- `height`: grid height in cells (number of rows).
- `rooms`: list of rectangular rooms tiling the grid. Each room has:
  - `r`, `c`: zero-based row/column of the room's **top-left** cell.
  - `w`, `h`: room width and height in cells (both `>= 1`).
  - `clue`: the room's number (`integer >= 0`), or `null` if the room is
    unclued. When present, the clue is rendered in the room's top-left cell.

Room boundaries are derived directly from the rectangles — a thick border is
drawn wherever two cells belong to different rooms, and around the grid
perimeter.

### Sample images

- [board-heyawake.png](board-heyawake.png) — small board (10x10)
- [board-heyawake-medium.png](board-heyawake-medium.png) — larger board

## Answer structure description

The answer is a per-cell state grid indicating which cells are painted black
and which are marked white.

### Canonical JSON structure

```json
{
  "states": [
    [0, 1, 0, 2, 0, 0, 1, 0, 0, 0],
    [1, 0, 0, 0, 0, 1, 0, 0, 2, 0]
  ]
}
```

- `states`: `height` x `width` array. `0` = unset, `1` = black (painted),
  `2` = white-marked (player-asserted white).

Only `1` (black) cells are meaningful for the win condition; `0` and `2` are
both treated as "not black" when validating.

## Rules

- Paint some cells black. All remaining cells are white.
- A number in a room indicates exactly how many cells in that room are black.
  Rooms without a number may contain any quantity of black cells.
- Black cells may not be orthogonally adjacent (no two black cells share an
  edge).
- All white cells must form a single orthogonally-connected region.
- A straight line (horizontal or vertical run) of consecutive white cells may
  not pass through more than two rooms. In other words, no unbroken white run
  spans three or more rooms.

### Success finishing criteria

Every clued room contains exactly its clue count of black cells, no two black
cells are adjacent, all white cells are connected, and no white straight line
crosses three or more rooms — all satisfied simultaneously.

## Puzzle Player

### Interactions

- **Left-click** a cell cycles its state forward: unset → black → white-marked
  → unset.
- **Right-click** a cell cycles its state backward: unset → white-marked →
  black → unset.
- Black cells render as a dark fill. White-marked cells show a small centered
  dot (to distinguish a deliberate white from an untouched cell). Unset cells
  render as the plain board background.
- Room borders render as thick lines; interior cell lines are thin.
- Clue numbers render in the top-left cell of their room and are not editable
  by the player.

### Progress calculation

`(cells whose state != 0 / total cell count) * 100`. A cell counts as soon as
the player assigns it any state (black = 1 or white-marked = 2). Unset cells
(state = 0) are not counted.

## Puzzle Editor

### Interactions

- Click the center of a cell to cycle its room clue: none → 0 → 1 → 2 → ... →
  none (bounded by room area). The clue is stored on the room whose top-left
  cell is clicked; clicking a non-top-left cell of a room edits that same room's
  clue.
- Click a border (edge) between two cells to toggle it thick/thin. Toggling
  borders re-partitions the grid; the editor recomputes the rectangular rooms
  and rejects partitions whose rooms are not all rectangles.
- Width / Height numeric controls resize the grid (resets the partition to a
  single room or a default split as needed).
- JSON textarea is the source of truth; visual edits update it bidirectionally.

### Appearance

- Same as the player view, minus the shading interaction. Empty (unclued) rooms
  show no number. The top-left cell of each room is where a clue would appear.

## Puzzle Parser

- Detects the grid using perspective warping and solid grid-line detection
  (`detect_grid_lines` — interior lines are thin solid grey, room borders are
  thick solid black).
- Classifies each interior edge as thick (room boundary) or thin (same room) to
  recover the room partition, then converts each connected component into a
  rectangle by fitting it to its bounding box `{r, c, w, h}`. This is a
  best-effort fit: because thick-border detection is error-prone, a component
  that is not a perfect rectangle is **not** a parse failure — it is snapped to
  its bounding box so parsing still yields a result. Rectangle-ness and exact
  tiling are checked in `validate()` (below) so imperfect parses surface as
  validation warnings rather than hard errors.
- Uses OCR / an LLM-based digit recognizer to read the clue number in each room
  (rooms may be unclued). This is the key difference from pure border-partition
  puzzles (e.g. LITS): a per-room digit must be recognized and attached to the
  correct room.
- `validate()` checks dimensions, that rooms tile the grid exactly (no gaps or
  overlaps once snapped), that every room is a rectangle, and that clues are
  non-negative integers no larger than their room's cell count. These are board
  validation criteria — a failing board is reported for review, but the parser
  itself still returns its best-effort result.

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` strings. For example, column 3,
row 5 is `"3,5"`. The state value at each key is: `1` = black, `2` =
white-marked. Unset cells are omitted from the value map. Room coordinates in
the canon (`r`, `c`) are zero-based with row-major orientation (row 0 = top).
