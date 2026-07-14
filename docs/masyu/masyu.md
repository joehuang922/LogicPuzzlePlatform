# Masyu

**Puzzle Type ID:** 7

## Question structure description

A rectangular grid of cells. Some cells contain a white (hollow) circle or a black (filled) circle. Most cells are empty. The player draws a loop through cell centers.

### Canonical JSON structure

```json
{
  "cells": [
    [0, 0, 2, 2, 0, 1, 0, 0, 0, 0],
    [2, 0, 0, 0, 1, 0, 0, 2, 0, 0],
    [0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 0, 0, 2, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 2, 0, 2, 0, 2, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 2, 0, 1, 0, 0, 2],
    [1, 0, 1, 0, 2, 0, 1, 0, 1, 0]
  ]
}
```

- `cells`: rows x cols array of integers.
  - `0` = empty, `1` = white circle (hollow), `2` = black circle (filled).

### Sample images

- [board-masyu.png](masyu/board-masyu.png) — 10x10 board
- [board-masyu-medium.png](masyu/board-masyu-medium.png) — larger board (~18x18)

## Answer structure description

The answer is a set of line segments (edges) between adjacent cell centers, stored as horizontal and vertical edge arrays.

### Canonical JSON structure

```json
{
  "edges": {
    "h": [
      [0, 1, 1, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 0, 0, 0, 0],
      ...
    ],
    "v": [
      [0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      ...
    ]
  }
}
```

- `edges.h`: rows x (cols-1) array. `1` = horizontal line segment drawn between cell (row, col) and cell (row, col+1). `0` = no segment.
- `edges.v`: (rows-1) x cols array. `1` = vertical line segment drawn between cell (row, col) and cell (row+1, col). `0` = no segment.

## Rules

- Draw line segments between adjacent cell centers (horizontally or vertically) to form a single closed loop.
- The loop must not branch — every cell on the loop has exactly 2 segments connected to it.
- The loop must be connected — all segments form one continuous closed path.
- The loop must pass through every circle (white and black).
- **White circle constraint**: The line must pass straight through the white circle (no turn at that cell), but at least one of its two adjacent cells along the line must have a turn.
- **Black circle constraint**: The line must turn at the black circle (90-degree turn), and both segments leading into the turn must extend straight for at least one more cell (no turning at either immediate neighbor along the incoming directions).

### Success finishing criteria

At least one edge exists AND the edges form a single connected closed loop with no branches AND all white and black circle constraints are satisfied AND the loop passes through every circle.

## Puzzle Player

### Interactions

- Click/drag between two adjacent cell centers to toggle a line segment: empty → drawn → empty.
- Drawn segments render as solid dark lines connecting cell centers.
- Dots are displayed at each cell center for visual reference.
- White circles render as hollow circles with a dark border.
- Black circles render as filled dark circles.

### Progress calculation

`(cells that have at least one adjacent edge drawn / total cells that are part of the solution loop) * 100`. Since the solution loop length is unknown, use: `(cells with at least one edge / total cell count) * 100` as an approximation.

## Puzzle Editor

### Interactions

- Click a cell to cycle its value: empty (0) → white circle (1) → black circle (2) → empty (0).
- White circles shown as hollow circles, black circles as filled circles.
- Rows/Cols inputs allow resizing the grid (preserves existing values where possible).
- JSON textarea is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Detects the grid using image processing (finds evenly-spaced grid lines or dots).
- Determines grid dimensions from spacing.
- Extracts cell ROIs from the center of each cell.
- Uses LLM recognizer (Gemini) to classify each cell as empty, white circle, or black circle.
- Validates that all cell values are in the range 0-2.

# Misc

## Coordinate convention

Player-entered values use the edge-based format: `edges.h[row][col]` for the horizontal segment between (row, col) and (row, col+1), and `edges.v[row][col]` for the vertical segment between (row, col) and (row+1, col). Values: `0` = no segment, `1` = segment drawn.
