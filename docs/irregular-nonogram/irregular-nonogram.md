# Irregular Nonogram (変形ロジック)

**Puzzle Type ID:** 45

A nonogram whose board is not a rectangle. The rules are Nonogram's, but the board is an
arbitrary shape of cells, a row or column can be broken into several separate pieces
(**segments**), and each segment's clue sits at whichever end of it has room on the page
(left or right for a row piece, above or below for a column piece). The puzzle's
instructions say exactly that: 「解き方は普通のロジックと同じですが、対応する数字の位置に注意して
くださいね」. The filled cells draw a picture (both samples: a musical instrument, a
sport), so this is a picture puzzle. Not incubating.

## Question structure description

- **Lattice and board.** All cells, board and clue cells alike, sit on one square
  lattice. The board is the set of cells inside the thick outer outline, given as a mask
  over its bounding box (`height` × `width`). Thick lines also run every 5 lattice cells,
  as in Nonogram (they're drawing aids, aligned to the lattice, not to the board's edge).
- **Segments.** A segment is a maximal run of board cells along one row or one column,
  bounded by non-board cells or the bounding box. A row or column of the lattice can hold
  any number of segments (sample 1's notch splits rows into a left piece with clues on the
  left and a right piece with clues on the right).
- **Clues.** Every board cell belongs to at most one row clue and at most one column
  clue: a segment has at most one clue (never one at each end). The printed puzzles give
  every segment one, but a segment without a clue is allowed (it constrains nothing). A
  clue is a list of positive run lengths, in the usual
  reading order (left to right for a row piece, top to bottom for a column piece),
  printed in a block of dotted clue cells on the same line just outside one end of the
  segment: `side: "start"` (left / above) or `"end"` (right / below). A row clue on the
  left is right-aligned against the board; on the right, left-aligned against it; a
  column clue likewise above or below. The printed layout never overlaps two clue blocks,
  or a clue block and the board.

### Canonical JSON structure

```json
{
  "width": 4,
  "height": 3,
  "cells": [
    [1, 1, 0, 0],
    [1, 1, 1, 1],
    [1, 1, 1, 1]
  ],
  "rowClues": [
    { "row": 0, "start": 0, "side": "start", "clues": [1] },
    { "row": 1, "start": 0, "side": "end", "clues": [1] },
    { "row": 2, "start": 0, "side": "start", "clues": [4] }
  ],
  "colClues": [
    { "col": 0, "start": 0, "side": "start", "clues": [1] },
    { "col": 1, "start": 0, "side": "start", "clues": [1, 1] },
    { "col": 2, "start": 1, "side": "start", "clues": [1] },
    { "col": 3, "start": 1, "side": "start", "clues": [2] }
  ]
}
```

- `width`, `height`: the board's bounding box (clue blocks lie outside it, or inside
  its notches).
- `cells`: `height` × `width`; `1` = board cell, `0` = not part of the board.
- `rowClues`: one entry per row segment: `row`, `start` (the column of the segment's
  first cell, which identifies the segment), `side` (`"start"` = clue to the left,
  `"end"` = to the right) and `clues` (run lengths, left to right, each ≥ 1).
- `colClues`: the same per column segment: `col`, `start` (the row of its first cell),
  `side` (`"start"` = above, `"end"` = below), `clues` (top to bottom).
- **Format rules** (the editor and the API's `semanticChecks` both enforce them):
  every entry names a segment and no segment has two entries; a clue fits
  its segment (sum + gaps ≤ length); and no two clue blocks, or a clue block and a board
  cell, share a lattice cell (the board couldn't be drawn).

### Sample images

- [board-irregular-nonogram-1.jpg](board-irregular-nonogram-1.jpg) — Q79 「音楽に合わせて」, a scan (a
  thumb covers part of the page text, not the puzzle). Answer: one of cymbal / drum /
  trombone.
- [board-irregular-nonogram-1-photo.jpg](board-irregular-nonogram-1-photo.jpg) — the same page as a
  hand-held phone photo (curved page, slight perspective).
- [board-irregular-nonogram-2.jpg](board-irregular-nonogram-2.jpg) — Q80 「ジャ〜ンプ！」, a scan of a
  page printed sideways: the page's text runs vertically but the puzzle's digits are
  upright as photographed. Clue blocks sit inside the figure too (a column clue block
  below a board piece, in the middle of the shape).

## Answer structure description

Each board cell's state, crosses included so that a saved game reloads with its marks
(the format Nonogram's Android engine saves).

### Canonical JSON structure

```json
{
  "cells": [
    [2, 1, 0, 0],
    [0, 0, 0, 1],
    [1, 1, 1, 1]
  ]
}
```

- `cells`: `height` × `width`; `0` = unset, `1` = filled, `2` = crossed (a solving aid).
  Non-board cells are always `0`. Only filled cells count for the rules: the example is
  the question example's solution with one cross.

## Rules

- Fill some board cells. Every segment's filled cells form exactly the runs its clue
  lists, in order, with at least one empty cell between consecutive runs.
- Each segment is checked on its own: runs never continue across a gap in the board.

### Success finishing criteria

Every row segment and every column segment matches its clue.

## Puzzle Player

### Interactions

Nonogram's, unchanged:

- Cell states: unset, filled (black), crossed (X).
- Mode buttons below the board: black (default) and cross. Drag (or click) paints the
  mode's state; dragging over a cell already in that state resets it to unset.
  Right-drag crosses in black mode.
- Only board cells take input.
- A clue block dims once its segment matches it.
- **Errors: On** (`liveValidate`): a clue block is outlined red when its segment's filled
  and crossed cells can no longer fit the clue (the line solver finds no arrangement).
- On Android: the same fill / cross modes and drag painting, two fingers pan/zoom.
- No Hint button and no on-track check for now (Nonogram's hint ladder isn't ported).

### Appearance

- Board cells white with thin grey lines, thick lines every 5 lattice cells, the board's
  outline thick. Filled cells black, crossed cells a small grey X.
- Clue blocks are drawn where the canon puts them, on the same lattice: a light grey
  ground, numbers centred in their cells, two-digit numbers in a smaller font.
- **Preview panel** (not readonly): the filled cells, black on `#d9d9d9`, cells 3–8 px,
  ~160 px max, like Nonogram's. Non-board cells are left as the grey ground.
- **Solved thumbnail (Android):** the filled cells black, the rest of the board white,
  outside the board the thumbnail's ground.

### Progress calculation

As Nonogram: `(board cells filled or crossed / board cells) × 100`.

## Puzzle Editor

### Interactions

- **Shape mode:** click or drag across lattice cells to toggle them in or out of the
  board. The bounding box grows and shrinks to fit (Add/remove row/column buttons at
  each edge as well, for room to draw). Editing the shape never refuses a layout:
  segments that lose or gain clues show up in the problems list.
- **Clues mode:** click a board cell to select its row segment and its column segment.
  Two text fields take the row clue and the column clue (`2 5 1`, space separated), each
  with a side toggle (Left/Right, Top/Bottom). The selected segments are highlighted.
- Misread warning (overridable): a segment without a clue (allowed, but in a parsed
  board usually a missed clue block).
- Format problems (block saving, as the API): two clues for one segment, a clue too long
  for its segment, overlapping clue blocks or a clue block over the board. Each is
  marked on the board.
- Misread warning (overridable): the line solver finds no solution, or more than one.
- The modal's JSON textarea is the source of truth; the editor emits on every edit.

### Appearance

Same as the player board, no fills; in Shape mode the lattice around the board is shown
faintly so cells can be added.

## Solver

`player/solver/src/plugins/irregular-nonogram/`: Nonogram's line solver run over
segments instead of full rows/columns, with the same propagation + search, registered
for type 45. The API's registration gate then rejects puzzles without a unique
solution, like Nonogram's, and stores the solution. Hints and the on-track check are
left for later.

## Puzzle Parser

`parsers/src/puzzle_parsers/irregular_nonogram/` (design notes in `grid_detector.py`).
Clue digits are read with the shared EasyOCR path (`cell_ocr.read_cells`,
`allow_multi_digits=True`; two-digit clues are squeezed into one cell). Type 45 is in
`_OCR_TYPES`.

- **Board:** as Picturesque Maze, the figure is located as the largest block of ink and
  a frame around it goes to `rectify_board` (`lattice_fit.figure_frame_image`). The
  board is processed at the shared normalised cell size.
- **Lattice:** fitted by `lattice_fit` (pitch from the line period, lines by dynamic
  programming), then bent with the page by a smooth 2D polynomial of measured offsets.
- **Board cells:** rooms enclosed by thick lines (`classify_border_thickness`), empty,
  lined on every edge, solidly (clue padding is dotted). Both samples' boards are whole
  5x5 blocks (41 and 39).
- **Clues:** each piece's clue block is the run of inked cells beyond one end; a clue
  cell belongs to one block. Crops are cell-sized squares following the digits, read at
  source resolution.
- **Check:** both scans parse to their canons at full size and at 2000 px, every piece
  has its clue, and each canon has exactly one solution: a drum kit (Q79, answer ②
  ドラム) and a hurdler (Q80, ② ハードル走).
- **Not yet:** a hand-held photo of a curled page (`board-irregular-nonogram-1-photo.jpg`)
  parses wrongly: the lattice fit can't follow the curl. Scans and flat photos work; a
  curved one needs re-shooting flatter, or fixing in the editor.

# Misc

## Coordinate convention

- Cells are `(row, col)` within the board's bounding box, row 0 at the top.
- A row segment is named by `(row, start)`, a column segment by `(col, start)`.
- A clue block for a row segment with `side: "start"` occupies columns
  `start - k .. start - 1` of that row, `k` = number of clues; with `"end"`, the `k`
  columns after the segment's last cell. Column blocks likewise, above or below. These
  may be negative or beyond the bounding box: the drawing extends to fit.
- Player values are Nonogram's: `"col,row"` → `1` (filled) or `2` (crossed).

## Android port

- **Player:** `IrregularNonogramEngine` (same keys, progress and completion check as the
  web) and `IrregularNonogramBoard` on `ZoomableBoard`, sized to the drawing's lattice
  (board + clue blocks): fill / cross mode chips, drag painting, the dimmed / red clue
  blocks, `PicturePreview` above. `renderThumbnail` returns the solved picture.
- **Admin review** (`IrregularNonogramAuthoring`, `IrregularNonogramEditor`): Shape mode
  (tap a lattice cell to toggle it in or out of the board), Clues mode (tap a board
  cell, edit its row and column clues in text fields, flip their sides), add/remove a
  row or column at each edge, the problems list (format problems block creating, as on
  the web). Uniqueness isn't checked on the phone: the API's solver gate checks it on
  create, as for Nonogram uploads from Android.
