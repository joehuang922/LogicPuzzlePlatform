# Kuralin (クラリン)

**Puzzle Type ID:** 28

## Question structure description

A grid of `height` rows × `width` columns separated by dashed lines, with a solid outer border. Scattered across the grid are **circle clues** in three colors: white (○), black (●), and gray (halftone-filled ◍). Circles never sit at a cell center — every circle lies on a grid line, at one of two kinds of positions:

- **An edge midpoint** — the circle straddles the shared edge between two orthogonally adjacent cells, so it touches **2 cells**.
- **A grid corner** — the circle sits on the corner shared by four cells, so it touches **4 cells**.

Circles never lie on the outer border. Circles may share cells: a single cell can be touched by two (or more) circles, e.g. a corner circle and an adjacent edge circle.

Positions use the same **doubled coordinate system** as Tentai Show: cell `(r, c)` (0-indexed, row `r` from top, col `c` from left) has its center at doubled coordinates `(2r+1, 2c+1)`. Consequently:

| Circle position | Parity of `(dr, dc)` | Cells touched |
| --- | --- | --- |
| Cell center | odd, odd | **not allowed** |
| Vertical edge midpoint | odd, even | `((dr-1)/2, dc/2 - 1)` and `((dr-1)/2, dc/2)` |
| Horizontal edge midpoint | even, odd | `(dr/2 - 1, (dc-1)/2)` and `(dr/2, (dc-1)/2)` |
| Grid corner | even, even | `(dr/2 - 1, dc/2 - 1)`, `(dr/2 - 1, dc/2)`, `(dr/2, dc/2 - 1)`, `(dr/2, dc/2)` |

Valid doubled coordinates satisfy `1 ≤ dr ≤ 2·height − 1`, `1 ≤ dc ≤ 2·width − 1`, and at least one of `dr`, `dc` is even. No two circles share the same `(dr, dc)`.

### Canonical JSON structure

Sample 1 (`kuralin-small.jpg`, puzzle ① — the 10×10 board, not the example at the top of the page):

```json
{
  "width": 10,
  "height": 10,
  "circles": [
    { "dr": 1,  "dc": 4,  "color": 0 },
    { "dr": 1,  "dc": 14, "color": 1 },
    { "dr": 1,  "dc": 18, "color": 0 },
    { "dr": 2,  "dc": 1,  "color": 1 },
    { "dr": 3,  "dc": 6,  "color": 1 },
    { "dr": 5,  "dc": 8,  "color": 2 },
    { "dr": 6,  "dc": 4,  "color": 1 },
    { "dr": 7,  "dc": 16, "color": 1 },
    { "dr": 8,  "dc": 8,  "color": 1 },
    { "dr": 8,  "dc": 16, "color": 2 },
    { "dr": 10, "dc": 9,  "color": 0 },
    { "dr": 10, "dc": 16, "color": 2 },
    { "dr": 12, "dc": 3,  "color": 1 },
    { "dr": 12, "dc": 10, "color": 1 },
    { "dr": 12, "dc": 14, "color": 0 },
    { "dr": 12, "dc": 18, "color": 0 },
    { "dr": 14, "dc": 3,  "color": 2 },
    { "dr": 14, "dc": 4,  "color": 1 },
    { "dr": 14, "dc": 10, "color": 2 },
    { "dr": 14, "dc": 12, "color": 2 },
    { "dr": 15, "dc": 18, "color": 2 },
    { "dr": 16, "dc": 19, "color": 1 },
    { "dr": 19, "dc": 2,  "color": 0 },
    { "dr": 19, "dc": 6,  "color": 2 }
  ]
}
```

- `width`: number of columns (positive integer).
- `height`: number of rows (positive integer).
- `circles`: list of circle clues.
  - `dr`, `dc`: doubled-grid coordinates (see table above). At least one must be even.
  - `color`: `0` = white (○), `1` = black (●), `2` = gray (◍). Unlike Tentai Show, color is semantic.

### Sample images

- [kuralin-small.jpg](kuralin-small.jpg) — 10×10 board (puzzle ①), with a small worked example + answer at the top of the page
- [kuralin-small-2.jpg](kuralin-small-2.jpg) — 10×10 board (puzzle ⑤)

## Answer structure description

Same shape as Yajilin: which cells are blackened, and which edges between cell centers form the loop.

### Canonical JSON structure

```json
{
  "blacks": [
    [0, 0, 1, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 1, 1, 0, 0, 0, 0, 0, 0]
  ],
  "edges": {
    "h": [
      [1, 0, 0, 0, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ],
    "v": [
      [1, 1, 0, 0, 1, 0, 0, 0, 0, 1]
    ]
  }
}
```

- `blacks`: `height × width` array. `1` = blackened, `2` = marked (solving aid, persisted so it survives reload; ignored by validation), `0` = neither.
- `edges.h`: `height × (width − 1)` array. `1` = loop segment between cell `(r, c)` and `(r, c+1)`.
- `edges.v`: `(height − 1) × width` array. `1` = loop segment between cell `(r, c)` and `(r+1, c)`.

## Rules

1. Draw a single closed loop through cell centers, moving horizontally or vertically (it may turn). The loop never crosses itself, branches, or passes through the same cell twice.
2. Blacken every cell the loop does not pass through. (Every cell is exactly one of: on the loop, or black.)
3. Each circle touches 2 cells (edge midpoint) or 4 cells (corner):
   - **Black circle (●)**: among the cells it touches, black cells outnumber loop (white) cells.
   - **White circle (○)**: loop (white) cells outnumber black cells.
   - **Gray circle (◍)**: black and white cells are equal in number.

A cell may be touched by more than one circle; each circle's constraint is checked independently.

### Success finishing criteria

The drawn edges form exactly one closed loop (every loop cell has exactly 2 loop edges, all loop cells connected, at least one loop cell) AND every cell is either on the loop or blackened, never both and never neither AND every circle's black/white count condition holds.

## Puzzle Player

### Interactions

Modeled on Yajilin:

- **Left-click** a cell to cycle: empty → black → marked (gray dot) → empty.
- **Right-click** a cell to cycle backward: empty → marked → black → empty.
- **Drag** across cell centers to draw/erase loop segments. If the first edge crossed was already drawn, the drag erases; otherwise it draws.
- The marked dot is a solving aid ("this cell is on the loop") and does not affect validation.

### Appearance

- Dashed interior grid lines, solid thick outer border (as in the source images and Tentai Show).
- Black cells fill with a dark shade (no rooms, so the room-shade rule doesn't apply; match Yajilin's black-cell fill).
- Loop: solid dark lines connecting cell centers.
- Circles render **on top** of cell fills and the loop, at their doubled coordinates, radius ≈ 0.25 × pitch with a dark outline: white fill (○), black fill (●), mid-gray fill (◍). The gray fill must stay distinguishable from both black cell fill and white cell background — a circle sitting over a black cell keeps its outline visible.
- No picture/thumbnail preview mode (Kuralin is not picture-based, unlike Tentai Show).

### Progress calculation

`(cells that are blackened or touched by at least one loop edge / total cells) * 100`.

## Puzzle Editor

### Interactions

- Click near a grid line to place/cycle a circle. The click snaps to the nearest valid doubled coordinate (edge midpoint or interior corner — cell centers and the outer border are never targets). Clicking cycles: none → white (○) → black (●) → gray (◍) → none.
- `width` / `height` inputs resize the grid, keeping circles that stay in bounds.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

### Appearance

- Same dashed grid + solid border + circle rendering as the player view.
- Only placed circles are drawn; empty candidate positions are not marked.
- No picture preview pane.

## Puzzle Parser

Implemented in `parsers/src/puzzle_parsers/kuralin/`. Circles can only sit on a known lattice (edge midpoints and interior corners), so the parser probes that lattice rather than searching the whole image:

1. **Border + warp** — `find_quadrilateral_border` → `warp_to_rectangle`. On sample 1 this picks the puzzle, not the small worked example and answer at the top of the page.
2. **Count cells** from the **dashed** grid lines (Tentai Show's `_count_cells`), then synthesize a uniform grid: `pitch = warp_size / count`.
3. **Probe every valid lattice point** `(dr, dc)` (at least one even) for a printed ring: sample the perimeter at radii 0.14–0.22 × pitch and centers within ±0.1 pitch, and accept when ≥75% of perimeter samples are inked. A dashed crossing inks only ~4 samples and never passes.
   - Why not Hough (as in Tentai Show): on sample 2 HoughCircles missed the gray circle at `(14,8)` — its halftone fill and touching dashes defeated both the gradient vote and the contour fallback — while the ring test at its known center finds it. Probing also can't produce cell-center or off-lattice positions, and touching circles (`(14,3)` / `(14,4)` in sample 1) can't merge.
4. **Classify color** by inner-disk mean (radius 0.08 × pitch) over local paper brightness: `< 0.40` → black `1`, `> 0.90` → white `0`, else gray `2`. Observed on the samples: white ≥ 0.99, gray 0.60–0.77, black ≤ 0.26.
5. **Validate** — ranges, parity (no cell centers), no duplicates, color ∈ {0,1,2}.

Accuracy metric: **circles-off** (wrong position or color). Both samples parse with 0 off (`tests/test_kuralin_parser.py` pins them).

# Misc

## Coordinate convention

- Cells are indexed `[row][col]`, row 0 at top, col 0 at left.
- Circle positions use doubled coordinates: cell `(r, c)` center is `(2r+1, 2c+1)`.
- Player-entered values (same keys as Yajilin):
  - `"b:row,col"` — cell state. `1` = black, `2` = marked (dot).
  - `"h:row,col"` — loop segment between `(row, col)` and `(row, col+1)`. `1` = drawn.
  - `"v:row,col"` — loop segment between `(row, col)` and `(row+1, col)`. `1` = drawn.
