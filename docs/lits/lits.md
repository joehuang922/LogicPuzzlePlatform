# LITS

**Puzzle Type ID:** 15

## Question structure description

A rectangular grid that is pre-divided into regions (rooms). Region boundaries are drawn as thick solid lines; the thin internal grid lines (which subdivide a region into individual cells) are lighter solid lines. There are no numbers or other symbols — the only given information is the region partition. The player shades cells so that each region contains exactly one tetromino.

The partition is encoded the same way as Nurimaze: as thick internal border edges. Rooms are the connected components of cells that are not separated by a thick border.

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

Rooms (regions) are defined by connected components of cells separated by thick borders — identical convention to Nurimaze, minus the per-cell symbol array (LITS has no symbols). The board's outer perimeter is always an implicit thick boundary.

### Sample images

- [board-lits.png](lits/board-lits.png) — 10x10 board (Easy)
- [board-lits-medium.png](lits/board-lits-medium.png) — larger board (Medium)

## Answer structure description

The answer is the shading state of every cell: which cells are filled black.

### Canonical JSON structure

```json
{
  "shaded": [
    [1, 0, 0, 0, 1],
    [1, 1, 0, 1, 1],
    [0, 1, 0, 1, 0],
    [1, 1, 0, 1, 1],
    [1, 0, 0, 0, 1]
  ]
}
```

- `shaded`: rows x cols array of integers. `1` = cell is shaded (black), `0` = cell is unshaded (white). (The example above is illustrative of the format, not a verified solution.)

## Rules

- Shade exactly four cells in every region so that they form a tetromino — one of the four shapes **L**, **I**, **T**, or **S** (rotations and reflections allowed; the square "O" tetromino is not permitted).
- All shaded cells across the whole grid must be orthogonally connected, forming a single connected group.
- No 2x2 area of the grid may be entirely shaded.
- Two tetrominoes of the same shape type (comparing shapes up to rotation and reflection) may not be orthogonally adjacent to each other, even across region boundaries. When two shaded tetrominoes touch, they must be of different types.

### Success finishing criteria

Every region contains exactly one tetromino of type L, I, T, or S AND all shaded cells are connected into a single group AND no 2x2 area is fully shaded AND no two orthogonally adjacent tetrominoes share the same shape type.

## Puzzle Player

### Interactions

- Click/tap a cell to toggle it between unshaded (white) and shaded (black). There is no drag-paint; each click flips a single cell.
- Region boundaries are drawn as thick solid lines and are read-only. The thin internal grid lines remain visible so cells can be distinguished within a region.
- Shaded cells are filled black; unshaded cells stay white.

### Progress calculation

`(regions containing exactly one valid tetromino / total number of regions) * 100`. For each region, the shaded cells within it are examined: a region counts toward progress when it holds exactly four shaded cells that are orthogonally connected and form an L, I, T, or S tetromino. This metric reflects LITS's per-region structure.

## Puzzle Editor

A simplified version of the Nurimaze editor: same thick-border room-drawing, but with no cell symbols to place (LITS regions carry no numbers or markers).

### Interactions

- Click a border (edge) between two cells to toggle it between thick (room boundary) and thin (same room). This is the only editable data.
- Rows/Cols inputs allow resizing the grid (preserves existing borders where possible).
- Thick borders render as solid bold lines; thin borders remain light. Rooms are the cells enclosed by thick borders.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Region boundaries and internal grid lines are both solid — uses `detect_grid_lines` (standard solid-line detection).
- Detects the outer grid geometry and determines dimensions from the thin internal line spacing.
- Distinguishes thick region-boundary lines from thin cell-divider lines by line weight (thickness), producing the `grids.h` / `grids.v` thick-border arrays — same border-classification approach as Nurimaze.
- No OCR is required — there are no numbers or symbols in the puzzle.
- Validates that `grids.h` and `grids.v` are integer 0/1 arrays with the correct (rows-1)xcols and rowsx(cols-1) shapes.

# Misc

## Coordinate convention

Player-entered values are keyed as `"c:col,row"` with value `1` for a shaded cell (absent or `0` = unshaded). The persisted answer uses the structured `{shaded: [...]}` grid format directly.
