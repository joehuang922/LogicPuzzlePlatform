# Sudoku

**Puzzle Type ID:** 1

## Question structure description

An N x N Sudoku grid divided into rooms of `room_width` columns by `room_height` rows, with N = room_width x room_height. The standard board is 9x9 with 3x3 rooms; bigger ones run up to 30x30: 16x16 (4x4 rooms), 25x25 (5x5), 30x30 (rooms 6 wide and 5 tall, so 5 rooms across and 6 down). Some cells are pre-filled with numbers 1-N (hints); the remaining cells are empty (represented as 0) and must be filled by the player. Numbers above 9 are written as numbers (10-30), never letters.

### Canonical JSON structure

```json
{
  "hints": [
    [0, 0, 1, 0, 0, 0, 8, 0, 0],
    [0, 2, 0, 0, 0, 7, 0, 4, 0],
    [0, 3, 0, 5, 0, 0, 9, 0, 0],
    [8, 0, 0, 0, 0, 0, 0, 0, 3],
    [0, 0, 0, 6, 0, 1, 0, 0, 0],
    [9, 0, 0, 0, 0, 0, 0, 0, 5],
    [0, 0, 9, 0, 0, 4, 0, 6, 0],
    [0, 8, 0, 3, 0, 0, 0, 2, 0],
    [0, 0, 7, 0, 0, 0, 1, 0, 0]
  ]
}
```

- `room_width` / `room_height` (optional, default 3): room size in cells. A 9x9 canon leaves both out. N = room_width x room_height is at most 30 (the solver's candidate sets are 32-bit masks).
- `hints`: An N x N array of integers. `0` = empty cell, `1-N` = pre-filled hint.

A 30x30 canon starts `{"room_width": 6, "room_height": 5, "hints": [[0, 13, 1, ...], ...]}`. The API rejects a canon whose grid isn't N x N or holds a number above N.

### Sample images

- `docs/combo-sudoku/board_sudoku.jpg`: a plain 9x9.
- `board-sudoku-16x16.jpg`, `board-sudoku-25x25.jpg`, `board-sudoku-30x30.jpg` (a two-page spread) in this folder, each with its true grid as `*.canon.json`. Each canon has exactly one solution, and the hint ladder solves it from empty.

## Answer structure description

The answer is the fully-filled N x N grid, combining hints and player-entered values.

### Canonical JSON structure

```json
{
  "hints": [
    [5, 6, 1, 9, 4, 2, 8, 7, 3],
    [...],
    [...]
  ]
}
```

- `hints`: An N x N array where every cell is filled with 1-N (no zeros remain).

## Rules

- Fill every empty cell with a number from 1 to N.
- Each row must contain all numbers 1-N exactly once.
- Each column must contain all numbers 1-N exactly once.
- Each room (3x3 on a 9x9, room_width x room_height in general) must contain all numbers 1-N exactly once.

### Success finishing criteria

All N x N cells are filled AND no conflicts exist (no duplicate number in any row, column, or room).

## Puzzle Player

### Interactions

- Click an empty cell to select it (hint cells are not clickable).
- On desktop: a radial menu appears around the selected cell with digits 1-9 and an erase (X) button. Click a digit to place it, or click X to clear.
- Keyboard: press 1-9 to enter a digit, Backspace/Delete to clear, Escape to deselect.
- On mobile: a digit bar appears at the bottom with 1-9 and clear.
- Hovering a cell highlights its row, column, and room peers.
- Boards above 9x9 (web and Android): a number pad of 1-N replaces the radial menu, on desktop too, and marks the selected cell's notes in note mode. On the keyboard a number takes one or two keys ("2", "7" -> 27); a digit that can start a longer number (a lone 1 on a 16x16) waits 0.8s for the second key. Notes are laid out like a room (room_width x room_height slots). On a phone the web board keeps 30px cells and scrolls sideways; Android pinch-zooms and pans.
- Conflicts (duplicate digits in a group) are shown in red.
- **Hint** (web and Android, offline): highlights the next cell to fill, never its
  digit. The cell is one whose digit can be worked out from the board as it stands: the
  solver's technique ladder (singles, locked candidates, naked pairs, then
  contradiction: every other digit there runs into a contradiction by filling in
  singles) works through candidate-only steps internally (`nextPlacement`,
  `docs/auto-solve`) until it reaches a placement. It carries every production puzzle
  from empty to solved. If it ever can't, the hint says none is available. It reasons
  from the entered digits as if they're right, and asks to fix conflicting cells first.

### Progress calculation

`(cells assigned by the player / total empty cells that need assignment) * 100`. Only cells that were originally empty (hint = 0) count toward the total; pre-filled hints are excluded. A cell is "assigned" once the player enters any number 1-N.

## Puzzle Editor

### Interactions

- A size picker offers 9x9, 16x16, 25x25 and 30x30 (6-wide, 5-tall rooms); switching clears the givens (after a confirm).
- Click any cell to select it, then type 1-N to set a hint (two keys for 10 and up), or Backspace to clear (0 also clears on a 9x9).
- Givens that repeat a number in a row, column or room are shown in red with a count: likely misreads. It's a warning, not a block.

## Puzzle Parser

- Uses contour detection to find the board border, then perspective-warps to a square.
- Counts the grid lines (`find_grid_lines`); the board must be square, at most 30x30.
- Above 9x9, reads the room size off the thick walls (`classify_border_thickness`): of the factorizations N = width x height, the one whose room lines best match the thick-wall votes, so a page fold read as a wall is outvoted (`infer_rooms`).
- Reads clues with EasyOCR through `cell_ocr.read_grid_clues`: single digits on a 9x9, multi-digit (`max_value=N`) above.
- Pages are not flattened: on the 30x30 two-page spread the fold breaks line tracing. That sample reads all but two clues, both clipped by the fold; the 16x16 and 25x25 read exactly (at Android upload size, 1 and 5 misreads). The editor flags repeats so misreads are easy to spot.
- Validates that the result is an N x N grid with values 0-N.

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` strings (x,y order, not row,col). For example, column 3, row 5 is `"3,5"`. This applies to `userValues`, `initialUserValues`, and `onValuesChange` callbacks.
