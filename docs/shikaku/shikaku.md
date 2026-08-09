# Shikaku

**Puzzle Type ID:** 22

## Question structure description

A rectangular grid of cells separated by dashed lines. Some cells contain a numbered clue (a positive integer, shown as a filled circle with a white number). The player must divide the entire grid into rectangles (and squares) such that each rectangle contains exactly one clue, and the clue's value equals the area (number of cells) of that rectangle. Every cell must belong to exactly one rectangle.

### Canonical JSON structure

```json
{
  "cells": [
    [0, 6, 0, 0, 8, 0, 0, 0, 6, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 12, 0, 0],
    [0, 9, 0, 0, 9, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 10, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 10, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 9, 0, 0, 9, 0, 0, 12, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  ]
}
```

- `cells`: rows x cols array of integers. `0` = empty cell (no clue). A positive integer is a clue whose value must equal the area of the rectangle that contains it.
- The sum of all clue values equals the total number of cells (rows x cols) in any valid puzzle.

### Sample images

- [board-shikaku.png](board-shikaku.png) — 10x10 board
- [board-shikaku-medium.png](board-shikaku-medium.png) — 10 col x 18 row board

## Answer structure description

The answer is the list of rectangles that tile the grid. Each rectangle is described by its top-left corner and its dimensions. There is exactly one rectangle per clue, and every cell is covered by exactly one rectangle.

### Canonical JSON structure

```json
{
  "rects": [
    { "r": 0, "c": 0, "w": 3, "h": 2 },
    { "r": 0, "c": 3, "w": 4, "h": 2 },
    { "r": 0, "c": 7, "w": 3, "h": 2 },
    { "r": 2, "c": 0, "w": 3, "h": 3 },
    { "r": 2, "c": 3, "w": 3, "h": 3 },
    { "r": 2, "c": 6, "w": 4, "h": 3 },
    { "r": 5, "c": 0, "w": 5, "h": 2 },
    { "r": 5, "c": 5, "w": 5, "h": 2 },
    { "r": 7, "c": 0, "w": 3, "h": 3 },
    { "r": 7, "c": 3, "w": 3, "h": 3 },
    { "r": 7, "c": 6, "w": 4, "h": 3 }
  ]
}
```

- `rects`: an array of rectangles. Each has:
  - `r`: top row index (0-based).
  - `c`: left column index (0-based).
  - `w`: width in columns (>= 1).
  - `h`: height in rows (>= 1).
- Each rectangle covers cells `(r..r+h-1, c..c+w-1)`.
- In a solved puzzle: rectangles are pairwise disjoint, their union is the whole grid, each rectangle contains exactly one clue, and `w * h` equals that clue's value.

## Rules

- Divide the entire grid into rectangles (squares count as rectangles).
- Each rectangle must contain exactly one clue number.
- The number in a rectangle must equal the rectangle's area (width x height in cells).
- Rectangles may not overlap, and every cell must be covered by exactly one rectangle.

### Success finishing criteria

The whole grid is partitioned into rectangles such that: every cell is covered exactly once, each rectangle contains exactly one clue, and each clue value equals the area of its rectangle.

## Puzzle Player

### Interactions

- **Drag to draw a rectangle:** press on any empty (uncovered) cell and drag to an opposite corner; on release a rectangle spanning the dragged bounding box is created. Dragging can start from a clue cell or from a non-clue cell — both are valid.
- **Collisions are forbidden:** a drag whose resulting rectangle would overlap any existing rectangle is rejected — no rectangle is created (or, when resizing, the resize is reverted). Existing regions are never silently overwritten.
- **Resize by corner handles:** pressing on one of the four corners of an existing rectangle and dragging resizes it — the opposite corner stays anchored while the dragged corner follows the pointer. The resize commits only if the new bounds collide with no other rectangle.
- Tapping/clicking a single cell that belongs to a rectangle (away from its corners) removes that rectangle (erase).
- Region coloring gives live feedback (semi-transparent fill):
  - **Green** — region contains exactly one clue AND its area equals that clue's value.
  - **Red** — region contains exactly one clue but its area does NOT equal the clue's value (or contains more than one clue).
  - **Gray** — region contains no clue.
- Clue cells display a filled dark circle with a white number and are not draggable-away as clues (their value is fixed), but they can be re-covered by a new rectangle.
- Grid lines are dashed; rectangle borders are drawn as thick solid lines around each region.

### Progress calculation

`(cells covered by any rectangle / total cells) * 100`. A cell counts as covered if it belongs to at least one drawn rectangle.

## Puzzle Editor

### Interactions

- Click a cell to select it, then type a number to set its clue value (0 or empty clears it).
- Rows/Cols inputs resize the grid (existing clue values preserved where they still fit).
- Cells with a clue get a light blue background highlight and show the number.
- JSON textarea is the source of truth; visual edits and JSON edits sync bidirectionally.

## Puzzle Parser

- Grid lines are dashed — uses `auto_detect_grid_lines` (auto-sweeps erode sizes for optimal detection).
- Detects the grid structure and determines dimensions from line spacing.
- Clues are white numbers inside filled dark circles. The parser locates the filled circles, extracts each circle's ROI, and inverts/thresholds so the white digits become dark on light for OCR.
- Uses the LLM recognizer (Gemini) to classify each clue circle as a positive integer (including multi-digit numbers like 10, 12, 18).
- Maps each recognized clue to the grid cell whose center is nearest the circle centroid.
- Validates that every clue is a positive integer and that the sum of clues equals rows x cols (a necessary condition for a valid Shikaku).

# Misc

## Coordinate convention

Player-entered values are keyed as:
- `"rect:<r>,<c>"` — a drawn rectangle anchored at top-left cell (row `r`, col `c`). User values are numeric (`Record<string, number>`), so width/height are packed into a single integer: `value = w * 1000 + h` (grid dimensions never approach 1000). The board emits these via `onValuesChange`; the extractor decodes them into the `rects` answer array.

Rows are indexed top-to-bottom, columns left-to-right, both 0-based. In the answer, a rectangle at `{r, c, w, h}` covers cells with row in `[r, r+h)` and column in `[c, c+w)`.
