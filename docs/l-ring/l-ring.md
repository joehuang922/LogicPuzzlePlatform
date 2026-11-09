# L-Ring (えるりんぐ)

**Puzzle Type ID:** 33

## Question structure description

A rectangular grid with dashed thin lines and a solid outer border, no rooms. Some cells hold a bold filled **arrow** pointing up, right, down or left. Every other cell is empty.

### Canonical JSON structure

The rule sheet's 4x4 example:

```json
{
  "cells": [
    [3, 0, 4, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 1]
  ]
}
```

- `cells`: `rows x cols` integers. `0` = empty, `1` = arrow up, `2` = arrow right, `3` = arrow down, `4` = arrow left (clockwise from up).

Puzzle 1 (`l-ring-board-1.jpg`, 6x6):

```json
{
  "cells": [
    [0, 2, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 4],
    [3, 0, 0, 0, 0, 0],
    [0, 0, 2, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [2, 0, 0, 0, 0, 0]
  ]
}
```

### Sample images

- [l-ring-board-1.jpg](l-ring-board-1.jpg): puzzle 1, 6x6, with the rule example and its answer above it.
- [l-ring-board-2.jpg](l-ring-board-2.jpg): puzzle 2, 8x8, with the top of puzzle 3 below it.
- [rule.jpg](rule.jpg): the same photo as board 1. Only the last line of the rule text is visible.

## Answer structure description

The loop's segments between neighbouring cell centres, as in Masyu.

### Canonical JSON structure

Answer to the example above:

```json
{
  "edges": {
    "h": [
      [1, 1, 0],
      [0, 0, 1],
      [0, 1, 0],
      [1, 0, 1]
    ],
    "v": [
      [1, 0, 1, 0],
      [1, 0, 0, 1],
      [1, 1, 1, 1]
    ]
  }
}
```

- `edges.h`: `rows x (cols-1)`. `1` = a segment between (row, col) and (row, col+1).
- `edges.v`: `(rows-1) x cols`. `1` = a segment between (row, col) and (row+1, col).

In the example:
- The down arrow at R1C1 has a down arm of 3 and a right arm of 2.
- The left arrow at R1C3 has a left arm of 2 and a down arm of 1.
- The up arrow at R4C4 has an up arm of 2 and a left arm of 1.

## Rules

1. Draw one closed loop through cell centres, moving horizontally and vertically. It may not cross, branch or visit a cell twice. Not every cell needs to be on the loop.
2. The loop passes through every arrow cell and turns there, making an L.
3. At an arrow cell the loop has two straight **arms**. Each arm runs from the arrow cell to the loop's next turn. The arm in the arrow's direction is exactly 1 cell longer than the other arm.

### Success finishing criteria

- Every cell has 0 or 2 segments, and the cells with 2 form one connected loop.
- Every arrow cell has 2 segments at a right angle, one of them in the arrow's direction.
- For each arrow, define an arm's length as the number of segments walked straight from the arrow cell until the loop turns. The arm in the arrow's direction is 1 longer than the other arm.

## Puzzle Player

### Interactions

Like Masyu:

- **Drag to draw/erase:** press on a cell and drag through neighbouring cells. If the first edge crossed was already drawn, the drag erases; otherwise it draws.
- Appearance:
  - Dashed thin grid lines with a solid border, like the print.
  - Arrows are drawn as bold filled arrows in the cell, under the loop.
  - The loop is a thick dark stroke between cell centres.
- Web rules live in `lRingRules.ts` (`arrowState`, `validateLRing`, `satisfiedArrows`). With **Errors** on, an arrow whose L can no longer work is drawn red.
- Android: `LRingBoard` draws with Masyu's `MasyuDragState`, and with Errors on it reds out arrows the same way. `LRingRules` in `LRingEngine.kt` ports `lRingRules.ts`, and extract/restore delegate to `MasyuEngine`. Authoring is `LRingEditor` on a `ClueGridDraft`: pick Empty or a direction per cell, and delete or add rows and columns. Arrows pointing off the board are flagged.

### Progress calculation

`(satisfied arrows / all arrows) * 100`. An arrow is satisfied when all of these hold:
- Its cell has exactly two segments at a right angle, one in the arrow's direction.
- Both arms reach a turn: a cell where the loop leaves at a right angle.
- The arm in the arrow's direction is 1 longer than the other arm.

A solved board reads 100%, and a board with no arrows reads 0.

## Puzzle Editor

### Interactions

- Click a cell to cycle it: empty → ↑ → → → ↓ → ← → empty.
- Rows/Cols inputs resize the grid, keeping cells that still fit.
- The JSON textarea is the source of truth, synced both ways.
- Overridable misread warning: no arrows. An arrow pointing straight off the board can't be satisfied, so it is also a warning.

## Puzzle Parser

- Plain rectangular grid with **dashed** thin lines and a solid border: `rectify_board` → `find_grid_lines`. The lattice fit handles dashed boards.
- Each scan shows other material besides the puzzle:
  - board 1 has the rule example and its answer above the puzzle;
  - board 2 has the top of puzzle 3 below it.

  The border detector must pick the one complete board. On board 1 the board is only about 14% of the frame, under the main contour pass's floors. A shared small-board contour pass in `find_quadrilateral_border` handles it. That pass runs only when nothing else is well supported, and every other parser's samples keep their quads.
- **Arrows:** arrow cells go through `cell_classify.classify_cells(recognizer, crops, [SymbolTarget(...)])` on Gemini, with codes 1–4 for up/right/down/left. CLAUDE.md reserves arrows for Gemini. Crops come from `crop_cell`, and the shared empty-cell test keeps blank cells out.
- No digits, so no EasyOCR and no entry in `_OCR_TYPES`.
- **Accuracy bar:** the grid size and arrow positions must be right. Directions should be right on the samples; the editor's click-to-cycle fixes misreads.
- The parser validates that `cells` is rectangular with values 0–4.
- Both samples parse exactly at full size, 1080 and 800 px with live Gemini. Hand-checked canons are in `l-ring-board-{1,2}.canon.json`, and `tests/test_l_ring_parser.py` pins them with the reads stubbed.

# Misc

## Coordinate convention

Canon `cells[row][col]` is row-major. Player-entered segments use Masyu's keys: `"h:row,col"` for the segment between (row, col) and (row, col+1), and `"v:row,col"` for the segment between (row, col) and (row+1, col), with value `1`. The persisted answer is `{edges: {h, v}}` as above.
