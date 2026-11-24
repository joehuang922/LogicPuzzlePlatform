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
      [0, 1, 0, 0],
      [0, 1, 1, 0]
    ],
    "v": [
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 1]
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
    "h": [[0, 0, 1], [1, 1, 0], [0, 0, 0]],
    "v": [[1, 0, 1, 1], [0, 0, 0, 1]]
  }
}
```

This is the solution of the question example: (0,0) → (1,0) → (1,1) → (1,2) →
(0,2) → (0,3) → (1,3) → (2,3), out through the bottom of column 3.

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
- **Trial interaction.** On a phone a finger covers several cells of a dense maze, so
  the walls it is steering around are hidden. Mitigations built in: a drag step goes
  to the open neighbour nearest the finger's direction (a wall never makes the path
  jump sideways), and the board can be zoomed. If it still feels clumsy we'll swap the
  interaction (e.g. tap a cell to extend the path to it along the corridor); the
  stored answer (path edges) doesn't depend on how it was drawn.

### Appearance

- White cells, no grid lines. Walls are dark (`#222`) lines about 0.12 cell thick
  with square caps, so adjacent wall segments meet cleanly; the outer border is the
  same weight. Small ▼ markers sit outside the entrance and exit openings.
- Path cells are shaded with the shared `ROOM_SHADE` (`BoardColors.ROOM_SHADE` on
  Android) so the picture builds on the board as the player goes, while the walls
  (`#222`) stay readable across a shaded run. A thin white line through cell centres
  shows the path's order and its end.
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
- **Misread warning** (overridable): "Not a perfect maze": open passages form loops;
  each loop's cells are marked orange.
- **Show route** toggle: overlays the computed shortest route, the quickest way to
  eyeball the picture (and spot a misread wall) after parsing.
- The modal's JSON textarea is the source of truth; the editor emits on every edit.

### Appearance

- Same as the player board, no path; walls under the pointer highlight.

## Puzzle Parser

`parsers/src/puzzle_parsers/picturesque_maze/` (design notes and measurements in
`grid_detector.py`). No OCR. One parser for both publishers.

- **Board:** the border's entrance/exit gaps keep its contour open, so the shared
  border finder alone picks the page or a title block. The maze is found as the
  largest block of ink with one-cell gaps closed; its bounding box, grown by a small
  margin, goes to `rectify_board` as the `border_image` (as Picto Link does), so a
  border bowed by a curled page stays inside the warp. `flatten_board` can't trace a
  maze's lines (they break every cell), so it returns the four-corner warp and the
  lattice fit below follows the curl.
- **Ink:** channel minimum (`ink_intensity`), so blue and black ink read alike.
- **Lattice:** no grid lines are printed. The pitch is the period of the wall strokes.
  Per window of 8 cells, the outer border lines are found at the edge of the maze's
  ink footprint (page rules and ▼ markers outside it can't pass for the border), and
  the lines between are placed by dynamic programming: each step within 20% of a
  cell, landing on the most wall ink; the cell count is the one that fits best.
  Cells aren't evenly spaced on a curled page (evenly spaced lines read 56 columns
  instead of 57).
- **Walls:** each edge's ink contrast against the local paper (glare dims both).
  Walls and openings sit an order of magnitude apart; the uncertain edges between are
  settled by the structure: these publishers print perfect mazes, so an uncertain edge
  opens only if it joins two parts not yet connected.
- **Openings:** the two weakest border edges; the entrance is the top-most, then
  left-most.
- **"Not a perfect maze" warning, everywhere:** loops and sealed cells are legal but on
  these publishers mean a misread wall. The parser logs them, and the web editor and
  the Android review show an overridable warning with the cells marked.
- **Accuracy:** the three scans read as perfect mazes (unique route, no loops, every
  cell reachable) at full size and at 2000 px: 57x57, 50x50 and 120x80. Their routes
  draw a panda, two dice and a samurai; the canons are pinned in
  `board-picturesque-maze-{1,2,3}.canon.json`. The phone photo of sample 1 reads the
  same maze to within one wall (glare), leaving one loop for the review to flag.

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
