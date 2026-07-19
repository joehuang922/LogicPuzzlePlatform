# Slalom

**Puzzle Type ID:** 10

## Question structure description

A rectangular grid of cells. Some cells are black walls. Dashed segments ("gates") run along grid lines between two walls or borders. One cell contains a circled number (the start/end point of the trail), which equals the total gate count. Some gates have numbered annotations indicating the required crossing order.

### Canonical JSON structure

```json
{
  "cells": [
    [0, 1, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 1, 0],
    [0, 0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 1, 1, 0, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 1]
  ],
  "start": { "row": 0, "col": 0 },
  "gateCount": 8,
  "gates": [
    { "orientation": "v", "line": 3, "from": 0, "to": 1, "number": null },
    { "orientation": "v", "line": 3, "from": 3, "to": 4, "number": 2 },
    { "orientation": "h", "line": 4, "from": 2, "to": 4, "number": null },
    { "orientation": "v", "line": 7, "from": 0, "to": 1, "number": 3 },
    { "orientation": "v", "line": 5, "from": 4, "to": 6, "number": 5 },
    { "orientation": "v", "line": 5, "from": 7, "to": 7, "number": 5 },
    { "orientation": "h", "line": 6, "from": 3, "to": 4, "number": null },
    { "orientation": "v", "line": 1, "from": 7, "to": 7, "number": 7 }
  ]
}
```

- `cells`: rows x cols array. `0` = empty white cell, `1` = black wall.
- `start`: `{row, col}` of the circled number cell (start/end point of the trail).
- `gateCount`: total number of gates (equals the circled number).
- `gates`: array of gate objects:
  - `orientation`: `"h"` for horizontal gate (runs left-right along a horizontal grid line; trail crosses vertically) or `"v"` for vertical gate (runs top-bottom along a vertical grid line; trail crosses horizontally).
  - `line`: which grid line the gate sits on. For vertical gates: column index 0 = left border, cols = right border. For horizontal gates: row index 0 = top border, rows = bottom border.
  - `from`, `to`: range of cell positions the gate spans (inclusive). For vertical gates: row indices. For horizontal gates: column indices. Both endpoints must be walls or borders.
  - `number`: required crossing order (1-indexed), or `null` if unnumbered (order irrelevant).

### Sample images

- [board-slalom.jpg](slalom/board-slalom.jpg) — 9x9 easy board
- [board-slalom-medium.jpg](slalom/board-slalom-medium.jpg) — 15x15 medium board

## Answer structure description

The answer is a set of trail edges connecting adjacent cell centers, forming a closed loop.

### Canonical JSON structure

```json
{
  "trail": {
    "h": [
      [0, 1, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 0, 0, 0]
    ],
    "v": [
      [1, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 0, 0, 0, 0]
    ]
  }
}
```

- `trail.h`: rows x (cols-1) array. `1` = horizontal trail segment connecting cell (row, col) to cell (row, col+1). `0` = no trail.
- `trail.v`: (rows-1) x cols array. `1` = vertical trail segment connecting cell (row, col) to cell (row+1, col). `0` = no trail.

## Rules

1. Draw a single closed loop (trail) through cell centers.
2. The trail starts and ends at the circled number cell (the start cell).
3. The trail must pass through every gate exactly once, crossing perpendicularly.
4. The trail cannot touch itself (no cell is visited more than once, except the start cell which is visited exactly twice — as start and end).
5. The trail cannot run along a gate (must cross through it, not coincide with it).
6. The trail cannot pass through black wall cells.
7. Numbered gates must be crossed in the specified order: gate numbered N must be the Nth gate crossed. Since the loop has no fixed direction, either traversal direction is valid.
8. Unnumbered gates may be crossed in any order.

### Success finishing criteria

The trail forms a valid closed loop through the start cell AND crosses every gate exactly once perpendicularly AND numbered gate ordering constraints are satisfied in at least one traversal direction.

## Puzzle Player

### Interactions

- Drag between adjacent cells to draw trail segments. The trail is drawn as a solid line connecting cell centers.
- Click/tap an existing trail segment to erase it.
- Black wall cells cannot be entered.
- The start cell is highlighted (circled number displayed).
- Gates are rendered as dashed lines along grid edges.
- Numbered gates show their number adjacent to the gate with an arrow indicating which gate it labels.

### Progress calculation

`(gates crossed by the current trail / total gate count) * 100`. A gate is considered crossed if any trail segment passes through it perpendicularly (i.e., a horizontal trail edge crosses a vertical gate, or a vertical trail edge crosses a horizontal gate, within the gate's span).

## Puzzle Editor

### Interactions

- Click a cell to toggle between empty (0) and black wall (1).
- Click the start cell position field or click a cell while in "set start" mode to place the circled number.
- Drag along a grid line between two walls/borders to create a gate (dashed line). The gate is valid only if both endpoints are walls or borders.
- Click an existing gate to select it, then assign a number (or leave unnumbered).
- Delete a gate by selecting it and pressing delete.
- JSON textarea is the source of truth; visual edits update it bidirectionally.
- Rows/Cols inputs allow resizing the grid.

## Puzzle Parser

- Detect the grid boundaries and cell size.
- Classify cells as black walls or empty using pixel intensity.
- Detect dashed line segments along grid lines (gates).
- Find the circled number cell (start point).
- Read numbers and arrows in cells adjacent to gates to determine gate ordering.
- Challenging: distinguishing dashed gate lines from grid lines; reading arrow directions; handling gates that span multiple cells.

# Misc

## Coordinate convention

Player-entered values are keyed as `"h:row,col"` for horizontal trail edges and `"v:row,col"` for vertical trail edges. Values: `0` = empty, `1` = trail drawn. The coordinate refers to the edge starting at cell (row, col) going right (for h) or down (for v).
