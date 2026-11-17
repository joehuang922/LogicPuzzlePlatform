# Whimsical Knight (気まぐれナイト)

**Puzzle Type ID:** 37

## Question structure description

A lattice of `rows × cols` dots with no grid lines. Some of the `(rows − 1) × (cols − 1)` cells between the dots are filled with a **gray square**. White clues sit on the lattice:

- **White circles**, either on a dot or on the midpoint between two orthogonally neighbouring dots.
- **White squares**, always on a dot.

Positions use doubled coordinates: dot `(r, c)` is `(dr, dc) = (2r, 2c)`; the midpoint between dots `(r, c)` and `(r, c + 1)` is `(2r, 2c + 1)`, between `(r, c)` and `(r + 1, c)` is `(2r + 1, 2c)`. Cell centres (odd, odd) never hold a clue.

### Canonical JSON structure

The worked example from the rules page (`rules.jpg`, 例題):

```json
{
  "rows": 5,
  "cols": 5,
  "gray": [
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 0],
    [1, 1, 1, 0]
  ],
  "circles": [
    { "dr": 1, "dc": 4 },
    { "dr": 3, "dc": 6 },
    { "dr": 6, "dc": 1 },
    { "dr": 6, "dc": 8 },
    { "dr": 7, "dc": 2 },
    { "dr": 8, "dc": 4 }
  ],
  "squares": [
    { "dr": 0, "dc": 0 },
    { "dr": 8, "dc": 6 }
  ]
}
```

- `rows`, `cols`: dot counts, each ≥ 2.
- `gray`: `(rows − 1) × (cols − 1)` grid; `1` = the cell holds a gray square.
- `circles`: doubled positions on a dot (even, even) or an edge midpoint (one odd), inside `0 ≤ dr ≤ 2(rows − 1)`, `0 ≤ dc ≤ 2(cols − 1)`.
- `squares`: doubled positions on a dot (even, even).
- No two clues share a position.

(The example is transcribed from the photo; the parser phase checks it against the printed answer.)

### Sample images

- [rules.jpg](rules.jpg): rules, the knight-move diagram, and a 5×5 worked example with its answer.
- [board-whimsical-knight.jpg](board-whimsical-knight.jpg): puzzle ①, 5×5 dots (the top of ② is also visible).
- [board-whimsical-knight-2.jpg](board-whimsical-knight-2.jpg): puzzle ②, 6×6 dots (the bottom of ① and the top of ③ are also visible).
- [board-whimsical-knight-3.jpg](board-whimsical-knight-3.jpg): puzzle ③, 7×7 dots (the bottom of ② is also visible).

## Answer structure description

The answer is the set of segments the player drew.

### Canonical JSON structure

```json
{
  "segments": [
    [[0, 0], [0, 1]],
    [[0, 1], [2, 2]]
  ]
}
```

- `segments`: each is a pair of dots `[r, c]`, the smaller one first (row, then column), sorted. A segment joins orthogonal neighbours (`|Δr| + |Δc| = 1`) or a knight's move apart (`{|Δr|, |Δc|} = {1, 2}`).

## Rules

1. Draw segments between dots to form a single closed loop.
2. A segment runs one step up, down, left or right, or a knight's move (1 × 2).
3. The loop passes through the centre of every white circle and white square. It goes straight through a circle and turns at a right angle at a square.
4. A knight segment may not pass over a gray square: neither cell of its 1 × 2 rectangle may be gray. Orthogonal segments run along cell edges and are never blocked.
5. Segments may not cross or branch.

Details:

- The loop need not visit every dot.
- A circle on a dot: that dot is on the loop and its two segments point in opposite directions.
- A circle on a midpoint: a segment passes straight through it: the orthogonal step between its two dots, or a knight segment whose midpoint it is (e.g. `(0,0)–(1,2)` passes `(dr, dc) = (1, 2)`).
- A square: that dot is on the loop and its two segments are perpendicular, including two knight segments such as directions `(1, 2)` and `(2, −1)`.
- Crossing: two segments that meet anywhere except a shared end dot (e.g. a knight segment and the step it straddles, or two knight segments crossing).

### Success finishing criteria

Every dot has 0 or 2 segments; the segments form one connected loop; no two segments cross; no knight segment covers a gray cell; every circle and square is satisfied as above.

## Puzzle Player

### Interactions

- Drag from dot to dot to draw. The pointer joins a dot when it comes within about 0.3 of the dot spacing, so a knight-move drag passes between the in-between dots without catching them. Each step to an orthogonal neighbour or a knight's-move dot toggles that segment; the first segment of a drag decides whether the drag draws or erases (as in Masyu).
- Tap a segment to erase it.
- Live validation ("Errors: On"): segments that cross or a knight segment over a gray cell are drawn red; a circle or square whose dot or midpoint is decided wrong (e.g. a turn at a circle, a dot with 3 segments) is outlined red.

### Appearance

- As printed: black dots, gray squares with a hatched fill inset in their cells, white circles and squares with black outlines over their points, loop segments as dark lines from dot centre to dot centre, drawn under the circles and squares. No grid lines.

### Progress calculation

`(satisfied white circles and squares / all white circles and squares) * 100`, where "satisfied" means the condition in Rules holds for the current segments.

## Puzzle Editor

### Interactions

- Click a cell to toggle its gray square.
- Click near a dot or midpoint to cycle its clue: dot none → circle → square → none; midpoint none → circle → none.
- Rows / Cols inputs resize the lattice, keeping clues and gray cells that still fit.
- The modal's JSON textarea is the source of truth.
- Format problems (a square off a dot, a clue outside the lattice, two clues at one point) are listed and block saving; the API rejects the same ones.

### Appearance

- Same as the player view without segments.

## Puzzle Parser

`parsers/src/puzzle_parsers/whimsical_knight/` (design notes in `grid_detector.py`). No OCR.

- **No border or grid lines.** The board is a lattice of dots, and each photo also shows part of a neighbouring puzzle, the page's dotted rule and (in the first photo) the knight-move diagram, so `rectify_board` doesn't apply. Dots are small, round, solid blobs. Each links to its nearest dot to the right and below; links far off their group's median length drop out (the gap between two puzzles is ~1.5 pitch); integer coordinates spread along the links, and the largest group with both rows and columns is the board. Rows or columns with under half the dots of the fullest are strays (the "?" of the difficulty face sits ~1.2 pitch left of puzzle ①).
- **Warp.** A homography from lattice indices to the found dots straightens the board to a 100 px pitch, then a 5 px blur turns the hatching into an even tone.
- **Gray squares:** a cell's inner box averages below 0.8 of the paper (gray 0.42-0.64, one lightly printed; empty ≥ 0.98).
- **Circles and squares:** an enclosed white region (a hole in the ink) about a clue's size, centred on a dot or midpoint. Its fill of its bounding box tells a square (≥ 0.9, dots only) from a circle. The gap between two gray squares, closed off by clues at both ends, is a long thin hole and fails the aspect test.
- **Accuracy:** all three samples parse exactly (size, every gray cell and clue) from full size down to 800 px on the long side, with or without JPEG q70. Answer keys: `board-whimsical-knight{,-2,-3}.canon.json`; each has a unique solution under the rules (CP-SAT), as does the rules page's example (`rules-example.canon.json` / `.solution.json`), which matches the printed answer.
- **Metric:** clues-off (missing, ghost or wrong-kind circles and squares) plus gray-off.

## Android port

- `WhimsicalKnightEngine` ports extraction, progress and the completion check (same `s:` keys). `WhimsicalKnightBoard` draws one dot per `ZoomableBoard` cell centre and takes drag-to-draw (dot to dot, orthogonal or knight) through `ZoomableBoard`'s fractional drag callbacks (`onDrawStartPrecise` / `onDrawToPrecise`), tap-to-erase, and live validation. Not a picture puzzle, so no preview or solved thumbnail.

# Misc

## Coordinate convention

- Dots are `[row, col]`, row 0 at the top. Cells `gray[r][c]` sit between dots `(r, c)` and `(r + 1, c + 1)`.
- Clue positions use doubled coordinates as above.
- Player values are keyed `"s:r1,c1,r2,c2"` with the smaller dot first, value `1` = segment drawn; absent = none. The answer is the sorted `segments` list.
