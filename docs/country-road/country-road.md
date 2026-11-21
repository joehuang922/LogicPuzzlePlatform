# Country Road

**Puzzle Type ID:** 41

Japanese name: カントリーロード (Nikoli). Not incubating. Not a picture puzzle.

## Question structure description

A rectangular grid divided into **rooms** by thick walls. Rooms have any shape. Some
rooms hold one number, printed in one of their cells (usually the top-left one).
Thin solid grid lines, thick walls and a thick border.

### Canonical JSON structure

```json
{
  "cells": [
    [3, 0, 0],
    [0, 0, 0],
    [0, 0, 3]
  ],
  "grids": {
    "h": [[0, 0, 1], [1, 1, 0]],
    "v": [[0, 1], [0, 1], [1, 0]]
  }
}
```

Four rooms: the top-left 2x2 block (number 3), the top-right cell, the L of the
three bottom-right cells (number 3) and the bottom-left cell. The answer below solves it.

- `cells`: rows x cols. `0` = no number; `N >= 1` = the room's number, in the cell where
  it is printed.
- `grids.h`: (rows-1) x cols. `h[r][c] = 1` when a wall lies between cell `(r, c)` and
  `(r+1, c)`.
- `grids.v`: rows x (cols-1). `v[r][c] = 1` when a wall lies between cell `(r, c)` and
  `(r, c+1)`.
- Rooms are the connected components of cells joined across `0` edges; the board's
  outer perimeter is always a wall. Same shape as Nuritwin's canon.

### Sample images

- [board-country-road.jpg](board-country-road.jpg) — 10x10, the top of another board below it
- [board-country-road-2.jpg](board-country-road-2.jpg) — 10x10, the bottom of another board above it
- [board-country-road-3.jpg](board-country-road-3.jpg) — 10x10, only 5s, the bottom of sample 1 above it

## Answer structure description

The loop's segments between neighbouring cell centres (as Masyu, L-Ring), plus the
player's cell marks.

### Canonical JSON structure

```json
{
  "edges": {
    "h": [[1, 1], [0, 0], [1, 1]],
    "v": [[1, 0, 1], [1, 0, 1]]
  },
  "marks": [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0]
  ]
}
```

- `edges.h`: rows x (cols-1). `1` = a segment between `(r, c)` and `(r, c+1)`.
- `edges.v`: (rows-1) x cols. `1` = a segment between `(r, c)` and `(r+1, c)`.
The loop runs round the outer ring, leaving the centre cell (marked ×) unused.

- `marks`: rows x cols. `0` none, `1` = × (the loop skips this cell), `2` = • (the loop
  uses it). Solving aids only: persisted so they survive reload, ignored by validation.

## Rules

1. Draw one closed loop through cell centres, moving horizontally and vertically. It
   never crosses or branches, and need not visit every cell.
2. The loop passes through every room exactly once: it enters each room once and leaves
   it once.
3. A number in a room gives how many of that room's cells the loop passes through.
4. Two cells the loop doesn't use may not be orthogonally adjacent across a room wall.

### Success finishing criteria

The drawn segments form exactly one closed loop (every used cell has two segments, all
connected), every room is visited by one contiguous stretch of the loop (two segments
cross its walls), every number equals its room's loop cells, and no two unused cells
touch across a wall.

## Puzzle Player

### Interactions

- **Drag to draw/erase** (like Masyu / L-Ring): press on a cell and drag through
  neighbouring cells. If the first edge crossed was already drawn, the drag erases;
  otherwise it draws.
- **Tap** a cell (no drag) to cycle its mark: none → × (unused) → • (used) → none.
  Right-click cycles backwards on the web.
- **Errors: On** (`liveValidate`):
  - a room number turns red when its room already has more loop cells than the
    number, or when the loop's stretch through the room is closed off (it has
    entered and left) with a different count;
  - a room whose walls the loop crosses more than twice is outlined red;
  - two × cells touching across a wall are drawn red.
- Android: the same drag; taps cycle the mark through the shared shade/mark cycle
  (`ShadeMarkEngine`, × as "shaded", • as "marked"; key `m:row,col`).

### Appearance

- Thin solid grid lines, thick walls and border, as in the print.
- Numbers in the cell where printed, top-left aligned like the print.
- Loop: a thick dark stroke between cell centres, on top.
- × and • marks in gray, under the loop.

### Progress calculation

`(cells decided / total cells) * 100`, where a cell is decided when a loop segment
touches it or it carries a mark (× or •).

## Puzzle Editor

### Interactions

Mode chips above the board:

- **Walls**: click near a cell edge to toggle the wall there.
- **Numbers**: click a cell to select it and type its number (blank = none).
- Add / remove a row at the bottom and a column at the right.
- Walls are edited freely; nothing is refused or auto-fixed.

### Format problems (hard block, also in the API's `semanticChecks`)

- `cells`, `grids.h` and `grids.v` don't have matching dimensions.
- A wall that doesn't close off a room (both sides still in the same room).
- Two numbers in one room.

### Misread warnings (overridable)

- A number larger than its room.
- Only one room.

### Appearance

Same as the player view, with no loop; the selected cell is highlighted in Numbers mode
and the edge under the pointer in Walls mode. Problem cells are outlined red.

## Puzzle Parser

`parsers/src/puzzle_parsers/country_road/`.

- **Board and grid:** the shared `rectify_board` (which flattens) and `find_grid_lines`.
  Every sample also shows part of a neighbouring board; the complete one is picked.
- **Walls:** `grid_utils.classify_border_thickness`.
- **Numbers:** plain digits in cells, read with EasyOCR through
  `cell_ocr.read_grid_clues` (`allow_multi_digits=True`, no 0: every room is visited).
  A room with two reads keeps the top-left one.
- Each sample's parse is hand-checked, pinned as `docs/country-road/<sample>.canon.json`
  at full and Android size, and solved with CP-SAT to confirm a unique solution.

## Android port

- **Player:** `CountryRoadEngine` (extract / restore / progress / completion ported from
  the web; `ShadeMarkEngine` for the marks), `CountryRoadBoard` on `ZoomableBoard` with
  Masyu's drag for the loop, taps for marks, and `liveValidate`.
- **Admin review editor** (`CountryRoadAuthoring`, `CountryRoadEditor`): mode chips
  **Walls** (tap a line to toggle its wall) and **Numbers** (tap a cell, type its number,
  blank = none), add / remove row and column at the bottom / right, and the problems
  list. `CountryRoadMiniBoard` for the batch tile, framed red on problems.

# Misc

## Coordinate convention

- Cells are indexed `[row][col]`, row 0 at the top.
- Player values:
  - `"h:row,col"`: loop segment between `(row, col)` and `(row, col+1)`; `1` = drawn.
  - `"v:row,col"`: loop segment between `(row, col)` and `(row+1, col)`; `1` = drawn.
  - `"m:row,col"`: cell mark; `1` = ×, `2` = •.
