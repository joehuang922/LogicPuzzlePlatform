# Omino Tree (オミノツリー)

**Puzzle Type ID:** 38

Incubating: yes. A provisional (仮題) reader-invented type, the successor of Sinkamino, with four puzzles from one issue. Not a picture puzzle.

## Question structure description

A `rows × cols` grid inside a thick outer border. Every interior grid line is dashed; there are no printed rooms. Some cells hold a number. Gray (halftone) arrows sit on some interior edges, each straddling the edge between two orthogonally adjacent cells and pointing from one of them (the start) into the other (the end). A number and an arrow can overlap in a cell, and one cell can touch several arrows.

### Canonical JSON structure

The worked example from the rules page (`rules.jpg`, 例題):

```json
{
  "rows": 4,
  "cols": 4,
  "numbers": [
    [1, 0, 0, 0],
    [0, 2, 0, 0],
    [0, 0, 2, 0],
    [0, 0, 0, 3]
  ],
  "arrows": [
    { "r": 0, "c": 0, "dir": "right" },
    { "r": 1, "c": 1, "dir": "left" },
    { "r": 2, "c": 2, "dir": "right" },
    { "r": 2, "c": 3, "dir": "up" },
    { "r": 3, "c": 1, "dir": "up" }
  ]
}
```

- `rows`, `cols`: grid size, each ≥ 2.
- `numbers`: `rows × cols`; `0` = no number, `n > 0` = a number (the size of its block). Not limited to one digit.
- `arrows`: each arrow's start cell `(r, c)` and the direction (`up`, `down`, `left`, `right`, as in Yajilin) to its end cell, which must be inside the grid. At most one arrow per edge. Sorted by `r`, then `c`, then `dir`.

### Sample images

- [rules.jpg](rules.jpg): the rules and a 4×4 worked example (例題) with its answer (答え).
- [board-omino-tree-1.jpg](board-omino-tree-1.jpg): puzzle ①, 5×5 (the bottom of the example and the top of ② are also visible).
- [board-omino-tree-2.jpg](board-omino-tree-2.jpg): puzzle ②, 6×6 (bottom of ① and top of ③ visible).
- [board-omino-tree-3.jpg](board-omino-tree-3.jpg): puzzle ③, 6×6 (bottom of ② visible).
- [board-omino-tree-4.jpg](board-omino-tree-4.jpg): puzzle ④, 8×8.

Each sample has a hand-checked `.canon.json` and its unique `.solution.json` beside it.

## Answer structure description

The walls the player drew, as in Double Choco.

### Canonical JSON structure

The example's answer:

```json
{
  "grids": {
    "h": [[1, 0, 0, 0], [0, 1, 1, 1], [0, 1, 1, 0]],
    "v": [[1, 1, 0], [1, 1, 0], [1, 0, 1], [1, 1, 0]]
  }
}
```

- `grids.h`: `(rows − 1) × cols`; `1` = a wall between `(r, c)` and `(r + 1, c)`.
- `grids.v`: `rows × (cols − 1)`; `1` = a wall between `(r, c)` and `(r, c + 1)`.

## Rules

1. Draw walls along the dashed lines to divide the board into blocks.
2. A number is the size (cell count) of its block. A block may hold any number of numbers (all must then be equal), or none.
3. The two cells joined by an arrow are in different blocks. The block on the end side is the block on the start side, in the same orientation (no rotation, no reflection; translation is allowed), plus one cell.
4. Every block contains at least one arrow start or arrow end.

Arrows therefore join blocks into trees (hence the name): along an arrow a block grows by one cell, keeping its shape.

Formally, for start block `S` and end block `E`: `|E| = |S| + 1` and there is a cell `x ∈ E` and a translation `t` with `S + t = E \ {x}`.

### Success finishing criteria

The blocks are the connected components of cells joined across edges without a wall. The board is solved when every block satisfies rules 2-4 and every wall separates two different blocks (no dangling walls inside a block).

## Puzzle Player

### Interactions

- Click an interior edge to toggle a wall (dashed ↔ thick solid), exactly as in Double Choco. No drag.
- Numbers and arrows are read-only.
- Live validation ("Errors: On"):
  - A number is outlined red when its block is smaller than the number (more walls only shrink blocks, so this can't fix itself).
  - An arrow is drawn red when its two cells are in different blocks, both blocks are *complete* (each holds at least one number, every number equals the block's size), and the end block isn't the start block plus one cell.
  - Nothing is flagged on the undivided board.

### Appearance

- As printed: thick black outer border, dashed thin gray interior lines, black numbers. Arrows are gray (`#9a9a9a`) block arrows centred on their edge, about 0.55 cell long, drawn under the numbers. Walls are thick black lines over the dashed ones.

### Progress calculation

`(cells in valid blocks / all cells) * 100`. A block is valid when every number in it equals its size, it holds at least one arrow start or end, and every arrow touching it crosses into another block with the start + 1 cell relation holding. The undivided board scores 0 unless it is a single valid block. Shared logic: `player/frontend/src/components/ominoTreeRules.ts` (web), `OminoTreeEngine` (Android).

## Puzzle Editor

### Interactions

- Click a cell to set its number (a prompt; empty or 0 clears it).
- Click near an interior edge's midpoint to cycle its arrow: none → pointing right/down → pointing left/up → none.
- Rows / Cols inputs resize the grid, keeping numbers and arrows that still fit.
- The modal's JSON textarea is the source of truth.
- Format problems, listed above the board and blocking save (the API's `semanticChecks` rejects the same): `numbers` not `rows × cols`, an arrow whose end is outside the grid, two arrows on one edge.
- Overridable warning: no arrows.

### Appearance

- Same as the player view without walls.

## Puzzle Parser

`parsers/src/puzzle_parsers/omino_tree/` (design notes in `grid_detector.py`).

- **Grid:** thick outer border, dashed interior lines: the shared `rectify_board` (flattened) and `find_grid_lines`. Each photo also shows part of a neighbouring puzzle cut off by the page edge; the border finder takes the complete board.
- **Arrows:** no Gemini. The halftone dots are as dark as the digits pixel by pixel, so a blur of ~1/12 cell turns each arrow into an even mid gray (0.25-0.8 of the paper) while digit strokes stay darker; an opening of ~1/10 cell clears thin gray (dashes, digit rims). Each remaining blob snaps to the nearest interior edge midpoint (within 0.3 cell). The tail end is a flat shaft and the tip a point, so the far end with the narrower cross-section is the end cell. Measured over 48 arrows at three sizes: blobs 0.17-0.22 cell² against noise ≤ 0.008; tail/tip width ratio ≥ 1.38.
- **Numbers:** `cell_ocr.read_grid_clues(..., allow_multi_digits=True)` (block sizes can pass 9) on a copy of the board with the arrow blobs whitened (pixels that aren't digit-dark), since arrows overlap digits (puzzle ④'s `4` over a down arrow). Type id in `_OCR_TYPES`.
- **Accuracy:** all four samples parse exactly (size, every number and arrow) at full size, 2000 and 1200 px with live EasyOCR. Answer keys: `board-omino-tree-{1..4}.canon.json`, plus the rules page's example (`rules-example.canon.json`). Each has a unique solution (`*.solution.json`, exhaustive search; for the 8×8, blocks capped at 10 cells); the example's matches the printed answer.

## Android port

- **Player:** `OminoTreeEngine` ports extraction, progress and the completion check (same `h:` / `v:` keys); `OminoTreeBoard` on `ZoomableBoard`: a tap snaps to the nearest interior grid line and toggles the wall there (as in Double Choco / Tentaishow); live validation as on web. Not a picture puzzle: no preview or solved thumbnail.
- **Admin review** (`OminoTreeAuthoring`, `OminoTreeEditor`): two mode chips. *Numbers*: tap a cell to set its number with the number entry used by the clue-grid editors. *Arrows*: a tap snaps to the nearest interior edge and cycles its arrow none → right/down → left/up → none. Add / remove a row or column at the bottom / right. Problems list = the web editor's format problems plus the "no arrows" warning. `OminoTreeMiniBoard` is the batch tile (framed red with problems).

# Misc

## Coordinate convention

- Cells are `(row, col)`, row 0 at the top.
- Player values: `"h:r,c"` = wall between `(r, c)` and `(r + 1, c)`; `"v:r,c"` = wall between `(r, c)` and `(r, c + 1)`; value `1` = wall, absent = none. The answer is the `{grids: {h, v}}` arrays.
- An arrow is stored by its start cell and direction; its edge is `h:r,c` for `down`, `h:r−1,c` for `up`, `v:r,c` for `right`, `v:r,c−1` for `left`.
