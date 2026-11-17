# Zebra Rope (シマシマロープ)

**Puzzle Type ID:** 36

## Question structure description

A rectangular grid of `height` rows × `width` columns with thin solid grid lines and a thick solid outer border. Cells carry no content of their own. Two kinds of clues are printed over the grid:

- **Ropes** — gray polylines that run from cell centre to cell centre, horizontally, vertically or diagonally (45°). A rope "passes through" exactly the cells whose centres it visits. A diagonal step crosses the corner shared by four cells, but only the two cells it joins are passed; the other two cells at that corner are not. Ropes may cross each other (diagonals crossing at a corner, or two ropes passing through the same cell).
- **Circles** — small circles sitting on a grid corner or on the midpoint of an edge between two cells, in one of three colours: white, gray or black. A circle's **neighbouring cells** are the cells that touch its point: 2 cells for an edge midpoint, 4 for a corner. Circles never sit on the outer border.

Because every rope bend lands on a cell centre, a rope is stored as the ordered list of cells it passes through, each consecutive pair being 8-neighbours (king-adjacent). Circles use the doubled coordinate system of Tentaishow: cell `(r, c)` has its centre at `(dr, dc) = (2r+1, 2c+1)`.

| Circle position | Parity of `(dr, dc)` | Neighbouring cells |
| --- | --- | --- |
| Vertical edge midpoint | odd, even | `((dr-1)/2, dc/2 - 1)` and `((dr-1)/2, dc/2)` |
| Horizontal edge midpoint | even, odd | `(dr/2 - 1, (dc-1)/2)` and `(dr/2, (dc-1)/2)` |
| Grid corner | even, even | the four cells `(dr/2 - 1 \| dr/2, dc/2 - 1 \| dc/2)` |

Cell centres (odd, odd) never hold a circle.

### Canonical JSON structure

```json
{
  "width": 10,
  "height": 10,
  "ropes": [
    [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1]],
    [[0, 9], [1, 8], [1, 9]]
  ],
  "circles": [
    { "dr": 1, "dc": 6, "color": 0 },
    { "dr": 2, "dc": 9, "color": 1 },
    { "dr": 9, "dc": 2, "color": 2 }
  ]
}
```

- `width`, `height`: positive integers.
- `ropes`: list of ropes. Each rope is a list of `[row, col]` cells, at least 2 long, in drawing order. Consecutive cells differ by at most 1 in each coordinate (and are not equal). A rope never visits the same cell twice.
- `circles`: list of circle clues.
  - `dr`, `dc`: doubled coordinates on an interior grid line, `1 ≤ dr ≤ 2·height − 1`, `1 ≤ dc ≤ 2·width − 1`, not both odd.
  - `color`: `0` = white (unshaded cells are the majority of its neighbours), `1` = black (shaded cells are the majority), `2` = gray (equal numbers). Same encoding as Kuralin.
- No two circles share a `(dr, dc)`.

### Sample images

- [board-zebra-rope-1.jpg](board-zebra-rope-1.jpg): 10×10 board, puzzle ① (the top of puzzle ② is also visible).
- [board-zebra-rope-2.jpg](board-zebra-rope-2.jpg): 10×10 board, puzzle ② (the bottom of puzzle ① and a maze are also visible).

## Answer structure description

The answer is the shading state of every cell.

### Canonical JSON structure

```json
{
  "states": [
    [1, 0, 2, 0, 1, 0, 0, 1, 0, 0],
    ...
  ]
}
```

- `states`: `height × width` array. `0` = unset, `1` = shaded, `2` = marked unshaded (a solver aid). For checking, `0` and `2` both count as unshaded.

## Rules

1. Shade some cells of the board.
2. **Circles:** a white circle means unshaded cells outnumber shaded cells among its neighbouring cells; a black circle means shaded cells outnumber unshaded ones; a gray circle means they are equal.
3. **Ropes:** the cells a rope passes through are either all unshaded, all shaded, or alternate shaded / unshaded along the rope.
4. A rope crossing a cell corner diagonally passes only the two cells it joins, not the other cells sharing that corner.

### Success finishing criteria

With every cell read as shaded (`1`) or unshaded (`0`/`2`): every circle's majority condition holds, and every rope's cell sequence is all-shaded, all-unshaded, or strictly alternating.

## Puzzle Player

### Interactions

- Same as Nurikabe: left click cycles a cell empty → shaded → marked → empty; right click cycles backwards. No drag-paint. Every cell is clickable (there are no fixed cells).
- **Marked** cells are filled light yellow instead of showing a dot, because the ropes and circles make dots hard to see.
- On Android, the engine implements `ShadeMarkEngine` and the board's `onTapCell` goes to `vm::tapShadeCell` (tap cycles empty → shaded → marked → empty).
- Android admin review (`ZebraRopeAuthoring`, `ZebraRopeEditor`): Circles mode taps a grid line or corner to cycle its circle (white → gray → black → none); Ropes mode drags through cells to draw a rope (8-neighbour steps, joining a cell within 0.35 of its centre) and taps a rope to delete it; rows and columns are added or removed at the edge.

### Appearance

- Thin solid grid lines, thick outer border.
- Layers, bottom to top: cell fills (shaded dark, marked light yellow), grid lines, ropes, circles.
- Ropes are drawn as the printed style: a wide mid-gray band with a thin dark outline, round joins, running through cell centres.
- Circles are about 0.3 cell in diameter with a black outline: white fill, gray fill, or solid black. They get a thin white halo so a black circle stays visible on a shaded cell.
- **Preview panel**, as in Nonogram: a small thumbnail above the board with shaded cells black, marked (unshaded) cells white and undecided cells light gray, so the emerging picture reads at a glance.
- **Solved thumbnail (Android):** the engine's `renderThumbnail` uses the same colours (shaded black, marked white, the rest gray), so a completed puzzle shows its picture in the collection / type view, like Nonogram, Tentaishow and Picto-link.

### Progress calculation

`(cells assigned a state / total cells) * 100`. A cell counts once it is shaded (`1`) or marked (`2`); unset cells do not count. Same as Nurikabe, except that there are no clue cells to exclude.

## Puzzle Editor

### Interactions

- **Ropes: drag.** Press on a cell and drag through cells to draw a rope. A cell joins the rope when the pointer comes within about 0.35 cell of its centre, so dragging diagonally across a corner picks up the diagonal neighbour rather than an orthogonal one. Only king-adjacent steps are accepted. Dragging back onto the previous cell removes the last step. Releasing with at least 2 cells commits the rope.
- **Circles: click.** A click without dragging snaps to the nearest edge midpoint or grid corner and cycles none → white → gray → black → none.
- **Delete a rope:** right-click any cell on a rope to remove that rope (the last-drawn one if several pass through the cell).
- Width / Height inputs resize the grid, keeping ropes and circles that still fit and dropping the rest.
- The JSON textarea is the source of truth; visual edits update it in both directions.

### Appearance

- Same as the player view, with no shading. The rope being drawn is highlighted while dragging.

## Puzzle Parser

`parsers/src/puzzle_parsers/zebra_rope/` (design notes in `grid_detector.py`). No OCR, no room walls.

- **Board and grid:** the shared `rectify_board` (which flattens) picks the one complete bordered grid in each photo (both show part of a neighbouring puzzle), and `find_grid_lines` fits the lattice. Ropes run half a cell off the grid lines, so they don't disturb it.
- **Circles:** every edge midpoint and corner is probed with the shared `ring_probe.probe_ring` and coloured from the inner disk's brightness, with Kuralin's thresholds and codes. Ropes are printed under the circles, so the fill reads the circle's own colour. Below ~1500 px a rope crossing a solid grid line blurs into enough of a ring to pass the probe. A real circle's inside is even (paper, halftone or solid), while a line crosses a ghost's inside, so a ring whose inner disk spreads more than 0.42 (90th − 10th percentile over paper) is dropped. Measured: circles ≤ 0.37, crossings ≥ 0.45.
- **Ropes:** every 8-neighbour cell pair is tested along the segment between the centres. Each sample takes the darkest point of a short profile across the segment on the lighting-normalised image. Samples skip the middle of an orthogonal step (the grid line), the corner of a diagonal step (where two diagonals may cross) and anything within 0.24 cell of a circle. Rope steps cover 1.0; others ≤ 0.33. Steps chain into ropes: at each cell, opposite steps continue each other (a rope going straight through a crossing), and two leftover steps make a bend.
- **Accuracy:** both samples parse exactly (16 ropes and 20 or 21 circles each) at full size, at 2000 / 1500 / 1200 / 1000 / 800 px long side, and after JPEG q70 recompression. The answer keys are `board-zebra-rope-{1,2}.canon.json`. Each has a unique solution under the rules (`board-zebra-rope-{1,2}.solution.json`, found by CP-SAT), which checks the parse and the rules reading together.
- **Metric:** ropes-off (ropes whose cell list differs) plus circles-off (missing, ghost or wrong-colour circles).

# Misc

## Coordinate convention

- Cells are `[row][col]`, row 0 at the top, col 0 at the left. Ropes list cells as `[row, col]`.
- Circles use doubled coordinates `(dr, dc)` as described above.
- Player values are keyed `"col,row"` with value `1` (shaded) or `2` (marked); absent or `0` = unset. The persisted answer is the `{states: [...]}` grid, as in Nurikabe and Heyawake.
