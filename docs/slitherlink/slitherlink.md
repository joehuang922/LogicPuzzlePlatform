# Slitherlink

**Puzzle Type ID:** 5

## Question structure description

A grid of cells defined by dots at intersections. Some cells contain a number clue (0, 1, 2, or 3); other cells are empty (represented as -1). The player draws edges between adjacent dots to form a loop.

### Canonical JSON structure

```json
{
  "cells": [
    [1, -1, 3, -1, 2],
    [-1, 2, -1, 1, -1],
    [3, -1, -1, -1, 2],
    [-1, 1, -1, 2, -1],
    [2, -1, 3, -1, 1]
  ]
}
```

- `cells`: rows x cols array of integers. `-1` = empty (no clue), `0-3` = number clue.

### Sample images

- [board-slitherlink.jpg](slitherlink/board-slitherlink.jpg) — small board
- [board-slitherlink-medium-1.jpg](slitherlink/board-slitherlink-medium-1.jpg) — medium board
- [board-slitherlink-medium-2.jpg](slitherlink/board-slitherlink-medium-2.jpg) — medium board (variant)

## Answer structure description

The answer is a set of edges (horizontal and vertical) placed between grid dots.

### Canonical JSON structure

```json
{
  "edges": {
    "h": [[0, 1, 1, 0, 0], [1, 0, 0, 1, 0], ...],
    "v": [[0, 1, 0, 0, 1, 0], [1, 0, 0, 1, 0, 0], ...]
  }
}
```

- `edges.h`: (rows+1) x cols array. `1` = edge drawn on horizontal segment at row r between col c and col c+1. `0` = no edge. `2` = cross mark (player aid, not part of solution).
- `edges.v`: rows x (cols+1) array. `1` = edge drawn on vertical segment at col c between row r and row r+1. `0` = no edge. `2` = cross mark.

## Rules

- Draw edges along the grid lines (between adjacent dots) to form a single closed loop.
- The loop must not branch — every dot on the loop has exactly 2 edges.
- The loop must be connected — all edges form one continuous path.
- Each numbered cell indicates exactly how many of its 4 surrounding edges are part of the loop.

### Success finishing criteria

At least one edge exists AND the edges form a single connected loop with no branches AND all number constraints are satisfied.

## Puzzle Player

### Interactions

- Click a horizontal or vertical edge segment between two dots to cycle its state: empty → line (drawn) → cross (X mark) → empty.
- Lines are drawn as solid dark segments. Crosses are drawn as light gray X marks (player aid to mark "definitely no edge here").
- Dots are always displayed at grid intersections.
- Cell numbers are displayed centered in each cell.

### Progress calculation

(Left empty for now)

## Puzzle Editor

### Interactions

- Click a cell to cycle its value: empty (-1) → 0 → 1 → 2 → 3 → empty (-1).
- Cells with a number get a light blue background highlight.
- Rows/Cols inputs allow resizing the grid (preserves existing values where possible).
- Dots displayed at intersections for visual reference.

## Puzzle Parser

- Detects the dot grid using image processing (finds intersection points).
- Determines grid dimensions from dot spacing.
- Extracts cell ROIs from the center of each cell region.
- Uses LLM recognizer (Gemini) to classify each cell as empty or containing a digit 0-3.
- Validates that all cell values are in the range -1 to 3.

# Misc

## Coordinate convention

Player-entered values (transient) are keyed as `"h:row,col"` for horizontal edges and `"v:row,col"` for vertical edges. Values: `0` = empty, `1` = line drawn, `2` = cross mark. The persisted answer uses the structured `{edges: {h, v}}` format directly.
