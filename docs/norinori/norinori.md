# Norinori

**Puzzle Type ID:** 23

## Question structure description

A rectangular grid that is pre-divided into regions (rooms). Region boundaries are drawn as thick solid lines; the thin internal grid lines (which subdivide a region into individual cells) are lighter solid lines. There are no numbers or other symbols — the only given information is the region partition. The player shades cells so that every region contains exactly two shaded cells and every shaded cell forms a domino with exactly one orthogonally-adjacent shaded cell.

The partition is encoded the same way as LITS and Nurimaze: as thick internal border edges. Rooms are the connected components of cells that are not separated by a thick border. Norinori carries no per-cell symbols.

### Canonical JSON structure

```json
{
  "grids": {
    "h": [[1, 0, 0, 1, 0], [0, 1, 1, 0, 0], [1, 1, 0, 0, 1], [0, 0, 1, 1, 0]],
    "v": [[0, 1, 0, 0], [1, 0, 0, 1], [0, 0, 1, 0], [1, 1, 0, 0], [0, 0, 1, 1]]
  }
}
```

- `grids.h`: (rows-1) x cols array. `1` = thick horizontal border between row r and row r+1 at column c. `0` = thin/no border.
- `grids.v`: rows x (cols-1) array. `1` = thick vertical border between col c and col c+1 at row r. `0` = thin/no border.

Rooms (regions) are defined by connected components of cells separated by thick borders — identical convention to LITS, minus any per-cell symbol array. The board's outer perimeter is always an implicit thick boundary.

### Sample images

- [board-norinori.png](board-norinori.png) — 10x10 board (Easy)
- [board-norinori-medium.png](board-norinori-medium.png) — 10x18 board (Easy)

## Answer structure description

The answer is the shading state of every cell: which cells are filled black.

### Canonical JSON structure

```json
{
  "shaded": [
    [1, 1, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [1, 0, 1, 0, 0],
    [1, 0, 1, 0, 1],
    [0, 0, 0, 0, 1]
  ]
}
```

- `shaded`: rows x cols array of integers. `1` = cell is shaded (black), `0` = cell is unshaded (white). (The example above is illustrative of the format, not a verified solution.)

## Rules

- Shade cells so that **every region contains exactly two shaded cells**.
- Every shaded cell must be part of a **domino**: a group of exactly two orthogonally-adjacent shaded cells. Equivalently, each shaded cell has exactly one shaded orthogonal neighbor — no isolated shaded cells and no connected shaded group of three or more.
- Dominoes **may cross region boundaries**: the two cells of a domino can lie in two different rooms. The "exactly two per region" count and the "domino shape" constraint are independent and must both hold.

### Success finishing criteria

Every region contains exactly two shaded cells AND every shaded cell has exactly one orthogonally-adjacent shaded cell (so all shaded cells partition into dominoes).

## Puzzle Player

### Interactions

- Each cell has three states: unshaded (white), shaded (black), and marked (a centered dot). "Marked" is a solver aid that counts as **not** shaded — it lets the player note a cell they believe stays white.
- Left click cycles a cell forward: empty → black → marked → empty. Right click cycles backward: empty → marked → black → empty. There is no drag-paint; each click flips a single cell.
- Region boundaries are drawn as thick solid lines and are read-only. The thin internal grid lines remain visible so cells can be distinguished within a region.
- Shaded cells are filled black; marked cells show a small centered dot; unshaded cells stay white. The mark is a player-only aid and is never persisted into the canonical `shaded` answer (marked cells serialize as `0`).

### Progress calculation

`(regions containing exactly two shaded cells / total number of regions) * 100`. For each region, the shaded cells within it are counted: a region counts toward progress when it holds exactly two shaded cells. Marked cells do not count as shaded. This metric reflects Norinori's per-region "exactly two" structure.

## Puzzle Editor

A simplified version of the Nurimaze / LITS editor: same thick-border room-drawing, with no cell symbols to place (Norinori regions carry no numbers or markers).

### Interactions

- Click a border (edge) between two cells to toggle it between thick (room boundary) and thin (same room). This is the only editable data.
- Rows/Cols inputs allow resizing the grid (preserves existing borders where possible).
- Thick borders render as solid bold lines; thin borders remain light. Rooms are the cells enclosed by thick borders.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Region boundaries and internal grid lines are both solid **by design**, but real scans degrade the thin internal lines into faint, broken segments. The parser therefore uses `auto_detect_grid_lines` (auto-sweeps erode sizes for optimal detection) rather than the crisp-line `detect_grid_lines`, matching the shikaku/tentaishow scan character.
- Detects the outer grid geometry and determines dimensions from the thin internal line spacing. Cells are square, so square-cell reconciliation (`cell = min(h_cell, v_cell)`, derive both counts) guards against an under-detected axis collapsing the row/column count.
- Distinguishes thick region-boundary lines from thin cell-divider lines by line weight (thickness), producing the `grids.h` / `grids.v` thick-border arrays — same border-classification approach as LITS / Nurimaze.
- No OCR is required — there are no numbers or symbols in the puzzle.
- Validates that `grids.h` and `grids.v` are integer 0/1 arrays with the correct (rows-1)xcols and rowsx(cols-1) shapes.
- **Accuracy bar:** judged by fraction of internal edges classified correctly (edges-off), not by whether every detected region is a valid room. A result 1–2 edges off on a real scan is shippable; the editor's edge-toggle covers the remaining misses. Thresholds are not tuned chasing a perfect partition.

# Misc

## Coordinate convention

Player-entered values are keyed as `"c:col,row"` with value `1` for a shaded (black) cell and `2` for a marked cell (solver aid). Absent or `0` = unshaded. The persisted answer uses the structured `{shaded: [...]}` grid format directly, where `1` = shaded and `0` = unshaded-or-marked (marks are not persisted).
