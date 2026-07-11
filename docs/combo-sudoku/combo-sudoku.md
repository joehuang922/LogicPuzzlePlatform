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

(Left empty for now)

## Puzzle Editor

### Interactions

- Click a sub-board to focus it (yellow highlight). Click a cell within the focused sub-board to edit its hint value.
- "Add Subboard" button creates a new empty 9x9 sub-board.
- "Remove Subboard" removes the focused sub-board.
- Arrow buttons around a focused sub-board move it in room-coordinate increments.
- JSON textarea on the right is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Supports two modes: explicit layout (known sub-board positions) or auto-detect via bold-bordered 9x9 grid detection.
- Auto-detect finds individual sub-board borders, warps each, then determines room-coordinate positions.
- Cross-validates overlapping regions between adjacent sub-boards (resolves 0-vs-nonzero conflicts).
- OCR via Gemini full-image recognition or cell-by-cell extraction.
- Validates that each sub-board is a 9x9 grid with values 0-9.
- Each sub-board is always 9x9 cells. Positions are in room-coordinates (multiply by 3 for cell-coordinates).

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` strings in global cell-coordinates. For example, if a sub-board is at room position (2,0), its top-left cell is global column 6, row 0, keyed as `"6,0"`.
