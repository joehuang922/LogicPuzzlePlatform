# Picturesque Maze (浮き出しメイロ)

**Puzzle Type ID:** 44

A maze printed as wall segments on an invisible square lattice. The player finds
the shortest route from the entrance (IN, ▼) to the exit (OUT, ▼); the cells of
that route, shaded, form a picture. Two publishers print it regularly (浮き出し迷路
/ ザ・浮き出しメイロ), so it is **not** incubating.

## Question structure description

A `height` × `width` grid of square cells. No grid lines are printed: only the
**walls** are drawn, each exactly one cell edge long, so every wall lies on an edge
of the lattice. The outer border is a wall everywhere except two gaps: the
**entrance** and the **exit**, each one cell wide, marked outside the board by a ▼
(with or without IN / OUT labels).

The maze need not be a "perfect" maze (a spanning tree): the instructions ask for
the *shortest* route, so passages may form loops. A valid question has a route from
entrance to exit, and its shortest route is unique.

### Canonical JSON structure

```json
{
  "width": 4,
  "height": 3,
  "walls": {
    "h": [
      [0, 1, 1, 0],
      [1, 0, 1, 0]
    ],
    "v": [
      [0, 1, 0],
      [0, 0, 1],
      [0, 1, 0]
    ]
  },
  "entrance": { "side": "top", "index": 0 },
  "exit": { "side": "bottom", "index": 3 }
}
```

- `width`, `height`: number of columns and rows (≥ 2 each).
- `walls.h`: `(height − 1) × width`. `1` = a wall between cell `(r, c)` and `(r+1, c)`.
- `walls.v`: `height × (width − 1)`. `1` = a wall between cell `(r, c)` and `(r, c+1)`.
  (Same layout as Tentaishow's `edges`.)
- `entrance`, `exit`: an opening in the outer border. `side` is `top`, `bottom`,
  `left` or `right`; `index` is the column (top/bottom) or row (left/right) of the
  border cell it opens. The outer border is implicitly a wall everywhere else.
  Entrance and exit are different openings.

### Sample images

- [board-picturesque-maze-1.jpg](board-picturesque-maze-1.jpg): blue ink, IN/OUT labels (scan).
- [board-picturesque-maze-1-photo.jpg](board-picturesque-maze-1-photo.jpg): the same page as a hand-held phone photo (curved page, thumb over the left edge).
- [board-picturesque-maze-2.jpg](board-picturesque-maze-2.jpg): second publisher, black ink, ▼ markers only, a neighbouring puzzle above the board.
- [board-picturesque-maze-3.jpg](board-picturesque-maze-3.jpg): second publisher, a large rectangular board (much denser lattice).

## Answer structure description

The route is a single path through cell centres, stored as segments between
adjacent cells (same encoding as Picto Link's `edges`). The path starts at the
entrance cell; the exit is reached when the path's far end is the exit cell.

### Canonical JSON structure

```json
{
  "edges": {
    "h": [[1, 0, 0], [0, 0, 0], [0, 0, 0]],
    "v": [[1, 0, 0, 0], [0, 0, 0, 0]]
  }
}
```

- `edges.h`: `height × (width − 1)`. `1` = segment between `(r, c)` and `(r, c+1)`.
- `edges.v`: `(height − 1) × width`. `1` = segment between `(r, c)` and `(r+1, c)`.

The path cells (the picture) are the cells walked from the entrance cell along the
segments. Cells not on the path stay white.

## Rules

- Enter at IN and leave at OUT, moving between orthogonally adjacent cells; walls
  cannot be crossed.
- Shade the **shortest** route. Its cells form a picture.

### Success finishing criteria

The drawn path is a single non-branching path from the entrance cell to the exit
cell that crosses no wall, and its cell sequence equals the maze's shortest route
(BFS from entrance to exit; a valid question has exactly one).

## Puzzle Player

### Interactions

- **One path from IN.** The path always starts at the entrance cell. Press on the
  path's free end (or on the entrance cell when nothing is drawn) and drag through
  open passages to extend it, one adjacent cell at a time. A step through a wall is
  refused, as is a step onto a cell the path already holds.
- Dragging back onto the previous cell retracts the last step.
- Pressing on any path cell other than the end and dragging continues from there:
  the path is cut after that cell first. A tap (no drag) on a path cell cuts the path
  after it; a tap on the entrance cell clears the whole path.
- Long boards (e.g. 60 × 90): the web board scrolls; on Android two fingers pan/zoom
  as on every `ZoomableBoard`, one finger draws.
- **Errors: On** (`liveValidate`): if the path's end sits in a dead end (a non-exit
  cell with no open side other than the one the path came in by), the end cell is
  outlined red. Reveals nothing about the route that the walls don't already show.
- On Android the same drag (one finger) extends/retracts, a tap cuts.

### Appearance

- White cells, no grid lines. Walls are dark (`#222`) lines about 0.12 cell thick
  with square caps, so adjacent wall segments meet cleanly; the outer border is the
  same weight. Small ▼ markers sit outside the entrance and exit openings.
- Path cells are shaded mid-dark gray (`#6b6b6b`) so the picture builds on the
  board as the player goes, while walls (`#222`) stay readable across a shaded run.
  A thin light line through cell centres shows the path's order and its end. (The
  board has walls but no rooms, so the CLAUDE.md room-shade rule doesn't apply.)
- **Preview panel** (not readonly): the picture so far, path cells black on
  `#d9d9d9`, cells 3–8 px, ~160 px max, like Picto Link.
- **Solved thumbnail (Android):** `renderThumbnail` draws the solution route's cells
  black on white, so a completed puzzle shows its picture in the collection.

### Progress calculation

**Path length, no hint.** `min(path cells / solution cells, 0.99) * 100`, and `100`
once solved. A wrong path can be longer than the solution, so the bar caps at 99
until the route is right. It never says whether the path is on the right track.

## Puzzle Editor

### Interactions

- **Click an edge** between two cells to toggle its wall (the click snaps to the
  nearest interior edge).
- **Click an outer border edge** to move an opening there: plain click sets the
  entrance, shift-click (or right-click) sets the exit.
- Width / Height inputs resize the grid, keeping walls that still fit; openings that
  fall off are moved to index 0 of their side.
- **Format problems** (block saving; the API's `semanticChecks` rejects them too):
  entrance and exit coincide; no route from entrance to exit; the shortest route is
  not unique. The first shows on the border; the others list the problem (for a tie,
  the cells where the shortest routes part are marked).
- **Show route** toggle: overlays the computed shortest route, the quickest way to
  eyeball the picture (and spot a misread wall) after parsing.
- The modal's JSON textarea is the source of truth; the editor emits on every edit.

### Appearance

- Same as the player board, no path; walls under the pointer highlight.

## Puzzle Parser

`parsers/src/puzzle_parsers/picturesque_maze/`. No OCR. One parser for both
publishers.

- **Board:** the outer border is a heavy, clean rectangle, so the shared
  `rectify_board` (which flattens) finds it. The interior lines are sparse, so the
  flatten trace may fall back to the four-corner warp; that is expected.
- **Ink:** blue (publisher 1) or black (publisher 2): work on the channel with the
  most ink contrast (the minimum of R, G, B), not plain gray.
- **Lattice:** there are no grid lines to find. The pitch comes from the wall ink:
  every wall endpoint lies on a lattice point, so the projection profiles of the
  binarised walls (and their autocorrelation) have a strong period. The cell count
  per side is board size / period, snapped to a whole number and checked against
  both axes. Sample 1 is roughly 46 × 46 cells, sample 2 about 40 × 40, sample 3
  roughly 50 × 80.
- **Walls:** each interior edge is sampled along a thin strip (excluding the
  lattice-point ends, where perpendicular walls meet): ink coverage near 1 is a
  wall, near 0 is open. This is present / absent, not thick / thin, so it doesn't
  go through `classify_border_thickness` (that expects every edge to carry a line).
- **Openings:** the two border edges with no ink are the entrance and exit. Which is
  which: the one labelled IN, else the top/left one is the entrance. Direction does
  not change the route, only where the player starts.
- **Check:** BFS from entrance to exit must reach the exit with a unique shortest
  route. When the maze has no loops (open edges = W·H − 1 and connected), it is a
  perfect maze and any misread edge shows up as a cycle or a cut-off region; the
  parser reports it and the review fixes it.
- **Risks:** the dense lattice (sample 3) at Android upload size (2000 px long side)
  leaves about 20 px per cell, still enough for wall strips. A curved phone photo
  shifts edges by fractions of a cell across ~50 cells; the flattened warp has to
  keep the lattice within ~0.25 cell.

# Misc

## Coordinate convention

- Cells are `(row, col)`, row 0 at the top, col 0 at the left.
- `walls.h[r][c]` is the wall below cell `(r, c)`; `walls.v[r][c]` is the wall to the
  right of cell `(r, c)`.
- Answer `edges.h[r][c]` joins `(r, c)`–`(r, c+1)`; `edges.v[r][c]` joins
  `(r, c)`–`(r+1, c)`. Player values are keyed `h:r,c` / `v:r,c` with value `1`, as in
  Picto Link, so answers sync between web and Android.

## Android port

- **Player:** `PicturesqueMazeEngine` (same keys, progress and completion check as
  web) and `PicturesqueMazeBoard` on `ZoomableBoard`: one-finger drag extends or
  retracts the path from its end, a tap cuts it after the tapped cell, two fingers
  pan/zoom. `PicturePreview` above the board shows the path cells;
  `renderThumbnail` returns the solved route's cells.
- **Admin review** (`PicturesqueMazeAuthoring`, `PicturesqueMazeEditor`): tap an
  interior edge to toggle a wall, tap a border edge to move the entrance (Exit mode
  chip to move the exit instead), a Route toggle overlays the shortest route, and
  rows/columns are added or removed at the bottom/right. Format problems as on web
  (same openings, no route, tied shortest routes); misread warning: "Not a perfect
  maze" (loops present) stays overridable, since loops are legal but on these
  publishers usually mean a dropped wall.
