# Pencils

**Puzzle Type ID:** 8

## Question structure description

A rectangular grid where some cells contain a number and some cells contain a pencil head icon (a directional triangle pointing up, down, left, or right). Pencil heads and numbers never coexist in the same cell. A pencil may have no numbers attached, or multiple cells with the same number forming its body.

### Canonical JSON structure

```json
{
  "cells": [
    [0, 0, 0, 0, 0, 0, 0],
    [0, -4, 3, 0, 0, 0, 0],
    [0, 5, 0, 0, 0, 0, 0],
    [0, 0, -1, 0, 0, 0, 0],
    [0, 0, 0, -2, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 2, 0]
  ]
}
```

- `cells`: rows x cols array of integers.
  - `0` = empty
  - Positive integers (`1`, `2`, `3`, ...) = number clue (the digit itself, no upper limit)
  - `-1` = pencil head pointing up
  - `-2` = pencil head pointing down
  - `-3` = pencil head pointing left
  - `-4` = pencil head pointing right

### Sample images

- [board-pencils.png](board-pencils.png) — small board (7x7)
- [board-pencils-medium.png](board-pencils-medium.png) — medium board (14x14)

## Answer structure description

The answer encodes three layers: trail lines between cell centers (horizontal and vertical segments), pencil heads placed by the player, and edges (internal borders drawn between cells to delineate pencil bodies).

### Canonical JSON structure

```json
{
  "trails": {
    "h": [[0, 1, 0, 0, 0, 0], ...],
    "v": [[0, 0, 0, 0, 0, 0, 0], ...]
  },
  "heads": [[0, 0, 0, 0, 14, 0, 0], ...],
  "edges": {
    "h": [[0, 1, 0, 0, 0, 0, 0], ...],
    "v": [[0, 0, 1, 0, 0, 0], ...]
  }
}
```

- `trails.h`: m x (n-1) array. `1` = horizontal trail segment between cell (r,c) and cell (r,c+1). `0` = no trail.
- `trails.v`: (m-1) x n array. `1` = vertical trail segment between cell (r,c) and cell (r+1,c). `0` = no trail.
- `heads`: m x n array. `0` = empty, `-1` = head-up, `-2` = head-down, `-3` = head-left, `-4` = head-right.
- `edges.h`: (m-1) x n array. `1` = solid horizontal edge (border) between row r and row r+1 at column c. `0` = dashed/no edge.
- `edges.v`: m x (n-1) array. `1` = solid vertical edge (border) between col c and col c+1 at row r. `0` = dashed/no edge.

## Rules

1. Draw pencils on the grid. Each pencil consists of a **head**, a **body**, and a **trail line**.
2. The pencil **head** is a directional triangle (pointing up, down, left, or right) placed in a cell.
3. The pencil **body** is a 1×n rectangle of cells extending behind the head (opposite to the direction the head points). All cells in the body that contain numbers must show the same number, and that number equals n (the body length). If the body contains no numbers, the body size is unconstrained by number clues.
4. The **trail line** starts at the pencil head cell (the tip) and extends n segments outward in orthogonal directions (may contain turns), where n equals the body length number. Each segment connects two adjacent cell centers. The trail passes through n+1 cells total (the head cell plus n additional cells). The head cell is shared between the pencil head and the trail start.
5. Trails cannot overlap — no cell may be traversed by more than one trail.
6. Trails cannot cross each other.
7. Every cell on the grid must be covered by either a pencil body, a pencil head, or a trail line.
8. Edges drawn by the player delineate pencil bodies (solid borders between body cells and non-body cells).

### Success finishing criteria

All cells are covered (every cell is part of exactly one pencil's head, body, or trail), all pencil constraints (body length = number, trail length = body length, no overlaps/crossings) are satisfied simultaneously.

## Puzzle Player

### Interactions

Three interaction modes:

1. **Edge toggle** — Click on an internal grid line to toggle it between solid black (drawn) and dashed (empty). Solid edges delineate pencil bodies.
2. **Trail draw/erase** — Drag across cells to draw a trail line between their centers. Dragging over an existing trail erases it. Trail lines are rendered in **grey** to visually distinguish them from the solid black body edges.
3. **Head placement** — Click a cell to show a popup with 4 directional options (up, down, left, right). Selecting one places a pencil head. Clicking a cell that already has a head erases it.

### Progress calculation

`(cells covered by heads + body edges + trail segments) / total cells * 100`. A cell is considered covered if it has a head, is enclosed by body edges, or has at least one trail segment touching it.

## Puzzle Editor

### Interactions

- Click a cell to cycle its value: empty → 1 → 2 → ... → 9 → head-up → head-down → head-left → head-right → empty.
- Rows/Cols resize controls to adjust grid dimensions.
- Legend: 0=empty, positive integers=number clue, -1=head-up, -2=head-down, -3=head-left, -4=head-right.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Detect the grid by identifying the outer border and internal dashed lines.
- Classify cells as empty, number, or pencil head using OCR/LLM.
- Pencil head direction determined by triangle orientation.
- Challenge: distinguishing numbers from head icons, especially at small sizes.

# Misc

## Coordinate convention

Cells are indexed as (row, col) with (0,0) at top-left. Trail segments reference the cell pair they connect. Edges reference the border between adjacent cells.
