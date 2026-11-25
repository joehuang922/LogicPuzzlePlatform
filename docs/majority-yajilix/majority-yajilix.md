# Majority Yajilix (多数派ヤジリックス)

**Puzzle Type ID:** 47 (incubating)

A variant of [Yajilix](../yajilix/yajilix.md) from the same magazine, again titled (仮題):
clues have no number, and the letter names the cell class that is alone the most common
along the arrow. Incubating, like Yajilix.

## Question structure description

A rectangular grid with dashed thin lines and a solid outer border, no rooms. Some cells
hold a clue: a **letter** — `L`, `I` (printed like a thin `l`/`|`) or `X` — and an **arrow**
up, down, left or right. A left/right arrow is printed above the letter, an up/down arrow to
its right. There are no numbers. Every other cell is empty.

### Canonical JSON structure

The rule sheet's 5x5 example:

```json
{
  "cells": [
    [null, null, null, null, null],
    [null, {"kind": "X", "dir": "right"}, null, null, null],
    [null, null, null, null, {"kind": "L", "dir": "down"}],
    [null, null, null, null, null],
    [{"kind": "L", "dir": "up"}, {"kind": "I", "dir": "up"}, null, null, null]
  ]
}
```

- `cells`: `rows x cols`, row-major.
  - `null`: empty cell.
  - `{"kind", "dir"}`: clue cell. `kind` is `"L"`, `"I"` or `"X"`; `dir` is `"up"`,
    `"down"`, `"left"` or `"right"`.

Yajilix's clue is the same object with a `num`; this type's has none.

### Sample images

- [board-majority-yajilix-1.jpg](board-majority-yajilix-1.jpg): the example and its answer
  above puzzle 1 (8x8).
- [board-majority-yajilix-2.jpg](board-majority-yajilix-2.jpg): puzzle 2 (8x8), with the top
  of puzzle 3 below it (a finger over its corner) and the edge of another page's board.
- [board-majority-yajilix-3.jpg](board-majority-yajilix-3.jpg): puzzle 3 (10x10), with the
  bottom of puzzle 2 above it.
- [rule.jpg](rule.jpg): the rule text and the example.

Each puzzle, transcribed by hand and solved with CP-SAT under the rules below, has exactly
one solution (`<sample>.solution.json`); the example's matches the printed answer.

## Answer structure description

Yajilix's: the loop's segments plus the player's marks.

### Canonical JSON structure

Answer to the example above:

```json
{
  "edges": {
    "h": [[1, 1, 1, 0], [0, 0, 0, 0], [1, 1, 0, 0], [0, 0, 0, 1], [0, 0, 1, 1]],
    "v": [[1, 0, 0, 1, 0], [1, 0, 0, 1, 0], [0, 0, 1, 1, 0], [0, 0, 1, 0, 1]]
  },
  "marks": [[0, 0, 0, 0, 0], ...]
}
```

- `edges.h`: `rows x (cols-1)`. `1` = a segment between (row, col) and (row, col+1).
- `edges.v`: `(rows-1) x cols`. `1` = a segment between (row, col) and (row+1, col).
- `marks`: `rows x cols`. `0` none, `1` ×, `2` •; solving aids only, never validated.

## Rules

1. Draw one closed loop through cell centres, moving horizontally and vertically. It may
   not cross or branch. Not every cell needs to be on the loop.
2. The loop never enters a clue cell.
3. Every empty (non-clue) cell falls in one class: **L** (the loop turns there), **I** (it
   goes straight through) or **X** (it doesn't visit it).
4. A clue looks at the empty cells from it to the board's edge in the arrow's direction
   (other clue cells are skipped). Its letter is the class with strictly more of those
   cells than each of the other two classes. A tie for the most doesn't satisfy it.

In the example, X→ at R2C2 sees R2C3..R2C5: none on the loop except R2C4 (a straight), so
X has 2, I 1, L 0.

### Success finishing criteria

- Every clue cell has no segments; every other cell has 0 or 2, and the cells with 2 form
  one connected loop.
- For every clue, its class's count along the arrow is greater than each other class's.

## Puzzle Player

### Interactions

As Yajilix:

- **Drag to draw/erase** the loop between cell centres; never into a clue cell.
- **Tap** an empty cell to cycle its mark: none → × → • → none (right-click backwards on
  the web).
- **Errors: On** (`liveValidate`): a clue turns red when its class can no longer come out
  alone on top. Count each class's *certain* cells along the arrow (a cell with 2 segments
  is a known L or I, a × cell with no segment a known X) and its *possible* cells (certain
  plus open cells that could still become it, as in Yajilix). The clue is red when its
  class's possible count is at most another class's certain count. A clue cell the loop
  enters, or a cell with 3+ segments, is tinted red.
- Rules live in `majorityYajilixRules.ts` with `majorityYajilixRules.test.ts`, reusing
  Yajilix's `lineCells` / `cellShape` and Country Road's value helpers.

### Appearance

Yajilix's board: dashed grid, solid border, the clue's letter with its arrow above
(left/right) or to its right (up/down), × and • marks in gray, the loop on top.

### Progress calculation

`(empty cells decided / empty cells) * 100`, where a cell is decided when a loop segment
touches it or it carries a mark. Clue cells don't count.

## Puzzle Editor

### Interactions

Yajilix's editor without the number:

- Click a cell to select it; `L`, `I`, `X` set its kind (an empty cell becomes an `↑`
  clue), arrow keys its direction, Delete / Backspace / Space clears it. Buttons do the same.
- Add / remove a row at the bottom and a column at the right (+/− buttons).

### Format problems (hard block, also in the API's `semanticChecks`)

- `cells` isn't rectangular.

### Misread warnings (overridable)

- No clues.
- A clue with no empty cells in its direction (it can never be satisfied).

## Puzzle Parser

`parsers/src/puzzle_parsers/majority_yajilix/`, Yajilix's parser with a letter-only clue.

- **Board and grid:** `rectify_board` → `find_grid_lines`, as Yajilix (dashed lines,
  solid border). Sample 1 also shows the complete example and its answer; sample 2 the
  partial puzzle 3 under a finger and another page's board edge.
- **Clues:** letter + arrow, no digit: Gemini through `cell_classify.classify_cells` with a
  new shared `LetteredDirectionTarget` (the Yajilix target without the number), full-cell
  crops. No EasyOCR, no `_OCR_TYPES` entry.
- Samples pinned as `docs/majority-yajilix/<sample>.canon.json` at full, 2000 and 1080px
  with the Gemini reads stubbed, as Yajilix. Live reads stay unchecked until a key is
  available.

## Android port

- **Player:** `MajorityYajilixEngine` (`ShadeMarkEngine`, reusing `YajilixEngine` and
  `CountryRoadEngine` helpers) and `MajorityYajilixBoard`, which draws through the Yajilix
  board with letter-only clues: drag for the loop, taps through `vm::tapShadeCell`,
  `liveValidate`.
- **Admin review editor** (`MajorityYajilixAuthoring`, `MajorityYajilixEditor`): tap a
  cell, then kind chips (Empty / L / I / X) and arrow chips; rows and columns added or
  removed at any edge (`GridEdgeControls`); problems list. `MajorityYajilixMiniBoard` for
  the batch tile.
- Not a picture puzzle.

# Misc

## Coordinate convention

Yajilix's (and Country Road's): cells `[row][col]`; player values `"h:r,c"`, `"v:r,c"`
segments and `"m:r,c"` marks (1 ×, 2 •); answer `{edges: {h, v}, marks}`.
