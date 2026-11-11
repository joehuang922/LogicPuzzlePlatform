# Hashi (橋をかけろ)

**Puzzle Type ID:** 34

## Question structure description

Islands sit on the points of an implicit rectangular lattice. Each island is a circle holding a number from 1 to 8. The print has no grid lines and no border, only the circled numbers. Most lattice points are empty.

### Canonical JSON structure

Puzzle 1 (`hashi-board-small.jpg`, 9x9):

```json
{
  "cells": [
    [3, 0, 0, 3, 0, 4, 0, 2, 0],
    [0, 4, 0, 0, 2, 0, 4, 0, 3],
    [2, 0, 1, 0, 0, 2, 0, 0, 0],
    [0, 5, 0, 5, 0, 0, 7, 0, 3],
    [0, 0, 2, 0, 0, 0, 0, 1, 0],
    [0, 1, 0, 3, 0, 4, 0, 0, 2],
    [3, 0, 8, 0, 3, 0, 2, 0, 0],
    [0, 0, 0, 0, 0, 3, 0, 2, 0],
    [1, 0, 3, 0, 3, 0, 4, 0, 3]
  ]
}
```

Puzzle 2 (`hashi-board-small-2.jpg`, 9x9). Row 7 and column 7 are empty: the centres jump two pitches there (about 213 px a pitch at full size):

```json
{
  "cells": [
    [0, 2, 0, 3, 0, 2, 0, 0, 1],
    [3, 0, 4, 0, 2, 0, 1, 0, 0],
    [0, 1, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 2, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 2, 0, 2],
    [0, 2, 0, 4, 0, 2, 0, 0, 0],
    [2, 0, 0, 0, 0, 0, 2, 0, 2],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 0, 4, 0, 0, 3, 0, 2]
  ]
}
```

- `cells`: `rows x cols` integers. `0` = no island, `1`–`8` = an island with that number.
- The lattice spans the outermost islands: row 0, the last row, column 0 and the last column each hold at least one island.

### Sample images

- [hashi-board-small.jpg](hashi-board-small.jpg): puzzle 1, 9x9, with the top of puzzle 2 below it. A thumb covers the title.
- [hashi-board-small-2.jpg](hashi-board-small-2.jpg): puzzle 2, 9x9, with the bottom of puzzle 1 above and the top of puzzle 3 below. The rule sidebar on the right shows a few circled numbers too.
- [hashi-board-medium.jpg](hashi-board-medium.jpg): puzzle 3, 15 rows x 25 columns, with the bottom row of puzzle 2 above it and the rule example (smaller circles, with its answer) in the top right.

## Answer structure description

The bridges, stored per unit segment between neighbouring lattice points, like Masyu's edges but with a count. A bridge from one island to another covers every unit segment between them.

### Canonical JSON structure

```json
{
  "bridges": {
    "h": [[0, 2, 2, 0, ...], ...],
    "v": [[1, 0, 0, 0, ...], ...]
  }
}
```

- `bridges.h`: `rows x (cols-1)`. `bridges.h[r][c]` = number of bridges (0, 1 or 2) on the segment between (r, c) and (r, c+1).
- `bridges.v`: `(rows-1) x cols`. `bridges.v[r][c]` = number of bridges (0, 1 or 2) on the segment between (r, c) and (r+1, c).

Every segment of one bridge holds the same count, and a run of non-zero segments always starts and ends at an island.

## Rules

1. Draw bridges between islands. A bridge is a straight horizontal or vertical line joining two islands, with no island between them.
2. Two islands are joined by at most two bridges.
3. Bridges may not cross each other or pass over an island.
4. The number of bridges at each island equals its number.
5. All islands are connected into one group by bridges.

### Success finishing criteria

- Every island's bridge count (sum over its four sides) equals its number.
- No lattice point that isn't an island has both a horizontal and a vertical bridge through it (no crossing).
- The islands, joined by bridges, form one connected group.

## Puzzle Player

### Interactions

- **Drag to place:** press on an island and drag horizontally or vertically. When the pointer reaches the nearest island in that direction, the bridge between the two cycles 0 → 1 → 2 → 0, and the drag ends. Dragging back towards the start island doesn't cycle again.
- Starting a drag off an island, or dragging diagonally, does nothing. Tapping does nothing.
- A drag that would add a bridge crossing an existing bridge does nothing. Going from 2 back to 0 is always allowed.
- Undo/Redo like the other boards.
- Appearance:
  - White background, no grid lines and no lattice dots, like the print.
  - Islands are white circles with a dark outline and the number in black, drawn over the bridges.
  - One bridge is a dark line between the two circle edges. Two bridges are two parallel lines.
  - An island turns grey once its bridge count equals its number.
  - With **Errors** on, an island with more bridges than its number is drawn red.

### Progress calculation

`(islands whose bridge count equals their number / all islands) * 100`. A board with no islands reads 0.

## Puzzle Editor

### Interactions

- Click a lattice point to cycle it: empty → 1 → 2 → … → 8 → empty. Right-click cycles backwards.
- Rows/Cols inputs resize the lattice, keeping islands that still fit.
- The editor draws faint dots at empty points so you can see where to click (the player doesn't).
- The JSON textarea is the source of truth, synced both ways.
- Overridable misread warnings:
  - no islands;
  - an odd sum of numbers (every bridge counts twice);
  - an island whose number is more than twice its count of neighbouring islands.

## Puzzle Parser

Implemented in `parsers/src/puzzle_parsers/hashi/`. The print has no grid lines or border, so `rectify_board` / `find_grid_lines` don't apply. Kuralin and Tentai Show find the grid from its lines and then probe lattice points for circles. Hashi flips the order: find the circles, then fit the lattice to them.

1. **Rings.** The page is binarized (adaptive threshold, at most 1600 px on the long side, never upscaled). A ring is an outer contour that is round, fills its enclosing circle and holds a large hole.
2. **Picking the board.** Every sample has other circles in frame:
   - parts of the neighbouring puzzles above and below;
   - the rule sidebar's circled numbers;
   - the rule example and its answer (medium sample).

   Rings of the same radius (within 25%) chain into one group when they are within 4.6 radii (about 2.3 pitches). Puzzles on one page sit about three pitches apart, and the sidebar and example circles are smaller, so they form other groups. The largest group is the board.
3. **Lattice.**
   - The page's lean comes from the median angle of near-horizontal ring pairs.
   - The horizontal and vertical pitch come from a comb fit over the offsets between nearby rings. They can differ: the small sample's photo is 5% taller than wide.
   - Integer coordinates spread out from one ring by rounding each **local** offset to the pitch. A leaning photo whose centres drift a quarter pitch across the board still rounds correctly.
   - Most boards have an island in every row and column. Puzzle 2's row 7 and column 7 are empty, and come out as a two-pitch step. The board's extent is the outermost islands.
4. **Recovery.** Every empty lattice point inside the board is probed for a ring, at a position interpolated by an affine fit of its six nearest islands. The contour pass misses:
   - puzzle 2's R9C4 (the digit touches the ring);
   - two rings on the medium sample's curled left edge, whose thin stroke breaks into an open arc.

   A share-of-perimeter test (`ring_probe.probe_ring`, as in Kuralin) can't separate these: an empty point between two islands a pitch apart crosses both rings, inking about half its perimeter. Real misses scored 0.67–0.73, empty points up to 0.56. Instead the probe asks for two things:
   - ink in at least 6 of 8 sectors of the circle (empty points reach at most 5);
   - a digit at the centre: ink share of 0.1 or more, where islands measure 0.2 or more and empty points 0.0.

   Points beyond the board aren't probed. There the thumb, the title and the puzzle number badge pass both tests, and every outer row and column already has a contour-found island.
5. **Numbers.** Each island's digit is cropped with `crop_cell` as a square of half-side 0.6 × the ring radius, inside the ring. It is read by `cell_ocr.read_cells` on EasyOCR with `allow_multi_digits=False` and `max_value=8`: clues are single digits by rule, so `hashi` joins the single-digit packages in the OCR contract test. The type id is in `_OCR_TYPES`.
6. **Validate.** `cells` is rectangular with values 0–8, at least 2x2, and its outer rows and columns each hold an island.

**Accuracy bar:** the lattice size and every island's position must be right, and numbers should be right on the samples. The editor's click-to-cycle fixes misreads.

Measured against the hand-checked canons (`hashi-board-{small,small-2,medium}.canon.json`): all three parse exactly with live EasyOCR at full size, 2000, 1080 and 800 px. That is 32, 25 and 102 islands. `tests/test_hashi_parser.py` pins positions and sizes at those sizes, with the reads stubbed.

# Misc

## Coordinate convention

Canon `cells[row][col]` is row-major, with (0, 0) the top-left lattice point. Player-entered bridges are keyed per unit segment like Masyu: `"h:row,col"` for the segment between (row, col) and (row, col+1), and `"v:row,col"` for the segment between (row, col) and (row+1, col). The value is the bridge count `1` or `2`. Segments with no bridge are absent. The persisted answer is `{bridges: {h, v}}` as above.
