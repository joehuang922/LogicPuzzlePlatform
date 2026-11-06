# Combo Sudoku

**Puzzle Type ID:** 2

## Question structure description

A variation of Sudoku where multiple 9x9 sub-boards overlap. Each sub-board is a standard Sudoku grid positioned on a larger canvas. Sub-boards overlap in 3x3-room increments, sharing cells in overlapping regions. Shared cells must satisfy the constraints of ALL sub-boards that contain them.

### Canonical JSON structure

```json
{
  "room_width": 3,
  "room_height": 3,
  "subboards": [
    {
      "x": 2,
      "y": 0,
      "hints": [
        [0, 0, 0, 0, 2, 5, 0, 0, 0],
        [0, 0, 5, 1, 0, 0, 8, 0, 0],
        [0, 7, 0, 0, 0, 0, 3, 0, 0],
        [0, 6, 0, 0, 8, 0, 0, 2, 0],
        [0, 0, 3, 0, 0, 0, 0, 6, 0],
        [0, 0, 1, 0, 0, 4, 5, 0, 0],
        [0, 0, 0, 4, 3, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0]
      ]
    },
    {
      "x": 0,
      "y": 2,
      "hints": [[...]]
    }
  ]
}
```

- `room_width` / `room_height` (optional): room dimensions in cells, defaults to 3.
- `subboards`: array of sub-board definitions.
  - `x`, `y`: the sub-board's top-left corner position in room-coordinates (i.e., multiply by 3 to get cell-coordinates).
  - `hints`: 9x9 array. `0` = empty, `1-9` = pre-filled hint.

### Sample images

- [board_sudoku.jpg](combo-sudoku/board_sudoku.jpg) — single-board reference
- [board_2.jpg](combo-sudoku/board_2.jpg) — 2-board combo
- [board_3.jpg](combo-sudoku/board_3.jpg) — 3-board combo
- [sample_warped.jpg](combo-sudoku/sample_warped.jpg) — warped/processed sample

## Answer structure description

The answer contains each sub-board's fully-filled 9x9 grid.

### Canonical JSON structure

```json
{
  "subboards": [
    {
      "x": 2,
      "y": 0,
      "answers": [
        [4, 8, 6, 3, 2, 5, 7, 1, 9],
        [...]
      ]
    }
  ]
}
```

- `subboards[].answers`: 9x9 array with all cells filled 1-9.

## Rules

- Each sub-board independently follows standard Sudoku rules (each row, column, and 3x3 box contains digits 1-9 exactly once).
- Overlapping cells must satisfy ALL sub-boards they belong to simultaneously.

### Success finishing criteria

All cells across the combined grid are filled AND no conflicts exist in any row, column, or 3x3 box of any sub-board.

## Puzzle Player

### Interactions

- Same as Sudoku: click to select, radial menu or keyboard for input.
- Peer highlighting spans across all sub-boards that contain the selected cell.
- Cells not belonging to any sub-board are not interactive.
- Desktop: radial digit picker (1-9 + erase). Mobile: digit bar.

### Progress calculation

`(cells assigned by the player / total empty cells that need assignment) * 100`. Across all sub-boards, cells that were originally empty (hint = 0) are counted. Overlapping cells shared between sub-boards are deduplicated (counted once). A cell is "assigned" once the player enters any digit 1-9.

### Auto-solve

Creating or editing a question runs the registration gate (`docs/auto-solve`) with
`player/solver/src/plugins/combo-sudoku`. It treats the whole layout as one puzzle: a
shared cell's peers come from every board covering it, and a box two boards share is
one unit. Propagation uses naked and hidden singles. Hidden singles are what carry
information across boards through the shared boxes. Without them one 5-board sample
needed ~477k search nodes; with them every sample needs under 40 and is solved in a
few milliseconds. A board misread by OCR or placed one room off usually comes out with
no solution or several, so the gate also catches those mistakes.

A unique puzzle stores its solution in the answer's shape,
`{ "subboards": [{ "x", "y", "answers" }] }`. No hint ladder yet.

## Puzzle Editor

### Interactions

- Click a sub-board to focus it (yellow highlight). Click a cell within the focused sub-board to edit its hint value.
- "Add Subboard" button creates a new empty 9x9 sub-board.
- "Remove Subboard" removes the focused sub-board.
- Arrow buttons around a focused sub-board move it in room-coordinate increments.
- JSON textarea on the right is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Handles any arrangement of 9x9 sub-boards with no fixed shapes or board
  count: cross, staircase, pinwheel, samurai, irregular one- or two-room
  overlaps, and the 14-board two-page spread (`board_2` ... `board_8`,
  `sample_warped`; keys in `board_*_ans.json`).
- Layout (`combo_sudoku/layout.py`): find grid-line crossings on a
  straightened, Android-sized copy, index them on one cell lattice by
  walking neighbour to neighbour (so tilt, keystone and a page fold only
  matter locally), mark the 3x3 rooms whose crossings are there (gaps and
  enclosed holes have no inner lines), then pick the fewest 3x3-room blocks
  that cover exactly those rooms.
- Reading: each room is warped flat onto one canvas at native resolution and
  every cell is read once with the shared `read_grid_clues` (EasyOCR), then
  the canvas is sliced into sub-boards. Cells two boards share are read once.
- If the shape fits more than one set of boards, the set whose clues break no
  sudoku rule wins; if the clues can't tell them apart, or no set of boards
  explains the shape, the parse fails with a clear message instead of
  guessing.
- Known limit: two boards overlapping by two room-columns draw the same
  outline as three boards in a row. The parser picks the fewest boards.
- Debug: `python -m puzzle_parsers.combo_sudoku <image> --debug <dir>` writes
  the crossing lattice, the flattened canvas with every read, and the JSON.

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` strings in global cell-coordinates. For example, if a sub-board is at room position (2,0), its top-left cell is global column 6, row 0, keyed as `"6,0"`.
