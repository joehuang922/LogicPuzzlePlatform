# Perfect L-Ring (完全えるりんぐ)

**Puzzle Type ID:** 42

**Incubating:** yes. A reader-submitted variant of [L-Ring](../l-ring/l-ring.md) (type 33), printed under a provisional title (仮題) with two puzzles.

Perfect L-Ring is L-Ring plus one rule (rule 4 below). The question, the answer, the player, the editor and the parser all reuse L-Ring's code. A `perfect` flag turns on the extra rule.

## Question structure description

Same as L-Ring. The board is a rectangular grid with dashed thin lines and a solid outer border, and it has no rooms. Some cells hold a bold filled **arrow** pointing up, right, down or left. Every other cell is empty.

### Canonical JSON structure

The rule sheet's 5x5 example:

```json
{
  "cells": [
    [2, 0, 0, 0, 0],
    [0, 0, 3, 0, 0],
    [0, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0]
  ]
}
```

- `cells`: `rows x cols` integers. `0` = empty, `1` = arrow up, `2` = arrow right, `3` = arrow down, `4` = arrow left (clockwise from up).

Puzzle 1 (`perfect-l-ring-board-1.jpg`, 6x6):

```json
{
  "cells": [
    [2, 0, 0, 0, 4, 0],
    [0, 2, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [2, 0, 1, 0, 0, 0]
  ]
}
```

Puzzle 2 (`perfect-l-ring-board-2.jpg`, 6x6):

```json
{
  "cells": [
    [0, 0, 0, 3, 0, 0],
    [2, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0],
    [0, 0, 0, 0, 4, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 2, 0, 4, 0, 0]
  ]
}
```

A CP-SAT search finds exactly one solution for each of the three boards under these rules. Without rule 4 (plain L-Ring), each board has three or more solutions. That checks both the reads and the rules.

### Sample images

- [perfect-l-ring-board-1.jpg](perfect-l-ring-board-1.jpg): puzzle 1, 6x6, with the top of puzzle 2 below it.
- [perfect-l-ring-board-2.jpg](perfect-l-ring-board-2.jpg): puzzle 2, 6x6, with the bottom of puzzle 1 above it and text below.
- [rule.jpg](rule.jpg): the rules (遊び方), with the 5x5 example and its answer.

## Answer structure description

Same as L-Ring: the loop's segments between neighbouring cell centres, as in Masyu.

### Canonical JSON structure

Answer to the example above (it matches the printed 答え):

```json
{
  "edges": {
    "h": [
      [1, 1, 1, 1],
      [0, 0, 1, 0],
      [0, 0, 0, 0],
      [1, 1, 0, 0],
      [0, 0, 0, 1]
    ],
    "v": [
      [1, 0, 0, 0, 1],
      [1, 0, 1, 1, 1],
      [1, 0, 1, 1, 1],
      [0, 0, 0, 1, 1]
    ]
  }
}
```

- `edges.h`: `rows x (cols-1)`. `1` = a segment between (row, col) and (row, col+1).
- `edges.v`: `(rows-1) x cols`. `1` = a segment between (row, col) and (row+1, col).

In the example:
- The right arrow at R1C1 has a right arm of 4 and a down arm of 3.
- The down arrow at R2C3 has a down arm of 2 and a right arm of 1.
- The up arrow at R4C1 has an up arm of 3 and a right arm of 2.
- The loop also turns at five cells without an arrow. Their arm pairs are:
  - R1C5: 4 and 4
  - R5C5: 4 and 1
  - R5C4: 1 and 3
  - R2C4: 1 and 3
  - R4C3: 2 and 2

  No pair differs by exactly 1.

## Rules

Rules ①–④ in the print are L-Ring's:

1. Draw one closed loop through cell centres, moving horizontally and vertically. It may not cross, branch or visit a cell twice. Not every cell needs to be on the loop.
2. The loop passes through every arrow cell and turns there, making an L.
3. At an arrow cell the loop has two straight **arms**. Each arm runs from the arrow cell to the loop's next turn. The arm in the arrow's direction is exactly 1 cell longer than the other arm.

Rule ⑤ is the new one:

4. Wherever the loop turns in a cell **without** an arrow, its two arms (measured the same way) must **not** differ by exactly 1. They may be equal or differ by 2 or more.

Together: a turn's arms differ by exactly 1 at an arrow, and only there, and the arrow points along the longer arm.

### Success finishing criteria

- Every cell has 0 or 2 segments, and the cells with 2 form one connected loop.
- Every arrow cell has 2 segments at a right angle, one of them in the arrow's direction.
- For each arrow, an arm's length is the number of segments walked straight from the arrow cell until the loop turns. The arm in the arrow's direction is 1 longer than the other arm.
- At every other cell where the loop turns, the two arm lengths do not differ by exactly 1.

## Puzzle Player

### Interactions

Same as L-Ring (Masyu-style):

- **Drag to draw or erase:** press on a cell and drag through neighbouring cells. The first edge the drag crosses sets the mode. If that edge was already drawn, the drag erases. Otherwise it draws.
- **Appearance:**
  - Grid lines are dashed and thin, with a solid border, like the print.
  - Arrows are bold and filled, drawn under the loop.
  - The loop is a thick dark stroke between cell centres.
- **Rules code:** web rules live in `lRingRules.ts`, extended with a `perfect` option. `cornerState(cells, e, r, c)` decides the new rule at an unarrowed turn, and `validateLRing(cells, e, {perfect: true})` adds it to the completion check.
- **Errors on:**
  - An arrow whose L can no longer work is drawn red, as in L-Ring.
  - When the loop turns in an unarrowed cell and both arms are decided (each reaches a turn), the board draws a **red dot** on that cell if the arms differ by exactly 1.
- **Board component:** `LRingBoard` takes a `perfect` prop. `PerfectLRingBoard` is a thin wrapper around it, so there is no copy of the board.

### Progress calculation

Same as L-Ring: `(satisfied arrows / all arrows) * 100`. An arrow is satisfied when all of these hold:
- Its cell has exactly two segments at a right angle, one in the arrow's direction.
- Both arms reach a turn: a cell where the loop leaves at a right angle.
- The arm in the arrow's direction is 1 longer than the other arm.

Rule 4 does not count toward progress. It is checked only for completion and for Errors. A solved board reads 100%, and a board with no arrows reads 0.

## Puzzle Editor

### Interactions

Same as L-Ring (`LRingEditor`, reused for type 42):

- Click a cell to cycle it: empty → ↑ → → → ↓ → ← → empty.
- Rows/Cols inputs resize the grid, keeping cells that still fit.
- The JSON textarea is the source of truth, synced both ways.
- **No format problems:** every rectangular grid of 0–4 is a valid layout.
- **Overridable misread warnings:**
  - There are no arrows.
  - An arrow points straight off the board.

## Puzzle Parser

- `perfect_l_ring` reuses the L-Ring parser pipeline and sets `puzzle_type = "perfect-l-ring"`.
- **Grid:** a plain rectangular grid with **dashed** thin lines and a solid border. It goes through `rectify_board` (flattened) → `find_grid_lines`, the same lattice fit L-Ring uses.
- **Board choice:** each photo also shows part of the other puzzle, cut off at the page edge. The border detector must pick the one complete board.
- **Arrows:** arrows go to Gemini through `cell_classify.classify_cells(recognizer, crops, [SymbolTarget(...)])`, with codes 1–4 for up, right, down and left, as in L-Ring. Crops come from `crop_cell`, and the shared empty-cell test keeps blank cells out.
- **No digits:** there is no EasyOCR, and the type is not in `_OCR_TYPES`.
- **Validation:** the parser checks that `cells` is rectangular with values 0–4.
- **Samples:** hand-checked canons are saved as `perfect-l-ring-board-{1,2}.canon.json`. `tests/test_perfect_l_ring_parser.py` pins them with the Gemini reads stubbed, at full size and at 2000px.

## Android port

- **Player:**
  - `PerfectLRingEngine` reuses `LRingRules`, with the corner rule added behind a `perfect` flag. It extracts and restores through `MasyuEngine`, the same `h:`/`v:` keys as the web, so answers sync. Progress counts satisfied arrows. Completion adds rule 4.
  - `LRingBoard` takes `perfect`. With Errors on it draws red arrows and the red corner dots.
  - `PlayScreen` routes type 42 to `LRingBoard(perfect = true)`.
- **Admin authoring:**
  - `PerfectLRingAuthoring` follows `LRingAuthoring` on a `ClueGridDraft`, so the `LRingEditor` screen and `LRingMiniBoard` are shared.
  - The editor picks Empty or a direction per cell, and adds or deletes rows and columns.
  - Arrows that point off the board, and a board with no arrows, are overridable warnings.
  - The type is in `AuthoringType` as `完全えるりんぐ` with `incubating = true`.
- **Not a picture puzzle:** no thumbnail and no preview.
- **Release:** the port ships with the next `/cut-release`.

# Misc

## Coordinate convention

Same as L-Ring:
- Canon `cells[row][col]` is row-major.
- Player-entered segments use Masyu's keys, with value `1`:
  - `"h:row,col"` is the segment between (row, col) and (row, col+1).
  - `"v:row,col"` is the segment between (row, col) and (row+1, col).
- The persisted answer is `{edges: {h, v}}` as above.
