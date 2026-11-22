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
- [board-slitherlink-gakken-10x10.jpg](slitherlink/board-slitherlink-gakken-10x10.jpg) — Gakken style (dashed lines, no dots), beside a neighbouring puzzle
- [board-slitherlink-gakken-15x20.jpg](slitherlink/board-slitherlink-gakken-15x20.jpg) — Gakken style, with the next puzzle just below
- [board-slitherlink-gakken-40x35.jpg](slitherlink/board-slitherlink-gakken-40x35.jpg) — Gakken style, 40x35 on a curved page

Each Gakken sample has a `.canon.json` beside it (the 40x35 one is the parser's
EasyOCR read, identical at full size and 2000px, checked by eye).

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

`(cells which have at least one adjacent edge that is not empty / total cell count) * 100`. Each cell has 4 surrounding edges (top, bottom, left, right). If any of those edges has a non-empty state (line = 1 or cross = 2), that cell counts as having progress.

## Puzzle Editor

### Interactions

- Click a cell to cycle its value: empty (-1) → 0 → 1 → 2 → 3 → empty (-1).
- Cells with a number get a light blue background highlight.
- Rows/Cols inputs allow resizing the grid (preserves existing values where possible).
- Dots displayed at intersections for visual reference.

## Puzzle Parser

Two page styles share one parser (type 5); the detector picks the style from the page:

- **Dot lattice** (most sources): a dot at every vertex. Dots are found as round
  blobs and fitted to a lattice that follows a curved page.
- **Dashed lines** (Gakken): thin dashed grid lines, outer border included, and no
  dots. Used when the page has no well-supported dot lattice (a dot page has a dot
  at 100% of its nodes; a dashed page yields none). The line crossings stand in for
  the dots: the page is levelled and scaled to ~80px cells, digits are erased, the
  dashes are joined into lines, and their crossings feed the same lattice fit. The
  board is then the longest run of lines joined by dashed edges, which excludes a
  neighbouring puzzle a fraction of a cell away (`slitherlink/dashed_lattice.py`).

Either way the result is the grid of vertex positions; each cell's centre crop is
read with EasyOCR (`cell_ocr.read_cells`, single digits 0-3), empty cells are -1.

# Misc

## Coordinate convention

Player-entered values (transient) are keyed as `"h:row,col"` for horizontal edges and `"v:row,col"` for vertical edges. Values: `0` = empty, `1` = line drawn, `2` = cross mark. The persisted answer uses the structured `{edges: {h, v}}` format directly.
