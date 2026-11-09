# Balance Link (バランスリンク)

**Puzzle Type ID:** 32

## Question structure description

A rectangular grid with no rooms. Each cell is white (empty), black (no line may enter), or holds a **symbol**: a shape drawn either outlined (white) or filled (black). The player links identical symbols in pairs with lines through cell centres, and each line must be mirror-symmetric about its own midpoint — "balanced".

Symbols are a fixed set of shapes, each in two colours. The set covers the current sample boards and can grow later.

| Code tens | Shape |
|---|---|
| 1 | circle ● ○ |
| 2 | square ■ □ |
| 3 | diamond ◆ ◇ |
| 4 | triangle pointing up ▲ △ |
| 5 | triangle pointing down ▼ ▽ |
| 6 | five-point star ★ ☆ |
| 7 | four-point star ✦ ✧ |

The ones digit is the colour: `0` = white (outlined), `1` = black (filled). So `61` is a black star and `40` a white up-triangle.

### Canonical JSON structure

The rule sheet's 4x4 example:

```json
{
  "cells": [
    [0, 0, 0, 60],
    [11, 1, 11, 0],
    [0, 60, 0, 0],
    [41, 0, 0, 41]
  ]
}
```

- `cells`: `rows x cols` integers. `0` = white cell, `1` = black cell, `10`–`71` = a symbol (tens = shape, ones = colour, table above).

### Sample images

- [balance-link-board-1.jpg](balance-link-board-1.jpg) — puzzle 1, 8x8, with the rule example and its answer above it.
- [balance-link-board-2.jpg](balance-link-board-2.jpg) — puzzle 3, 10x10 (parts of puzzles 2 and 4 also visible).
- [rule.jpg](rule.jpg) — rule sheet with the 4x4 example and its answer.

## Answer structure description

The drawn line segments between neighbouring cell centres, as in Number Link.

### Canonical JSON structure

Answer to the example above:

```json
{
  "edges": {
    "h": [
      [1, 1, 0],
      [0, 0, 0],
      [0, 1, 1],
      [1, 1, 1]
    ],
    "v": [
      [1, 0, 1, 1],
      [0, 0, 0, 1],
      [0, 0, 0, 0]
    ]
  }
}
```

- `edges.h`: `rows x (cols-1)`; `1` = a segment between (row, col) and (row, col+1).
- `edges.v`: `(rows-1) x cols`; `1` = a segment between (row, col) and (row+1, col).

In the example: the black circles are joined by a U over the black cell (symmetric about the vertical line through column 2), the white stars by an L with equal arms (symmetric about the diagonal through its corner), and the black triangles by a straight line.

## Rules

1. Draw lines through white cells to join identical symbols (same shape and colour) two by two. Lines may not enter black cells.
2. Lines run horizontally and vertically through cell centres. Each line is **line-symmetric about the point exactly halfway along it**: reflecting it across some mirror line maps the line onto itself, swapping its two ends.
3. Lines may not cross, branch or share a cell, and may not pass through a symbol's cell. Not every white cell needs a line.

### Success finishing criteria

- No segment touches a black cell.
- Every symbol cell has exactly one segment; every other white cell has 0 or 2. So each line is a simple path between two symbols, with no loops.
- Each line's two end symbols have the same code.
- Each line, taken as points P0…Pn from one end to the other, has a mirror R with R(Pi) = P(n−i) for every i. R is fixed by the two ends: a vertical mirror when they share a row, a horizontal one when they share a column, a 45° diagonal one when |Δrow| = |Δcol|. Otherwise no mirror maps one end to the other and the line fails. (A grid path can only be mirrored onto itself by a horizontal, vertical or 45° axis, so this covers every case.)

## Puzzle Player

### Interactions

Like Number Link:

- **Drag to draw:** press on a symbol, or on the free end of a line, and drag into neighbouring cells to extend it one segment at a time. Dragging back onto the previous cell retracts the last segment. A line can't enter a black cell, a cell already used by another line, or pass through a symbol cell (it may only end on one).
- **Tap** a line cell to clear the segments touching it.
- Appearance: dashed thin grid lines like the print. Black cells are filled dark (no rooms, so not `ROOM_SHADE`). Symbols are drawn as vector shapes at the cell centre, outlined or filled. Lines are thick strokes between cell centres. When a line joins two matching symbols but isn't symmetric, it's drawn in red.

### Progress calculation

`(symbols on a finished line / all symbols) * 100`. A finished line joins two symbols of the same code and is symmetric; both its symbols count.

## Puzzle Editor

### Interactions

- Click a cell to select it. A panel then offers **Empty**, **Black**, or a symbol: pick a shape from the table, then **White** or **Black**.
- Rows/Cols inputs resize the grid, keeping cells that still fit.
- The JSON textarea is the source of truth, synced both ways.
- Misread warnings (overridable): a symbol code with an odd count on the board (it can't be paired), no symbols at all.

## Puzzle Parser

- Plain rectangular grid with **dashed** thin lines and a solid border: `rectify_board` → `find_grid_lines` (the lattice fit handles dashed boards, as for the other dashed puzzles).
- Each scan also shows parts of neighbouring puzzles (and, on board 1, the rule example and answer above the board); the border detector must take the one complete board.
- **Black cells:** shared `cell_fill` fill test.
- **Symbols:** non-empty, non-black cells go through `cell_classify.classify_cells(recognizer, crops, [SymbolTarget(...)])` on Gemini, with one code per shape and colour from the table above. EasyOCR can't represent shapes, so this is Gemini's job per CLAUDE.md. The empty-cell test and crops are shared; empty and black cells are blanked to white so they stay out.
- Not an EasyOCR type, so not in `_OCR_TYPES`; built with the Gemini recognizer like the other symbol parsers.
- **Accuracy bar:** grid size and black cells must be right. Symbols should be right on the samples; the editor's shape and colour picker fixes misreads.
- Validates `cells` is rectangular with values in {0, 1} or a known symbol code.

# Misc

## Coordinate convention

Canon `cells[row][col]` is row-major. Player-entered segments use Number Link's keys, row first: `"h:row,col"` for the segment between (row, col) and (row, col+1), `"v:row,col"` for the one between (row, col) and (row+1, col), value `1`. The persisted answer is `{edges: {h, v}}` as above.
