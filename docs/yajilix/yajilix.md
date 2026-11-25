# Yajilix (ヤジリックス)

**Puzzle Type ID:** 46 (incubating)

The magazine titles it ヤジリックス(仮題), a tentative name: a reader-invented type with
three puzzles and a worked example, so it is incubating.

## Question structure description

A rectangular grid with dashed thin lines and a solid outer border, no rooms. Some cells
hold a clue made of three parts:

- a **letter**: `L` (cells where the loop turns), `I` (cells where the loop goes straight;
  printed like a thin `l`/`|`) or `X` (cells the loop doesn't visit);
- a **number**, 0 or more;
- an **arrow** pointing up, down, left or right. A left/right arrow is printed above the
  letter and number; an up/down arrow is printed to their right.

Every other cell is empty.

### Canonical JSON structure

The rule sheet's 6x6 example:

```json
{
  "cells": [
    [null, null, null, null, {"kind": "X", "num": 1, "dir": "left"}, null],
    [null, null, null, null, null, null],
    [{"kind": "L", "num": 2, "dir": "up"}, null, null, null, {"kind": "I", "num": 1, "dir": "right"}, null],
    [null, {"kind": "L", "num": 4, "dir": "right"}, null, null, null, null],
    [null, null, null, {"kind": "L", "num": 2, "dir": "left"}, null, {"kind": "X", "num": 1, "dir": "left"}],
    [null, null, null, null, null, null]
  ]
}
```

- `cells`: `rows x cols`, row-major.
  - `null`: empty cell.
  - `{"kind", "num", "dir"}`: clue cell.
    - `kind`: `"L"`, `"I"` or `"X"`.
    - `num`: non-negative integer.
    - `dir`: `"up"`, `"down"`, `"left"` or `"right"`.

### Sample images

- [board-yajilix-1.jpg](board-yajilix-1.jpg): the 6x6 example and its answer, puzzle 1
  (8x8), and the top of puzzle 2.
- [board-yajilix-2.jpg](board-yajilix-2.jpg): puzzle 2 (10x10), with the bottom of puzzle 1
  above it.
- [board-yajilix-3.jpg](board-yajilix-3.jpg): puzzle 3 (10x10), with the next type's title
  (多数派ヤジリックス) below it.
- [rule.jpg](rule.jpg): the rule text and the example.

Each of the three puzzles, transcribed by hand and solved with CP-SAT under the rules
below, has exactly one solution. The example's solution matches the printed answer.

## Answer structure description

The loop's segments between neighbouring cell centres, plus the player's cell marks so they
restore, exactly as Country Road.

### Canonical JSON structure

Answer to the example above:

```json
{
  "edges": {
    "h": [
      [1, 1, 0, 0, 0],
      [1, 0, 1, 1, 1],
      [0, 1, 1, 0, 0],
      [0, 0, 1, 0, 1],
      [0, 1, 0, 0, 0],
      [0, 1, 1, 1, 0]
    ],
    "v": [
      [1, 0, 1, 0, 0, 0],
      [0, 1, 0, 0, 0, 1],
      [0, 0, 0, 1, 0, 1],
      [0, 0, 1, 0, 1, 0],
      [0, 1, 0, 0, 1, 0]
    ]
  },
  "marks": [[0, 0, 0, 0, 0, 0], ...]
}
```

- `edges.h`: `rows x (cols-1)`. `1` = a segment between (row, col) and (row, col+1).
- `edges.v`: `(rows-1) x cols`. `1` = a segment between (row, col) and (row+1, col).
- `marks`: `rows x cols`. `0` none, `1` ×, `2` •; solving aids only, never validated.

## Rules

1. Draw one closed loop through cell centres, moving horizontally and vertically. It may
   not cross or branch. Not every cell needs to be on the loop.
2. The loop never enters a clue cell.
3. A clue counts the **empty** (non-clue) cells from the clue to the board's edge in the
   arrow's direction. Other clue cells on the way are skipped: they neither count nor stop
   the count. Among those cells:
   - `L n`: exactly `n` cells where the loop turns (two segments at a right angle);
   - `I n`: exactly `n` cells where the loop goes straight (two opposite segments);
   - `X n`: exactly `n` cells the loop doesn't visit.

### Success finishing criteria

- Every clue cell has no segments; every other cell has 0 or 2, and the cells with 2 form
  one connected loop.
- Every clue's count, as defined above, equals its number.

## Puzzle Player

### Interactions

- **Drag to draw/erase** (like Masyu / Country Road): press on a cell and drag through
  neighbouring cells. If the first edge crossed was already drawn, the drag erases;
  otherwise it draws. Drags don't draw into or out of clue cells.
- **Tap** an empty cell (no drag) to cycle its mark: none → × (unused) → • (used) → none.
  Right-click cycles backwards on the web. Marks are solving aids only.
- **Errors: On** (`liveValidate`): a clue turns red when the cells it sees can no longer
  meet its number. Only what the player has committed to counts: a cell with 2 segments
  is a known turn or straight, a cell marked × is known unused, and an untouched cell is
  still open. A clue is red when
  - `L`/`I`: the cells already turning (resp. going straight) exceed `n`, or the cells still
    able to turn (resp. go straight) — those not already straight (resp. turning) and not
    marked × — are fewer than `n`;
  - `X`: the cells marked × exceed `n`, or the cells with no segment at all are fewer
    than `n`.
  A cell with 3+ segments (a branch) is outlined red too.
- Rules live in `yajilixRules.ts` (`clueCount`, `clueBroken`, `validateYajilix`) with
  `yajilixRules.test.ts`.

### Appearance

- Dashed thin grid lines with a solid border, like the print.
- Clue: letter + number in bold, with the arrow above them (left/right) or to their right
  (up/down), like the print; `I` drawn as a serif `I` so it can't be read as `1`.
- × and • marks in gray, under the loop.
- Loop: a thick dark stroke between cell centres, on top.

### Progress calculation

`(empty cells decided / empty cells) * 100`, where a cell is decided when a loop segment
touches it or it carries a mark (× or •). Clue cells don't count.

## Puzzle Editor

### Interactions

- Click a cell to select it (highlighted). With a cell selected:
  - `L`, `I`, `X` keys set the clue's kind (an empty cell becomes a `kind 0 ↑` clue);
  - digit keys type its number (two keystrokes in a row build 10+);
  - arrow keys set its direction;
  - Delete / Backspace / Space clears the cell.
- A small toolbar under the board does the same by mouse: L / I / X / ↑ → ↓ ← / − / + /
  Clear buttons.
- Add / remove a row at the bottom and a column at the right (+/− buttons). An invalid JSON
  shows a "Create Empty Board" form with Rows/Cols inputs.
- The modal's JSON textarea is the source of truth, synced both ways.

### Format problems (hard block, also in the API's `semanticChecks`)

- `cells` isn't rectangular.

(Everything else is caught by the JSON Schema: kind, dir, non-negative integer num.)

### Misread warnings (overridable)

- No clues.
- A clue whose number exceeds the empty cells in its direction (e.g. an arrow pointing
  straight off the board with a number above 0).

### Appearance

Same as the player view without loop or marks; empty cells show a faint dot, the selected
cell is highlighted, and cells with warnings are outlined red.

## Puzzle Parser

`parsers/src/puzzle_parsers/yajilix/`.

- **Board and grid:** dashed thin lines with a solid border: the shared `rectify_board`
  (which flattens) → `find_grid_lines`, as L-Ring. Every sample shows parts of other
  boards (the example and its answer, a neighbouring puzzle's edge); the complete one is
  picked. On sample 1 the example and answer are complete small boards too: the parser
  should prefer the largest complete board.
- **Clues:** a letter + number + arrow per cell can't be represented by EasyOCR (CLAUDE.md
  reserves arrows for Gemini), so clue cells go through
  `cell_classify.classify_cells(recognizer, crops, targets)` with a new shared
  `LetteredDirectedIntegerTarget` (letter from a given alphabet, integer, direction) added
  to `cell_classify.py`, next to `DirectedIntegerTarget`. Crops come from
  `crop_cell(..., margin=0)`: the arrow often touches the cell's edge. The shared empty-cell
  test keeps blank cells out. No plain digits, so no EasyOCR and no `_OCR_TYPES` entry.
- **Accuracy bar:** grid size and clue positions must be right; kind, number and direction
  should be right on the samples — the editor fixes misreads. The likely confusions are
  `I` vs `1` / `l` and a left/right arrow over the text vs a digit.
- Each sample's parse is hand-checked against the photo, pinned as
  `docs/yajilix/<sample>.canon.json` in `tests/test_yajilix_parser.py` at full, Android
  (2000px long side) and 1080px size with the Gemini reads stubbed, and solved with CP-SAT
  to confirm a unique solution (`<sample>.solution.json`; the example's matches the printed
  answer). The grid size is right on every sample at full, 2000, 1080 and 800px.
- Not yet checked: live Gemini reads of the clues (no key in the session that wrote the
  parser). Expect `I`/`1` and arrow-direction misreads to show up first; the review editor
  fixes them.

## Android port

- **Player:** `YajilixEngine` (extract / restore / progress / completion ported from the
  web, `YajilixRules` porting `yajilixRules.ts`; `ShadeMarkEngine` for the marks, × as
  "shaded", • as "marked", clue cells take no input), `YajilixBoard` on `ZoomableBoard`
  with Masyu's drag for the loop, taps through `vm::tapShadeCell`, and `liveValidate`.
- **Admin review editor** (`YajilixAuthoring`, `YajilixEditor`): tap a cell to select it;
  chips under the board set the kind (Empty / L / I / X) and the direction (↑ → ↓ ←), and
  −/+ step the number. Add / remove rows and columns at any edge (`GridEdgeControls`), and the problems
  list. `YajilixMiniBoard` for the batch tile, framed red on problems.
- Not a picture puzzle: no thumbnail or preview.

# Misc

## Coordinate convention

- Cells are indexed `[row][col]`, row 0 at the top.
- Player values (Country Road's keys):
  - `"h:row,col"`: loop segment between `(row, col)` and `(row, col+1)`; `1` = drawn.
  - `"v:row,col"`: loop segment between `(row, col)` and `(row+1, col)`; `1` = drawn.
  - `"m:row,col"`: cell mark; `1` = ×, `2` = •.
- The persisted answer is `{edges: {h, v}, marks}` as above. The web shares
  `fromValues` / `toValues` / `degrees` / `isSingleLoop` with `countryRoadRules.ts`, and
  `YajilixEngine` reuses `CountryRoadEngine`'s loop helpers.
