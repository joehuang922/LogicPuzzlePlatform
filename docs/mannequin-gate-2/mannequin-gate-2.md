# Mannequin Gate 2 (マネキンゲート2)

**Puzzle Type ID:** 43

**Incubating:** yes. It was printed under a provisional title (仮題), with four puzzles by one author (坂本伸幸).

## Question structure description

A rectangular grid with thin solid lines and a thick border. Thick hatched **gray lines** are drawn over some cells. Each gray line runs from cell centre to cell centre, stepping to one of the 8 neighbours: up, down, left, right, or diagonally.

- A line ends a little past the centre of its end cells.
- Lines may turn, and may cross or touch other lines.
- Where two lines cross, they cross over each other: each continues straight to the opposite side of the cell (立体交差).
- A diagonal step goes through the grid corner between two cells. It does **not** pass through the two cells that share that corner. Some prints mark these corner points with a dot.

### Canonical JSON structure

The rule sheet's 4x4 example:

```json
{
  "rows": 4,
  "cols": 4,
  "lines": [
    [[0, 0], [1, 0], [2, 0], [3, 0]],
    [[1, 0], [1, 1]],
    [[3, 0], [2, 1], [1, 2], [2, 3]],
    [[3, 1], [3, 2], [2, 2]],
    [[0, 3], [1, 3], [2, 3], [3, 3]]
  ]
}
```

- `rows`, `cols`: grid size.
- `lines`: each line lists **every cell it passes through**, in order, as `[row, col]`.
  - Consecutive cells are 8-neighbours.
  - A line never visits a cell twice and has at least 2 cells.
  - The direction a line is listed in doesn't matter.

**Format problems.** The editor and the API reject these:
- A cell is outside the grid.
- Two consecutive cells aren't neighbours.
- A line visits a cell twice.
- A line has fewer than 2 cells.
- Two lines share a step between the same two cells. A photo can't tell such lines apart.

The four puzzles are in `mannequin-gate-2-board-{1..4}.canon.json`:

| Puzzle | Size | Lines |
|---|---|---|
| 1 | 4x4 | 6 |
| 2 | 4x4 | 6 |
| 3 | 8x8 | 19 |
| 4 | 6x6 | 9 |

### Sample images

Each puzzle photo also shows part of a neighbouring puzzle.

- [rule.jpg](rule.jpg): the rules (遊び方), with the example (例題) and its answer (答え).
- [mannequin-gate-2-board-1.jpg](mannequin-gate-2-board-1.jpg): puzzle 1, 4x4, with the example and answer cut off above it.
- [mannequin-gate-2-board-2.jpg](mannequin-gate-2-board-2.jpg): puzzle 2, 4x4, with the top of puzzle 3 below it.
- [mannequin-gate-2-board-3.jpg](mannequin-gate-2-board-3.jpg): puzzle 3, 8x8, with the bottom of puzzle 2 above it and the top of puzzle 4 below it.
- [mannequin-gate-2-board-4.jpg](mannequin-gate-2-board-4.jpg): puzzle 4, 6x6, with the bottom of puzzle 3 above it.

## Answer structure description

Which cells are shaded.

### Canonical JSON structure

The answer to the example, matching the printed 答え:

```json
{
  "shaded": [
    [0, 0, 0, 0],
    [1, 1, 0, 0],
    [0, 0, 0, 1],
    [1, 1, 1, 1]
  ]
}
```

- `shaded`: `rows x cols`. `1` = shaded, `0` = unshaded. Marks are a solving aid only and are not saved in the answer.

## Rules

1. Shade some cells.
2. **Two per line:** every gray line passes through exactly **two** shaded cells. A cell only counts if the line passes through it; touching its corner doesn't count.
3. **Gate size:** a line's gate size is the number of unshaded cells it passes through between its two shaded cells.
4. **Crossing lines:** two lines cross when either of these holds:
   - they pass through a common cell (straight through, turning, or ending there);
   - two of their diagonal steps cross at a grid corner.

   Lines that cross must have **different** gate sizes.
5. **Connectivity:** all unshaded cells are connected orthogonally.

A cell that no line passes through may be shaded too. Puzzles 2 and 4 need such cells.

**Checking the reading:** a CP-SAT search finds exactly one solution for each of the five boards (the example and puzzles 1–4) under these rules. Under each narrower reading, at least one board has several solutions or none:
- crossing counted only at shared cells, or only at corners;
- cells without a line kept unshaded.

### Success finishing criteria

- Every line has exactly two shaded cells.
- Every pair of crossing lines has different gate sizes.
- The unshaded cells form one orthogonally connected group, and there is at least one unshaded cell.

## Puzzle Player

### Interactions

- **Web:** click cycles a cell empty → shaded → marked (dot) → empty, and right-click goes back.
- **Android:** the shared shade/mark tap cycle (`ShadeMarkEngine`). No paint modes and no drag.
- **Appearance:**
  - White cells with thin solid black grid lines and a thick border.
  - Shaded cells are **black**, as in the printed answer. The board is not divided into rooms, so `ROOM_SHADE` doesn't apply.
  - Marks are small dots.
  - The gray lines are drawn **on top of** the cells as thick round-capped strokes from centre to centre. Each end extends about a quarter cell past its end cell's centre, so an end can be told apart from a turn.
  - Lines are mid-gray (`#9a9a9a`) on white, and stay visible on black.
- **Rules code:** web rules live in `mannequinGate2Rules.ts`; Android ports them in `MannequinGate2Rules`.
- **Errors on:** a line is drawn red when any of these holds:
  - it already has 3 or more shaded cells;
  - all its cells are decided (shaded or marked) and it has fewer than 2 shaded;
  - it has exactly 2 shaded cells, and so does a crossing line with the same gate size.

  The connectivity rule isn't flagged live.

### Progress calculation

`(lines with exactly two shaded cells / all lines) * 100`. A solved board reads 100%. A board with no lines reads 0.

User values: key `"c:col,row"`, value `1` shaded or `2` marked. Empty cells are dropped. These are the Android `ShadeCycle` values.

## Puzzle Editor

### Interactions

- Drag from a cell through neighbouring cells, diagonals included, to draw a new line. Releasing the drag adds it. A one-cell drag adds nothing.
- Click a cell to select the lines through it. **Delete line** removes the selected line, and repeated clicks cycle through the lines in that cell.
- Rows/Cols inputs resize the grid and drop lines that no longer fit.
- The JSON textarea is the source of truth, synced both ways.
- Format problems (see Question structure) are listed above the board and block saving. The API enforces them too, in `semanticChecks[43]`.
- Overridable misread warning: no lines.

## Puzzle Parser

`mannequin_gate_2`. There are no digits or symbols, so neither EasyOCR nor Gemini is used. It is pure OpenCV line tracing.

- **Grid:** a plain rectangular grid with **solid** thin lines and a thick border: `rectify_board` (flattened) → `find_grid_lines`. Each photo shows parts of other puzzles cut off at the page edges, so the border finder must pick the one complete board.
- **Strokes:** the gray lines are thick, hatched and mid-gray, darker than the paper and lighter than the black grid lines. A closing operation turns the hatching into solid strokes. The thin grid lines are removed from the mask.
- **Steps:** for each pair of 8-neighbour cells, sample along the segment between their centres. A step exists when nearly all samples land on stroke. A diagonal segment goes through the shared corner, so the two other cells at that corner never get a step.
- **Stubs:** for each cell and each of the 8 directions with no step, check whether a stroke overhangs the centre by roughly a quarter cell. That overhang marks a line ending in this cell.
- **Pairing at each cell:**
  - Directions present in opposite pairs go straight through: crossings are straight, by the rule.
  - A step whose opposite is a stub is a line end.
  - Two remaining steps are a turn.
  - A cell with a step and no opposite stub, and nothing to pair with, is also an end, since some ends barely overhang.

  Walking the pairings gives each line as a cell list. This matters for puzzle 3's `t` shape at R3C1, where two lines end in the same cell. The overhangs tell those two ends apart from a turn.
- **Validation:** the parser validates the same format rules as the editor.
- **Samples:** hand-checked canons are saved as `mannequin-gate-2-board-{1..4}.canon.json`. `tests/test_mannequin_gate_2_parser.py` pins them at full size and at 2000px.

## Android port

- **Player:**
  - `MannequinGate2Engine` implements `ShadeMarkEngine`, with keys `c:col,row`. Extract/restore, progress and completion port the web.
  - `MannequinGate2Board` draws on `ZoomableBoard`: black shade, dots, and the gray lines on top. With Errors on, broken lines are red. `onTapCell` goes to `vm::tapShadeCell`.
  - `PlayScreen` routes type 43.
- **Admin authoring:**
  - `MannequinGate2Authoring` is a pure object. Its draft is `{rows, cols, lines}`. Edits: draw a line by a precise drag (`onDrawStartPrecise` / `onDrawToPrecise`, with diagonal steps accepted), delete a line through a tapped cell, and add or remove the last row or column.
  - `formatProblems` ports the web editor's. `problems` adds "No lines".
  - `MannequinGate2Editor` has Draw and Delete mode chips, the problems list, and row/column buttons.
  - `MannequinGate2MiniBoard` draws the lines, framed red when there are problems.
  - The type is in `AuthoringType` as `マネキンゲート2` with `incubating = true`.
- **Not a picture puzzle:** no thumbnail and no preview.
- **Release:** the port ships with the next `/cut-release`.

# Misc

## Coordinate convention

- Canon line cells are `[row, col]`, zero-based, row-major.
- Player values use `"c:col,row"`, column first, as Hitori and LITS do.
- `shaded[row][col]` in the answer.
- Gate sizes and crossings are computed from `lines`. No other geometry is stored.
