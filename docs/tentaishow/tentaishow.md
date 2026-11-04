# Tentai Show (Spiral Galaxies)

**Puzzle Type ID:** 20

## Question structure description

A grid of `height` rows × `width` columns separated by dashed lines, with a solid outer border. Scattered across the grid are **dots** (galaxy centers). Each dot is drawn as a small circle — either an open/white circle (○) or a filled/black circle (●). A dot may sit at one of three kinds of positions:

- **A cell center** — the dot is centered inside a single cell.
- **An edge midpoint** — the dot straddles the shared edge between two orthogonally adjacent cells (a horizontal or vertical edge).
- **A grid corner** — the dot sits on the corner shared by up to four cells.

To make all three cases integer-addressable, dots are stored in a **doubled coordinate system**: a cell `(r, c)` (0-indexed, row `r` from top, col `c` from left) has its center at doubled coordinates `(2r+1, 2c+1)`. Consequently:

| Dot position | Parity of `(dr, dc)` | Meaning |
| --- | --- | --- |
| Cell center | odd, odd | center of cell `((dr-1)/2, (dc-1)/2)` |
| Vertical edge midpoint | odd, even | edge between cells `((dr-1)/2, dc/2 - 1)` and `((dr-1)/2, dc/2)` |
| Horizontal edge midpoint | even, odd | edge between cells `(dr/2 - 1, (dc-1)/2)` and `(dr/2, (dc-1)/2)` |
| Grid corner | even, even | corner shared by the four cells around `(dr/2, dc/2)` |

Interior doubled coordinates satisfy `1 ≤ dr ≤ 2·height − 1` and `1 ≤ dc ≤ 2·width − 1` (dots never lie on the outer border).

### Canonical JSON structure

```json
{
  "width": 10,
  "height": 10,
  "dots": [
    { "dr": 1, "dc": 5, "color": 0 },
    { "dr": 1, "dc": 17, "color": 1 },
    { "dr": 3, "dc": 4, "color": 0 },
    { "dr": 3, "dc": 11, "color": 1 },
    { "dr": 3, "dc": 15, "color": 1 }
  ]
}
```

- `width`: number of columns (positive integer).
- `height`: number of rows (positive integer).
- `dots`: list of galaxy centers.
  - `dr`, `dc`: doubled-grid coordinates (see table above).
  - `color`: `0` = open/white circle (○), `1` = filled/black circle (●). Color is cosmetic only — it does not affect the rules.

### Sample images

- [board-tentaishow.png](board-tentaishow.png) — 10×10 board (Easy)
- [board-tentaishow-medium.png](board-tentaishow-medium.png) — larger board (Medium)

## Answer structure description

The answer is the set of internal walls the player has drawn to divide the grid into regions (galaxies), encoded exactly like Fillomino / Double Choco edge borders.

### Canonical JSON structure

```json
{
  "edges": {
    "h": [[0, 1, 0, ...], ...],
    "v": [[1, 0, 0, ...], ...]
  }
}
```

- `edges.h`: `(height − 1) × width` array. `1` = a wall between row `r` and row `r+1` at column `c`; `0` = no wall (cells belong to the same region).
- `edges.v`: `height × (width − 1)` array. `1` = a wall between col `c` and col `c+1` at row `r`; `0` = no wall.
- Only internal edges are represented — the outer board perimeter is always an implicit wall.

The region containing each cell is derived by flood fill across edges that have no wall.

## Rules

1. Divide the entire grid into regions (galaxies) by drawing walls along cell edges.
2. Every cell belongs to exactly one region, and every region is a single orthogonally connected group of cells.
3. Each region contains **exactly one dot**, and each dot belongs to **exactly one region**.
4. Every region has **180° rotational symmetry** about its dot: for each cell in the region, the cell obtained by rotating it 180° around the dot's position is also in the region.

### Success finishing criteria

Every cell is assigned to a region AND each region contains exactly one dot AND each region is orthogonally connected AND each region is 180°-rotationally symmetric about its dot.

## Puzzle Player

### Interactions

- Click/tap an internal edge between two cells to toggle a wall: no wall → wall drawn → no wall.
- Walls render as thick solid lines between cells. The default dashed interior grid lines remain visible where no wall is drawn.
- The outer board boundary is always drawn as a thick solid line and is not interactive.
- Regions are shaded in a **two-tone checkerboard**: adjacent enclosed regions alternate between two shades (via graph 2-coloring of the region adjacency graph, falling back gracefully when a proper 2-coloring is impossible) so region boundaries are always visible. Cells not yet in a fully enclosed single-dot region are left unshaded.
- Dots render on top of the shading: open circles (○) for `color = 0`, filled circles (●) for `color = 1`, positioned at their doubled coordinates (cell center, edge midpoint, or corner).
- When a region is fully enclosed and contains exactly one dot, it may optionally be flagged (e.g. tinted) if it fails the symmetry check, to help the player.

### Progress calculation

`(cells assigned to a galaxy / total cells) * 100`. A cell counts as "assigned to a galaxy" when it lies in a fully enclosed region (bounded entirely by walls and/or the board border) that contains exactly one dot. Reaches 100% only when every cell belongs to such a region.

## Puzzle Editor

### Interactions

- Click a location to place/cycle a dot. The editor snaps clicks to the nearest valid doubled coordinate (cell center, edge midpoint, or corner). Clicking cycles: none → white dot (○) → black dot (●) → none.
- `width` / `height` inputs resize the grid (preserving dots that remain in bounds).
- JSON textarea is the source of truth; visual edits update it bidirectionally.

### Appearance

- Same dashed grid + solid border as the player view.
- Dots are drawn at their doubled coordinates; empty candidate positions are not marked (only placed dots appear).

## Puzzle Parser

Tentai Show is unusual among our puzzle types: the **question image contains no walls, numbers, or per-cell content — only dots**. So the parser never reads anything cell-by-cell. It needs exactly two things: (1) the cell counts `width` / `height`, and (2) the precise **sub-cell** position of each dot (cell center vs. edge midpoint vs. corner). Requirement (2) is the hard part and is new to this puzzle type — it demands far tighter grid geometry than "which cell is this in" parsers, because the boundary between a corner dot and an edge dot is only ±¼ pitch.

### Two concerns this design addresses

1. **First puzzle with sub-cell clues → grid geometry must be very accurate.** On an ~80px pitch, the corner/edge boundary is only ±20px. A grid origin or pitch off by ~15px flips a corner dot into an edge dot. Masyu-style half-cell slop is not tolerable here.
2. **Dots may interfere with dashed-line detection.** The existing `_detect_lines_1d` detects lines via morphological OPEN with long directional kernels (≈ `img_len/4`), so a ~32px circular blob cannot survive and cell-center dots effectively evaporate before projection; edge/corner dots merely thicken a line locally and merge harmlessly. So the existing pipeline is more robust than it first appears — but we harden it anyway (see step 3).

### Pipeline

1. **Border + warp** — shared `rectify_board`.
2. **Grid lines** — shared `find_grid_lines` (lattice fit at the autocorrelation pitch, lines followed onto the ink). Dots don't disturb it: the lattice comb fits the real pitch.
3. **Probe every lattice point for a dot** — shared `ring_probe.probe_ring` at every centre, edge midpoint and corner (`BoardGrid.point(dr, dc)`): a dot is a ring of ink at radius 0.14–0.22 pitch within ±0.1 pitch of the point, with ≥75% of perimeter samples inked. Kuralin uses the same test. It replaced HoughCircles + a contour fallback, which missed 14 of 38 dots on the Easy board (22 after JPEG compression).
4. **Colour** — inner-disk brightness over paper (`ring_probe.fill_ratio`) below 0.65 is filled. Filled halftone dots measure 0.29–0.36, open ones 0.99–1.0.
5. **Snap to doubled coordinates** through the found lines (`BoardGrid.doubled`); dedup any collisions.
6. **Validate** — coordinate ranges, parity sanity, and no duplicate `(dr, dc)`.

Measured (answer keys `board-tentaishow.canon.json`, `board-tentaishow-medium.canon.json`): 38/38 and 91/91 dots with 0 ghosts and 0 colour errors, at full size, as JPEG, and downscaled to 500 px.

### Accuracy metric for this type

The repo's border-partition metric (judge by *edges-off*) does **not** apply — the question has no edges. The analog here is **dots-off**: fraction of dots recovered at the exact `(dr, dc)` with correct `color`. Target the same "1–2 off is shippable" bar, with **corner↔edge sub-cell misclassification** weighted as the primary failure mode to watch.

### Candidate improvements (future sessions)

Parser accuracy will likely take multiple sessions to reach the bar. The following are explicitly deferred candidates, roughly in priority order:

The candidates below predate the ring probe; both answer keys now parse exactly.

- **Independent N cross-check.** Detected dot centers all land on multiples of half-pitch. Use the GCD/spacing of dot coordinates as a *second independent vote* on `rows`/`cols`, reconciled with the dashed-line count. Highest-value hardening for the dense "Medium" board, where obscured dashed lines make N-estimation the fragile link.
- **Border refinement of origin/pitch.** If the warp leaves small residual skew, refine `(x0, pitch)` by least-squares fitting detected dot centers to the nearest half-pitch lattice.
- **Sub-cell confidence flagging.** When a dot center falls within a tunable margin of the corner/edge decision boundary, log/flag it as low-confidence so review can focus on the exact cells most likely to be wrong.
- **Optional LLM assist.** If purely geometric detection plateaus below the bar, use an LLM recognizer to confirm dot presence/color per detected location (positions still come from geometry, never from the LLM).

# Misc

## Coordinate convention

- Cells are indexed `[row][col]` with row 0 at the top and col 0 at the left.
- Dot positions use **doubled coordinates**: cell `(r, c)` center is `(dr, dc) = (2r+1, 2c+1)`. Parity of `(dr, dc)` distinguishes cell centers, edge midpoints, and corners (see the structure table).
- Player-drawn walls are keyed as:
  - `"h:row,col"` — horizontal wall between row `row` and row `row+1` at col `col`. Value `1` = wall, `0` = none.
  - `"v:row,col"` — vertical wall between col `col` and col `col+1` at row `row`. Value `1` = wall, `0` = none.

## Visual rendering notes

- Grid lines are dashed (both player and editor); the outer border is a solid thick line.
- Walls are thick solid black lines between cells.
- Region shading uses two alternating shades (checkerboard 2-coloring of adjacent regions).
- Dots: open circle outline for `color = 0`, solid filled circle for `color = 1`.
