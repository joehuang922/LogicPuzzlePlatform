# Tetro Chain K (テトロチェーンK)

**Puzzle Type ID:** 50 (incubating)

The magazine titles it テトロチェーンK(仮題), a reader-invented type, so it is incubating.

## Question structure description

A rectangular grid of thin solid lines with a solid outer border, no rooms. Circle clues
in three colours — white (○), gray (halftone ◍) and black (●) — sit on grid lines: on an
**edge midpoint** (touching 2 cells) or an **interior corner** (touching 4 cells), exactly
as in [Kuralin](../kuralin/kuralin.md) and [Half-Full Paint](../half-full-paint/half-full-paint.md).

### Canonical JSON structure

The rule sheet's 5x5 example:

```json
{
  "width": 5,
  "height": 5,
  "circles": [
    {"dr": 2, "dc": 4, "color": 1},
    {"dr": 3, "dc": 6, "color": 1},
    {"dr": 8, "dc": 4, "color": 0},
    {"dr": 9, "dc": 2, "color": 1},
    {"dr": 9, "dc": 8, "color": 2}
  ]
}
```

Kuralin's canon exactly:

- `width`, `height`: columns and rows.
- `circles`: doubled coordinates — cell (r, c) has its centre at `(2r+1, 2c+1)`; a circle
  has at least one even coordinate, `1 ≤ dr ≤ 2·height−1`, `1 ≤ dc ≤ 2·width−1`, one per
  spot. `color`: `0` = white, `1` = black, `2` = gray.

### Sample images

- [board-tetro-chain-k-1.jpg](board-tetro-chain-k-1.jpg): puzzle 1 (6x6), with the example
  and its answer above and the top of puzzle 2 below.
- [board-tetro-chain-k-2.jpg](board-tetro-chain-k-2.jpg): puzzle 2 (8x8), puzzle 1's bottom
  under a thumb above, puzzle 3's top below.
- [board-tetro-chain-k-3.jpg](board-tetro-chain-k-3.jpg): puzzle 3 (8x8), puzzle 2's bottom
  under a thumb above, puzzle 4's top below.
- [board-tetro-chain-k-4.jpg](board-tetro-chain-k-4.jpg): puzzle 4 (8x8), with puzzle 3's
  bottom right above it — the two boards line up edge to edge.
- [rule.jpg](rule.jpg): the rule text.

Every board is pinned as `<sample>.canon.json` (`board-tetro-chain-k-example` for the
example). Under the five rules below each has exactly one solution (CP-SAT,
`<sample>.solution.json`); the example's matches the printed answer.

## Answer structure description

Half-Full Paint's (and Heyawake's) per-cell state grid.

### Canonical JSON structure

Answer to the example (no dots):

```json
{
  "states": [
    [0, 0, 1, 0, 0],
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 1, 1],
    [1, 1, 0, 1, 0]
  ]
}
```

- `states`: `height x width`. `0` = unset, `1` = shaded, `2` = dot (marked unshaded).
  Only `1` counts for the rules.

## Rules

1. Shade some cells.
2. **Circles:** a circle's colour is the majority among the cells it touches: black = more
   shaded, white = more unshaded, gray = as many of each.
3. **Tetrominoes:** every group of orthogonally connected shaded cells has exactly 4 cells.
4. **Chain:** all the shaded groups link into one through their corners (the shaded cells
   are connected through the 8-neighbourhood).
5. **No twins touching** (not in the printed text; confirmed by the user): two tetrominoes
   of the same shape — L, I, T, S or O, rotations and reflections counting as the same, as
   in LITS — never touch, not even at a corner. Rules 1–4 alone leave every sample with
   2–3 solutions; with rule 5 each has exactly one, and the example's is the printed one.

### Success finishing criteria

Every circle shows its cells' majority, every shaded group is a tetromino, all of them
are connected through corners, and no two of the same shape touch at a corner.

## Puzzle Player

### Interactions

- As Half-Full Paint: **left-click** cycles unset → shaded → dot → unset, **right-click**
  backwards. No drag.
- Shaded cells: a dark gray fill (`#555`) — there are no rooms to keep visible; circles are
  drawn on top with a white halo so a black circle reads on a shaded cell.
- **Errors: On** (`liveValidate`):
  - a circle is outlined red when its colour can no longer come out (black when shaded
    can't exceed half of its cells, white when unshaded can't, gray when either side is
    already over half);
  - a shaded group over 4 cells, or one of under 4 whose every neighbour is dotted (it
    can't grow), is outlined red;
  - two complete tetrominoes of the same shape touching at a corner are outlined red.
- Rules live in `tetroChainKRules.ts` with `tetroChainKRules.test.ts` (shape
  classification shared with nothing yet; LITS's web code isn't factored for reuse).

### Progress calculation

`(cells shaded or dotted / all cells) * 100`.

## Puzzle Editor

### Interactions

Kuralin's circle editing, no walls:

- Click near an edge midpoint or interior corner to cycle its circle
  none → white → gray → black → none (the nearest valid point is highlighted).
- Add / remove a row at the bottom and a column at the right.

### Format problems (hard block, also in the API's `semanticChecks`)

- A circle at a cell centre or off the board, or two circles on one spot.

### Misread warnings (overridable)

- No circles.

## Puzzle Parser

`parsers/src/puzzle_parsers/tetro_chain_k/`. No OCR or Gemini.

- **Board and grid:** `rectify_board` (which flattens) → `find_grid_lines` (solid lines).
- **Circles:** the shared `lattice_circles.probe_lattice_circles` (Kuralin's and Half-Full
  Paint's ring probe and colour thresholds).
- **Found while prototyping:** sample 4 read 9 rows: puzzle 3's bottom border lies right
  above puzzle 4 on the same columns, and with no clean contour (a page rule runs through
  the board) the shared projection box spanned both boards and the blank gap. Fixed for
  everyone in `grid_utils._projection_box_quad` (`_skip_blank_gaps`): just inside a real
  border grid lines meet it, inside a gap there's no ink, so the box edge moves past a
  blank gap. Already on `main`; the full parser suite is unchanged by it.
- All four photos read the right size and circles; pinned at full, 2000, 1080px in
  `tests/test_tetro_chain_k_parser.py`, each pinned canon with a unique solution.

## Android port

- **Player:** `TetroChainKEngine` (`ShadeMarkEngine`, key `"col,row"`, the shared tap cycle
  through `vm::tapShadeCell`) and `TetroChainKBoard` on `ZoomableBoard`, circles drawn with
  Kuralin's `drawKuralinCircle`, `liveValidate`.
- **Admin review editor** (`TetroChainKAuthoring`, `TetroChainKEditor`): tap near a grid
  point to cycle its circle (Kuralin's `nearestPoint` snapping), rows and columns added or
  removed at any edge (`GridEdgeControls`; circles shift with the board), problems list.
  `TetroChainKMiniBoard` for the batch tile.
- Not a picture puzzle.

# Misc

## Coordinate convention

- Cells `[row][col]`; circles in doubled coordinates `(dr, dc)` as above.
- Player values: `"col,row"` → `1` shaded / `2` dot, unset omitted. Answer `{ states }`.
