# Sudoku

**Puzzle Type ID:** 1

## Question structure description

A standard 9x9 Sudoku grid. Some cells are pre-filled with numbers 1-9 (hints); the remaining cells are empty (represented as 0) and must be filled by the player.

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

- `hints`: A 9x9 array of integers. `0` = empty cell, `1-9` = pre-filled hint.

### Sample images

No dedicated sample images currently in docs. Puzzle images are standard 9x9 Sudoku grids with thick 3x3 box borders and thin cell borders.

## Answer structure description

The answer is the fully-filled 9x9 grid, combining hints and player-entered values.

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

- `hints`: A 9x9 array where every cell is filled with 1-9 (no zeros remain).

## Rules

- Fill every empty cell with a digit from 1 to 9.
- Each row must contain all digits 1-9 exactly once.
- Each column must contain all digits 1-9 exactly once.
- Each 3x3 box (room) must contain all digits 1-9 exactly once.

### Success finishing criteria

All 81 cells are filled AND no conflicts exist (no duplicate digits in any row, column, or 3x3 box).

## Puzzle Player

### Interactions

- Click an empty cell to select it (hint cells are not clickable).
- On desktop: a radial menu appears around the selected cell with digits 1-9 and an erase (X) button. Click a digit to place it, or click X to clear.
- Keyboard: press 1-9 to enter a digit, Backspace/Delete to clear, Escape to deselect.
- On mobile: a digit bar appears at the bottom with 1-9 and clear.
- Hovering a cell highlights its row, column, and 3x3 box peers.
- Conflicts (duplicate digits in a group) are shown in red.

### Progress calculation

`(cells assigned by the player / total empty cells that need assignment) * 100`. Only cells that were originally empty (hint = 0) count toward the total; pre-filled hints are excluded. A cell is "assigned" once the player enters any digit 1-9.

## Puzzle Editor

### Interactions

- Click any cell to select it, then type 1-9 to set a hint, or Backspace/0 to clear.
- A JSON textarea is shown alongside the board; editing either updates the other.
- Board always renders 9x9 — no resizing.

## Puzzle Parser

- Uses contour detection to find the board border, then perspective-warps to a square.
- Detects internal grid lines to determine cell geometry.
- Supports two paths: full-image LLM OCR (Gemini) or cell-by-cell extraction + OCR.
- Validates that the result is a 9x9 grid with values 0-9.
- Grid is always fixed at 9x9 (81 cells). No variable sizing.

# Misc

## Coordinate convention

Player-entered values are keyed as `"col,row"` strings (x,y order, not row,col). For example, column 3, row 5 is `"3,5"`. This applies to `userValues`, `initialUserValues`, and `onValuesChange` callbacks.
