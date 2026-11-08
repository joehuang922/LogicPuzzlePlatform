# Unequal Sudoku

**Puzzle Type ID:** 29

Japanese name: 不等号ナンプレ.

## Question structure description

A 9x9 sudoku grid with 3x3 boxes. Some cells hold a given digit (1-9). Between
orthogonally adjacent cells sits an inequality sign (`<`, `>`, `∧`, `∨`) saying which
of the two cells holds the smaller digit; the sign's point faces the smaller cell. In
print every adjacent pair carries a sign, but the format allows a pair with none.

In print the cells are separate boxed squares with gaps between them, and the signs sit
in those gaps. The 3x3 boxes are not drawn with thick lines; they show only as faint
shading of the gap background.

### Canonical JSON structure

Sample board 1 (Question 60):

```json
{
  "hints": [
    [0,0,6,0,0,0,0,3,0],
    [0,0,0,9,0,0,0,0,7],
    [3,0,0,0,0,0,0,0,0],
    [0,3,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,4,0],
    [0,0,0,0,0,0,0,0,6],
    [7,0,0,0,0,6,0,0,0],
    [0,8,0,0,0,0,1,0,0]
  ],
  "right": [
    [1,1,1,1,2,1,2,2],
    [2,1,1,2,2,1,1,1],
    [1,1,2,2,2,1,2,1],
    [2,1,1,2,2,1,2,2],
    [1,1,2,2,1,2,1,2],
    [1,1,2,1,1,2,1,1],
    [1,2,1,2,1,2,1,2],
    [2,2,1,1,2,2,1,1],
    [1,2,2,1,2,2,1,2]
  ],
  "down": [
    [1,2,2,1,2,1,2,1,1],
    [2,1,1,2,1,2,1,2,2],
    [1,2,2,1,1,1,2,1,2],
    [2,2,1,2,2,1,2,1,1],
    [1,1,1,2,2,2,2,2,1],
    [2,1,2,1,2,1,1,1,2],
    [1,2,2,2,1,2,2,2,1],
    [2,1,1,2,2,2,2,1,2]
  ]
}
```

- `hints`: 9x9 (`hints[row][col]`). `0` = empty, `1-9` = given digit.
- `right`: 9 rows x 8 (`right[row][col]`) — the sign between cell `(row, col)` and
  its right neighbour `(row, col+1)`. `0` = no sign, `1` = `<` (left cell smaller),
  `2` = `>` (left cell larger).
- `down`: 8 rows x 9 (`down[row][col]`) — the sign between cell `(row, col)` and the
  cell below it `(row+1, col)`. `0` = no sign, `1` = `∧` (upper cell smaller),
  `2` = `∨` (upper cell larger).

In both arrays `1` means "this cell is smaller than the next one" and `2` means "this
cell is larger". This sample has exactly one solution (checked by brute force).

### Sample images

- [unequal-sudoku-board-1.jpg](unequal-sudoku-board-1.jpg) — Question 60 (photo; parts of
  neighbouring boards and an answer strip show along the edges)
- [unequal-sudoku-board-2.jpg](unequal-sudoku-board-2.jpg) — Question 61 (photo; the
  rules box at the top holds a small 3x9 example grid of the same style)

## Answer structure description

The fully filled grid: givens plus the player's digits.

### Canonical JSON structure

```json
{
  "hints": [
    [4,5,6,7,8,1,9,3,2],
    [8,1,2,9,4,3,5,6,7],
    [3,7,9,6,5,2,8,1,4],
    [9,3,4,8,6,5,7,2,1],
    [1,2,7,4,3,9,6,8,5],
    [5,6,8,1,2,7,3,4,9],
    [2,9,3,5,1,8,4,7,6],
    [7,4,1,3,9,6,2,5,8],
    [6,8,5,2,7,4,1,9,3]
  ]
}
```

- `hints`: 9x9 with every cell 1-9 (same shape as sudoku's answer).

## Rules

- Fill every empty cell with a digit from 1 to 9.
- Each row, each column and each 3x3 box contains every digit 1-9 exactly once.
- Every inequality sign between two adjacent cells must hold: the cell the sign points
  at holds the smaller digit.

### Success finishing criteria

All 81 cells are filled AND no row, column or box repeats a digit AND every sign holds.

## Puzzle Player

### Interactions

Same as sudoku:

- Click an empty cell to select it (given cells are not selectable).
- Desktop: a radial menu around the selected cell with 1-9 and erase (X).
- Keyboard: 1-9 to enter, Backspace/Delete to clear, Escape to deselect.
- Mobile: a digit bar at the bottom with 1-9 and clear.
- Hovering a cell highlights its row, column and box peers.
- Conflicts are shown in red (with live validation on, as sudoku): duplicate digits in a
  row, column or box, and any sign whose two filled cells break it (the sign turns red
  too).
- Pencil-mark notes work as in sudoku (note mode toggle, `n` key).
- No Hint button yet: the solver has no unequal sudoku plugin.

### Appearance

Laid out like the print, so later variants with other clues between neighbouring cells
can reuse the layout:

- Cells are separate white squares with thin dark outlines, with a gap between
  neighbours (about 40% of a cell) that holds the sign, centred in the gap.
- Each 3x3 box sits on a light rounded backing plate, so boxes read as groups, the way
  the print's gap shading does. Box backing plates alternate between two light tints,
  in a checkerboard pattern.
- Givens are bold black, player digits grey (same as sudoku).
- Shared layout: `player/frontend/src/components/gapGrid.tsx` (cell/gap geometry, box
  plates, `InequalitySign`), for reuse by later neighbouring-clue variants.

### Progress calculation

`(cells assigned by the player / total empty cells) * 100`. Only cells with hint = 0
count; a cell counts once it holds any digit 1-9.

### Android

- `UnequalSudokuEngine` (type 29) reuses `SudokuEngine`'s answer, progress and restore
  (same `hints` / notes keys) and adds the sign checks; `UnequalSudokuBoard` draws the
  print layout on `ZoomableBoard`'s 9x9 grid, each slot one square plus half a gap on
  every side, so signs sit on slot boundaries and a tap anywhere in a slot is that cell.
  Digit bar and pencil notes as sudoku; no Hint.

## Puzzle Editor

### Interactions

- Uses the same print-style layout as the player.
- Click a cell to select it, then type 1-9 to set a given, or Backspace/0 to clear.
- Click a gap between two cells to cycle its sign: none → `<` → `>` → none (`∧` / `∨` for
  vertical gaps).
- Board is always 9x9 — no resizing.
- Givens that repeat a digit or break a sign are marked red (a likely misread).
- The JSON is the source of truth; when it doesn't parse, the editor shows a JSON
  textarea to fix it (as the other editors do).

### Android admin

- Authoring type `UNEQUAL_SUDOKU`: a parsed photo becomes an `UnequalSudokuDraft`
  reviewed in `UnequalSudokuEditor` on the player board with every cell editable; a tap
  within a quarter slot of a boundary cycles that gap's sign. No format problems (the
  board is always 9x9); overridable warnings: givens that repeat or break a sign, gaps
  with no sign.

## Puzzle Parser

- First parser with no grid-line detection (`unequal_sudoku/grid_detector.py`): the
  board is a fixed 9x9 lattice of separate squares. Find the square cell outlines
  (contours of near-square boxes of the dominant size), link squares one pitch apart
  into a lattice, and keep its complete 9x9 window. Each cell is measured by the
  inner edge of its outline plus the stroke width: a sign whose tip touches an
  outline (board 1, row 2 between columns 6 and 7) merges into the outer contour.
  No warp is needed; every cell and gap is read where it is. Photos also show squares that are not part of the board: neighbouring boards
  cut off at the page edges, the answer strip, the rules-box example grid and the
  1-9 number bar, so the parser must pick the right 81.
- Givens: crop each square with `cell_ocr.crop_cell` and read with `read_cells`
  (`allow_multi_digits=False`, no zero, max 9).
- Signs: each gap between neighbouring squares holds a chevron. Its direction is read
  geometrically, not with OCR or Gemini: a chevron's ink is narrow at the tip and wide
  at the open end, so comparing the ink spread at the two ends of the gap gives the
  direction. An empty gap gives `0`.
- Validates: 9x9 hints 0-9, `right` 9x8 and `down` 8x9 with values 0-2.
- Both samples parse exactly (pinned in `parsers/tests/test_unequal_sudoku_parser.py`
  against `unequal-sudoku-board-{1,2}.canon.json`), also at 1080 and 800 px wide.
  Debug image: `04_cells.png` labels every given and sign.

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` strings (x,y order), like sudoku. For
example, column 3, row 5 is `"3,5"`. This applies to `userValues`,
`initialUserValues` and `onValuesChange`.
