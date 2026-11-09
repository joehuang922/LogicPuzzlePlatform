# Sinkamino (シンカミノ)

**Puzzle Type ID:** 31

## Question structure description

A rectangular grid with no rooms. Each cell is white, black (blocked), or holds a given **square** (a small printed □). On top of the grid run **arrow trails**: lines through cell centres, moving between orthogonally adjacent cells and turning only at cell centres, with an arrowhead at one end (the **head**) and a plain **tail** at the other.

The player places more squares in white cells. Edge-connected squares form an **island** (ミノ); along each arrow the islands "evolve", each one being the previous island plus one square.

### Canonical JSON structure

A small hand-made example (3 rows x 5 columns):

```json
{
  "cells": [
    [2, 0, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 0, 0, 2]
  ],
  "arrows": [
    [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]
  ]
}
```

- `cells`: `rows x cols` integers. `0` = white cell, `1` = black cell (no square may go here), `2` = given square.
- `arrows`: list of trails. Each trail is an ordered list of `[row, col]` cells from **tail to head**. Consecutive cells are orthogonally adjacent, a trail has at least 2 cells, and no trail cell is black. The last cell holds the arrowhead.

### Sample images

Photos of magazine pages; each also shows parts of neighbouring puzzles.

- [sinkamino-board-1.jpg](sinkamino-board-1.jpg) — puzzle 1, 10x10 (top of puzzle 3 and the rule text's tail also visible).
- [sinkamino-board-2.jpg](sinkamino-board-2.jpg) — puzzle 2, 10x10 (top of puzzle 4 also visible).
- [sinkamino-board-3.jpg](sinkamino-board-3.jpg) — puzzle 4, 10x10 (bottom of puzzle 2 also visible).

## Answer structure description

The state of every cell.

### Canonical JSON structure

Answer to the example above:

```json
{
  "states": [
    [0, 0, 1, 0, 1],
    [0, 0, 1, 0, 1],
    [0, 0, 0, 0, 0]
  ]
}
```

- `states`: `rows x cols` integers. `0` = unset, `1` = placed square, `2` = marked (solver-aid dot: "no square here"). Black cells and given squares are always `0`. For checking, the squares are the given squares plus every `1`.

In the example: island A = {(0,0)} (given, size 1), island B = {(0,2),(1,2)} (size 2), island C = {(0,4),(1,4),(2,4)} (size 3, includes the given (2,4)). The arrow crosses A at (0,0), B at (0,2) and C at (0,4) — once each — and B is A plus one square, C is B plus one square, in the same orientation.

## Rules

1. Place squares in some white cells (given squares are already placed). Squares sharing an edge form one island.
2. Every island is crossed by arrow trails at **exactly one** of its squares (counted over all arrows: no island is left uncrossed, and none is crossed twice, by one arrow or by two).
3. Every arrow crosses **at least 2** islands.
4. Along each arrow, from tail to head, each island is the **previous island's exact shape, in the same orientation (no rotation, no flipping), with one square added**. So the sizes go up by exactly 1 each step.

### Success finishing criteria

Treating given squares and placed squares (`1`) as squares, and unset/marked cells as empty: no square sits on a black cell; every island has exactly one square on an arrow cell (over all arrows); every arrow crosses at least 2 islands; and for each consecutive pair of islands (P, N) along an arrow, `|N| = |P| + 1` and there is a square of N whose removal leaves a translated copy of P.

## Puzzle Player

### Interactions

Like the shade/mark puzzles (Nurikabe), with a square instead of a black fill:

- Each white cell has three states: empty, square, and marked (a small dot). Left click cycles empty → square → marked → empty; right click cycles backward. No drag.
- Black cells and given squares take no input.
- Appearance: black cells filled dark (no rooms, so not `ROOM_SHADE`). Given squares are drawn like the print: an inset outlined square in black. Placed squares use the same inset square in a distinct colour (blue outline, light blue fill), so givens stay recognisable. Arrow trails are drawn on top as dark polylines through cell centres with a filled triangular head, ignoring clicks.
- Android: the engine implements `ShadeMarkEngine` (square = the "shaded" state), with `shadeGroup` returning null for black cells and given squares.

### Progress calculation

`(answerable cells set to square or marked / answerable cells) * 100`, where answerable cells are white cells (not black, not given squares).

## Puzzle Editor

### Interactions

- **Cell mode:** click a cell to cycle white → black → given square → white.
- **Arrow mode:** press on the tail cell and drag through orthogonally adjacent cells to the head cell; release to add the trail (at least 2 cells). Dragging back over the previous cell undoes the last step. Clicking (without dragging) a cell on a trail deletes that trail.
- Rows/Cols inputs resize the grid, keeping cells that still fit and dropping trails that no longer fit.
- The JSON textarea is the source of truth, synced both ways.
- Format problems (listed and blocking, also checked by the API): a trail cell off the grid, two consecutive trail cells that aren't neighbours, a trail shorter than 2 cells, a trail over a black cell.

## Puzzle Parser

- Plain rectangular grid with solid thin lines: `rectify_board` → `find_grid_lines`. Arrow trails run through cell centres (half a cell off the grid lines), so the lattice fit should ignore them; check on every sample, including the long straight trails.
- Each scan also shows parts of the neighbouring puzzles; the border detector must take the one complete board.
- **Black cells:** cells whose interior is mostly dark.
- **Given squares:** an inset square outline in the cell (contour/edge test). An arrow may run through the square (board 2, R1C1 and R1C5), so the test must tolerate a line across it.
- **Arrow trails:** per adjacent cell pair, test for ink on the centre line across their shared edge (sampling either side of the grid line, outside where a given square's outline sits). The links form chains; each chain is one trail. The **head** is the chain end whose cell holds a filled triangle (a dark blob that isn't a black cell); the other end is the tail. If a chain is ambiguous (branching, two heads, no head), the parser drops it and the admin draws it.
- No digits, so no OCR (not in `_OCR_TYPES`).
- **Accuracy bar:** grid size, black cells and given squares must be right. Trails should be right on the samples, but admin authoring (arrow mode) is the fallback.
- Validates the canon shape: rectangular `cells` with values 0–2, every trail in bounds with adjacent steps and no black cells.

# Misc

## Coordinate convention

Player-entered values are keyed `"col,row"` (zero-based, column first), with `1` = square and `2` = marked; absent or `0` = unset. The persisted answer is the `{states: [...]}` grid (row-major, `states[row][col]`). In the canon, `cells[row][col]` is row-major and trail cells are `[row, col]` pairs.
