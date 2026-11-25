# Melon Pie (メロンパイ)

**Puzzle Type ID:** 49 (incubating)

The magazine titles it メロンパイ(仮題) — a reader-invented type (the author's working
title was マスメロン), so it is incubating.

## Question structure description

A lattice of dashed lines — **the outer boundary is dashed too**, there is no solid
border. Circle clues in three colours (white ○, gray halftone ◍, black ●) sit on **grid
points** (line crossings), including points on the outer boundary and its corners. Every
other point is plain.

### Canonical JSON structure

The rule sheet's example (4x4 cells, so 5x5 points):

```json
{
  "width": 4,
  "height": 4,
  "circles": [
    {"r": 0, "c": 0, "color": 1},
    {"r": 0, "c": 2, "color": 0},
    {"r": 1, "c": 0, "color": 2},
    {"r": 1, "c": 3, "color": 1},
    {"r": 2, "c": 0, "color": 0},
    {"r": 2, "c": 2, "color": 2},
    {"r": 4, "c": 0, "color": 1},
    {"r": 4, "c": 3, "color": 1}
  ]
}
```

- `width`, `height`: cells across and down; the points run `0..height` x `0..width`.
- `circles`: one per point at most.
  - `r`, `c`: the point's row and column, `0 ≤ r ≤ height`, `0 ≤ c ≤ width`.
  - `color`: `0` = white, `1` = black, `2` = gray (Kuralin's codes).

### Sample images

- [board-melon-pie-1.jpg](board-melon-pie-1.jpg): puzzle 1 (6x6 cells) with the example
  and its answer above (partly under a thumb) and puzzle 2 below, its bottom cut off.
- [board-melon-pie-2.jpg](board-melon-pie-2.jpg): puzzle 2 (6x6), with puzzle 1 above
  under a thumb and the top of puzzle 3 below.
- [board-melon-pie-3.jpg](board-melon-pie-3.jpg): puzzle 3 (6x6), with puzzle 2 above
  under fingers and a neighbouring page's board.
- [rule.jpg](rule.jpg): rules ①–③; [rule-example.jpg](rule-example.jpg): rule ④, the
  example and its answer.

All four boards are transcribed as `<sample>.canon.json` (`board-melon-pie-example` for
the example). Under the rules below each has exactly one solution (CP-SAT,
`<sample>.solution.json`); the example's matches the printed answer.

## Answer structure description

The line segments between neighbouring points.

### Canonical JSON structure

Answer to the example above:

```json
{
  "edges": {
    "h": [[1, 0, 1, 1], [1, 1, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [1, 0, 0, 0]],
    "v": [[0, 1, 0, 0, 1], [0, 1, 1, 1, 1], [1, 1, 0, 1, 1], [0, 1, 0, 1, 0]]
  }
}
```

- `edges.h`: `(height+1) x width`; `1` = a segment between points (r, c) and (r, c+1).
- `edges.v`: `height x (width+1)`; `1` = a segment between points (r, c) and (r+1, c).
- `2` in either = the player's × mark there (no line); kept so marks restore, ignored by
  the rules.

## Rules

1. Draw lines along the dashed lines, joining circles of the same colour in pairs.
2. A line never branches and ends only at circles. A line never passes through a point
   holding a circle: every circle is the end of exactly one line.
3. Lines may cross at a point. A crossing is a bridge: each line goes straight on to the
   opposite dashed line.
4. Through the crossings, all the lines form one connected whole.

So at a circle exactly 1 segment meets; at a plain point 0, 2 (turning or straight) or 4
(a crossing) segments meet — never 1 or 3. Each strand runs circle to circle, both the
same colour, and there are no closed loops without circles.

### Success finishing criteria

- Every circle has exactly one segment; every other point 0, 2 or 4.
- Following each strand from a circle (straight through crossings) ends at another circle
  of the same colour, and every segment lies on such a strand (no loops).
- All segments form one connected graph through shared points.

## Puzzle Player

### Interactions

- **Drag point to point** (like Masyu, on points instead of cell centres): press near a
  grid point and drag through neighbouring points; each step toggles the segment between
  them. If the first segment crossed was already drawn the drag erases, otherwise it draws.
- **Tap a segment** (no drag; the nearest segment midpoint) to cycle its mark:
  none → × (no line here) → none. A tap on a drawn segment erases it.
- **Errors: On** (`liveValidate`):
  - a circle is outlined red when it has 2+ segments, or its strand reaches a circle of
    another colour (both ends red);
  - a plain point with 1 segment is fine while drawing, but one with 3 segments, or a
    4-way point that isn't a clean crossing, is marked red.
- Rules live in `melonPieRules.ts` (`strands`, `validateMelonPie`, `brokenClues`) with
  `melonPieRules.test.ts`.

### Appearance

- Dashed grid lines everywhere, the outer boundary dashed too, as in the print; a little
  padding around the lattice so border circles fit.
- Circles on their points, about 0.4 cell across: white with a black outline, gray
  (`#9a9a9a`) with an outline, solid black. Lines are drawn under the circles, thick and
  dark, ending at the circle's edge.
- A crossing is drawn as the two straight lines over each other (no special glyph).
- × marks: small gray crosses at segment midpoints.

### Progress calculation

`(circles whose strand reaches a circle of the same colour / all circles) * 100`.

## Puzzle Editor

### Interactions

- Click near a grid point (any point, border included) to cycle its circle:
  none → white → gray → black → none.
- Add / remove a row of cells at the bottom and a column at the right.

### Format problems (hard block, also in the API's `semanticChecks`)

- A circle off the lattice (`r > height` or `c > width`).
- Two circles on one point.

### Misread warnings (overridable)

- No circles.
- A colour with an odd number of circles (it can't pair up — usually a misread colour).

### Appearance

Same as the player view without lines; the point under the pointer is highlighted and
problem points are ringed red.

## Puzzle Parser

`parsers/src/puzzle_parsers/melon_pie/`. No OCR or Gemini.

- **Board:** there is no solid border, and the photos are busy: fingers over parts of
  neighbouring boards, those boards' dashed lattices, text. Neither `find_quadrilateral_border`
  nor the shared `lattice_fit.figure_frame_image` (largest ink block) finds it — the faint
  dashes never form one block. Melon Pie gets its own locator: close the dashes along
  each direction into line strokes, find the rectangle where long horizontal and vertical
  strokes meet as a lattice (the circles on its points confirm it), and hand
  `rectify_board` a frame around it through `border_image`, as Picturesque Maze does — so
  the board is still flattened, per CLAUDE.md.
- **Points:** `find_grid_lines` on the warp gives the lattice; the outer lines are
  dashed, so the outermost lattice lines are found as lines like any other (not as a
  border).
- **Circles:** the shared ring probe and colour thresholds (`lattice_circles`, from
  Kuralin and Half-Full Paint), probing every lattice point, corners and border included.
- **Accuracy bar:** size and circles exactly right on all three samples at full, 2000 and
  1080px, pinned against the hand transcriptions; each pinned canon has a unique solution.
- Found while prototyping: `flatten._trace_lines` crashed when it traced no lines at all;
  guarded to return "can't trace" (the plain warp), as it does for too few lines.

## Android port

- **Player:** `MelonPieEngine` (extract / restore / progress / completion ported from the
  web) and `MelonPieBoard` on `ZoomableBoard`, its lattice padded by half a cell so
  border points are reachable: drag point to point with `onDrawStartPrecise` /
  `onDrawToPrecise` snapped to the nearest point, tap a segment (`onTapPrecise`) to cycle
  ×, and `liveValidate`.
- **Admin review editor** (`MelonPieAuthoring`, `MelonPieEditor`): tap near a point to
  cycle its circle none → white → gray → black, rows and columns added or removed at any
  edge (`GridEdgeControls`; circles shift with the board), and the problems list.
  `MelonPieMiniBoard` for the batch tile, framed red on problems.
- Not a picture puzzle.

# Misc

## Coordinate convention

- Points `(r, c)`, `0 ≤ r ≤ height`, `0 ≤ c ≤ width`, row 0 at the top.
- Player values: `"h:r,c"` for the segment (r, c)–(r, c+1), `"v:r,c"` for (r, c)–(r+1, c);
  value `1` = drawn, `2` = × mark. The answer `{edges: {h, v}}` holds both.
