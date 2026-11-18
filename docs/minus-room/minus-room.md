# Minus Room (マイナルーム)

**Puzzle Type ID:** 39

Incubating: yes. A provisional (仮題) reader-submitted type on its fourth appearance. Not a picture puzzle.

## Question structure description

A `rows × cols` grid divided into **rooms** by thick walls (thin lines inside a room, thick room borders, thick outer border, all solid). Some cells hold a given number. **Circled numbers** sit on some edges between two orthogonally adjacent cells, on thin and thick lines alike. Each puzzle states the largest number to use, printed beside the board (「1〜4」).

### Canonical JSON structure

Board ① (`board-minus-room-1.canon.json`):

```json
{
  "rows": 5,
  "cols": 5,
  "max": 4,
  "cells": [
    [0, 0, 0, 0, 0],
    [0, 2, 0, 0, 3],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 4, 0, 0, 0]
  ],
  "edges": {
    "h": [[0, 0, 0, 1, 0], [0, 0, 1, 0, 0], [0, 1, 0, 0, 1], [1, 1, 0, 1, 1]],
    "v": [[1, 1, 1, 0], [1, 1, 0, 1], [1, 1, 1, 1], [0, 1, 1, 0], [0, 0, 0, 0]]
  },
  "circles": [
    {"dr": 1, "dc": 0, "value": 3},
    {"dr": 3, "dc": 4, "value": 0}
  ]
}
```

- `rows`, `cols`: grid size, each ≥ 2.
- `max`: the largest number (N); cells take 1..N. Every sample uses 4; the rules example uses 3.
- `cells`: `rows × cols`; `0` = empty, `1..max` = a given number.
- `edges`: room walls, as in Ripple Effect. `h` is `(rows − 1) × cols`, `1` = wall between `(r, c)` and `(r + 1, c)`; `v` is `rows × (cols − 1)`, `1` = wall between `(r, c)` and `(r, c + 1)`. The outer border is implicit.
- `circles`: on the edge between two adjacent cells, in doubled coordinates where cell `(r, c)` is `(2r, 2c)`: `(2r + 1, 2c)` is the edge between `(r, c)` and `(r + 1, c)`, `(2r, 2c + 1)` between `(r, c)` and `(r, c + 1)`. Exactly one coordinate is odd. `value` is `0..max − 1`. At most one circle per edge. Sorted by `dr`, then `dc`.

### Sample images

- [rules.jpg](rules.jpg): rules ①–③ (rules ④ and ⑤ are on a part of the page not in the photo; see Rules).
- [board-minus-room-1.jpg](board-minus-room-1.jpg): puzzle ①, 5×5, 1〜4 (the bottom of the rules example and its answer are also visible).
- [board-minus-room-2.jpg](board-minus-room-2.jpg): puzzle ②, 6×6, 1〜4 (bottom of ① and top of ③ visible).
- [board-minus-room-3.jpg](board-minus-room-3.jpg): puzzle ③, 8×8, 1〜4 (bottom of ② visible).

Each has a hand-checked `.canon.json` and its unique `.solution.json` beside it.

## Answer structure description

The fully filled grid, givens included, as in Ripple Effect.

### Canonical JSON structure

Board ①'s solution:

```json
{
  "numbers": [
    [1, 2, 1, 3, 3],
    [4, 2, 2, 2, 3],
    [4, 1, 2, 3, 1],
    [4, 4, 2, 3, 3],
    [1, 4, 4, 4, 4]
  ]
}
```

- `numbers`: `rows × cols`, every cell `1..max`; `0` for a cell left empty in a partial answer.

## Rules

1. Put a number from 1 to N (given per puzzle) in every empty cell.
2. In each room, orthogonally adjacent equal numbers form blocks, and a block of number k has exactly k cells. Blocks stay inside their room: equal numbers on either side of a thick wall don't join (they may touch).
3. A circled number on the edge between two cells is their difference (larger minus smaller).
4. A room may not hold two blocks of the same number.
5. Equal numbers may not form a 2×2 clump anywhere on the board, across walls included.

Rules ④ and ⑤ are from the user, not the photographed page. With only ①–③ every sample has two solutions; with all five each has exactly one (CP-SAT).

### Success finishing criteria

Every cell holds 1..max, givens unchanged, and rules 2–5 hold: every block (a component of equal numbers within a room) has as many cells as its number, no room has two blocks of one number, every circle matches its two cells' difference, and no 2×2 square has four equal numbers.

## Puzzle Player

### Interactions

- As Ripple Effect: click/tap a cell to select it, type a digit 1..max (desktop keyboard, or the digit bar / numeric keyboard on mobile); Delete/Backspace clears. Givens are bold and can't be changed. Digits above max are ignored.
- Live validation ("Errors: On"), only from what can't be undone by filling more cells:
  - A block (component of equal numbers in a room) larger than its number, or a block smaller than its number with no empty cell next to it in its room: its cells are drawn red.
  - Two blocks of the same number in one room, each complete (size = number): drawn red.
  - A circle whose two cells are both filled and differ by the wrong amount: ringed red.
  - A 2×2 square of four equal numbers: drawn red.

### Appearance

- White cells; thin gray interior lines, thick black room walls and outer border. Givens bold black, player numbers dark blue. Circles: white discs with a black outline, about 0.36 cell across, centred on their edge, the value inside, drawn over the lines. The range ("1〜4") is shown under the board.

### Progress calculation

`(non-given cells holding a number / non-given cells) * 100`, as Ripple Effect.

## Puzzle Editor

### Interactions

- Three modes. *Numbers*: click a cell to set its given number (prompt; empty or 0 clears). *Walls*: click near an interior edge to toggle the room wall there. *Circles*: click near an interior edge to set its circled difference (prompt; empty clears).
- Rows / Cols / Max inputs; resizing keeps what still fits.
- Format problems, listed above the board and blocking save (the API rejects the same): `cells` / `edges` not matching rows × cols, a given or circle value out of range (given 1..max, circle 0..max − 1), a circle not on an edge between two cells, two circles on one edge, a wall that ends inside a room.
- Overridable warnings: a given larger than its room; no givens and no circles.

### Appearance

- Same as the player view.

## Puzzle Parser

`parsers/src/puzzle_parsers/minus_room/` (design notes in `grid_detector.py`).

- **Grid:** solid lines and a thick border: the shared `rectify_board` (flattened) and `find_grid_lines`. Each photo also shows parts of neighbouring puzzles; the border finder takes the complete board.
- **Walls:** `grid_utils.classify_border_thickness` (shared, per CLAUDE.md); circles drawn on walls don't disturb it.
- **Circles:** `cv2.HoughCircles` (radius 0.12-0.26 cell), kept when the centre is within 0.15 cell of an edge midpoint (digits sit at cell centres). Each digit is read by `cell_ocr.read_cells` on the disc's inside (ring and lines painted white), `allow_zero=True`, `max_value = max − 1`.
- **Givens:** `cell_ocr.read_grid_clues(..., allow_multi_digits=False, max_value=max)` on a copy of the board with every circle painted white. Minus Room is on the single-digit list (CLAUDE.md and `test_cell_ocr_contract.py`): clues are 1..max, max ≤ 9.
- **Max:** the 「1〜N」 beside the board's bottom-right corner: in a band round that corner (board erased), the 「〜」 is the component more than 1.4× as wide as tall and N the next one right of it, read by `read_cells`. Falls back to 4 when not found or without OCR; the review shows the range.
- **Accuracy:** all three samples parse exactly (size, walls, givens, circles and their digits, max) at full size, 2000 and 1200 px with live EasyOCR; circle radii measured 0.19-0.23 cell. Each canon has a unique solution under rules 1–5 (`*.solution.json`, CP-SAT).

## Android port

- **Player:** `MinusRoomEngine` ports extraction, progress, completion and live errors (same `"col,row"` keys). `MinusRoomBoard` on `ZoomableBoard`: tap a cell to select it and enter digits with the `DigitBar` (max = the puzzle's max), as Ripple Effect. Not a picture puzzle: no preview or thumbnail.
- **Admin review** (`MinusRoomAuthoring`, `MinusRoomEditor`): three mode chips. *Numbers*: tap a cell, type its given. *Walls*: a tap snaps to the nearest interior edge and toggles the wall (as Ripple Effect's room editor). *Circles*: a tap snaps to the nearest interior edge and selects it; type its value (blank clears). A Max field; add / remove a row or column at the bottom / right. Problems list = the web editor's format problems plus the warnings. `MinusRoomMiniBoard` is the batch tile (framed red with problems).

# Misc

## Coordinate convention

- Cells are `(row, col)`, row 0 at the top; walls as Ripple Effect (`h[r][c]` below cell `[r][c]`, `v[r][c]` to its right).
- Circles use doubled coordinates: cell `(r, c)` is `(2r, 2c)`, an edge has exactly one odd coordinate.
- Player values are keyed `"col,row"` (column first, as Ripple Effect) → the number; empty cells are omitted. The answer is the `numbers` grid with givens filled in.
