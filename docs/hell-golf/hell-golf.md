# Hell Golf

**Puzzle Type ID:** 19

## Question structure description

A rectangular `m x n` grid of cells. The board contains three kinds of fixed features:

- **Lakes** — one or more regions of cells shaded gray and surrounded by thick borders. A ball may never *stop* on a lake cell (it may slide across one during a move).
- **Balls** — cells containing a circled positive integer. The integer is the ball's starting "power": it is the length (in cells) of the ball's first move.
- **Goals** — cells marked with the letter `H`. The number of goals always equals the number of balls.

The player must move every ball onto a goal.

### Canonical JSON structure

```json
{
  "lakes": [
    [0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
    [1, 1, 0, 0, 0, 0, 1, 1, 1, 1],
    [0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    [0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 1, 1, 0, 0]
  ],
  "balls": [
    { "r": 2, "c": 2, "n": 2 },
    { "r": 2, "c": 6, "n": 2 },
    { "r": 3, "c": 1, "n": 3 },
    { "r": 3, "c": 2, "n": 4 },
    { "r": 4, "c": 2, "n": 2 },
    { "r": 5, "c": 5, "n": 3 },
    { "r": 6, "c": 7, "n": 3 },
    { "r": 7, "c": 6, "n": 3 },
    { "r": 9, "c": 4, "n": 3 }
  ],
  "goals": [
    [0, 3], [2, 4], [2, 9], [3, 7], [4, 0],
    [6, 4], [7, 3], [9, 1], [9, 8]
  ]
}
```

- `lakes`: `height x width` array of `0`/`1`. `1` = lake cell (gray, thick-bordered), `0` = normal cell. Board dimensions are derived from this array (`height = lakes.length`, `width = lakes[0].length`).
- `balls`: list of `{ r, c, n }`. `r`,`c` are the 0-indexed row/column of the ball; `n` is the ball's starting number (`n >= 1`). Ball cells are never lakes and never goals.
- `goals`: list of `[r, c]` positions of the `H` marks. Goal cells are never lakes and never balls. `goals.length` must equal `balls.length`.

### Sample images

- [board-hell-golf.png](board-hell-golf.png) — 10x10 board, 9 balls / 9 goals
- [board-hell-golf-medium.png](board-hell-golf-medium.png) — larger board with a single ring-shaped lake

## Answer structure description

The answer records the trail each ball takes. A trail is an ordered polyline of the cells the ball *stops on*, starting at the ball's origin and ending on a goal. Each straight segment between consecutive stops is one move.

### Canonical JSON structure

```json
{
  "trails": [
    { "path": [[2, 2], [2, 4], [2, 3]] },
    { "path": [[2, 6], [4, 6], [4, 7]] }
  ]
}
```

- `trails`: list aligned by index with `balls` — `trails[i]` is the trail of `balls[i]`.
- `path`: ordered list of `[r, c]` stop cells. `path[0]` equals the ball's origin. Each later entry is the cell the ball rests on after one move. `path` may be length 1 (`[[r,c]]`) for a ball that has not moved yet.
- The segment from `path[k]` to `path[k+1]` is the `(k+1)`-th move. It must be a straight horizontal or vertical run whose length (in cells) equals `n - k` (the ball's number decreases by 1 after each move).
- The last entry `path[-1]` must be a goal cell for the puzzle to be solved.

## Rules

- Each ball must be moved onto a goal. Balls and goals are matched one-to-one: every ball ends on a distinct goal and every goal receives exactly one ball (a bijection).
- A ball with current number `k` moves in a straight line — horizontally or vertically — exactly `k` cells. After the move its number decreases by 1.
- A ball whose number has reached `0` can no longer move. A ball reaches its goal by *landing* on it; once a ball lands on a goal its trail ends (it need not spend its remaining number — any leftover moves are simply unused).
- A move may **not stop** on a lake cell, but a move **may pass through** lake cells while sliding.
- Trails may not intersect: no trail may cross or overlap itself or any other trail, and no trail may pass over (or stop on) another ball's origin or any goal other than its own destination.

### Success finishing criteria

Every ball's trail is a valid sequence of moves (each move straight, correct decreasing length, not stopping on a lake), no two trails cross or share a cell/segment, no trail passes over a ball origin or a non-destination goal, and the set of trail endpoints is exactly the set of goals (bijection between balls and goals).

## Puzzle Player

### Interactions

- **Select and move**: Click a ball to select it (it highlights, and the reachable landing cells for its current move are indicated). Click a highlighted landing cell to commit the move — an arrow is drawn from the previous stop to the new one and the ball's remaining number decrements.
- Only landing cells that are (a) exactly `k` cells away in a straight line, (b) not a lake, and (c) reachable without the sliding path or landing cell colliding with an existing trail, ball, or non-destination goal are offered.
- **Undo a move**: Click the ball (now at the head of its trail) and choose to retract, or click the previous stop, to erase the most recent segment and restore the number by 1.
- Trails render as directional arrows connecting stop cells. Each ball keeps a distinct color so overlapping regions are legible. The live number badge on a ball updates as it moves.
- Lakes render as gray, thick-bordered regions. Goals render as an `H` glyph; a goal that currently has a ball resting on it is visually marked as filled.

### Progress calculation

`(number of balls currently resting on a goal / total ball count) * 100`. A ball counts once the last cell of its trail is a goal cell. Reaches 100% only when every ball rests on a distinct goal.

## Puzzle Editor

### Interactions

- Click a cell to cycle its feature: empty → lake → goal → ball(1) → ball(2) → … Shift-click (or right-click) cycles backward for quick correction.
- While a cell shows a ball, further clicks increment the ball's number; there is no fixed upper limit.
- Rows/Cols are read-only fields determined by the JSON.
- The editor surfaces validation state: it flags when `balls.length != goals.length`, and when any cell is assigned two features at once.
- JSON textarea is the source of truth; visual edits update it bidirectionally.

## Puzzle Parser

- Detects the grid. The sample images use **dashed/dotted interior grid lines** with a solid thick outer border, so the parser uses `auto_detect_grid_lines` (auto-sweeps erode sizes to find the faint dashed rulings) rather than `detect_grid_lines`.
- Lakes are detected by gray fill: a cell whose interior is predominantly mid-gray (not white, not the near-black of borders/glyphs) is a lake. The thick borders around lakes are a visual consequence and need not be parsed separately.
- Balls are cells containing a circled digit; an OCR/LLM recognizer reads the integer. Goals are cells containing the letter `H`. A montage of non-empty cells can be classified in one pass (lake / ball+digit / goal / empty).
- Validates dimensions, that ball and goal cells are disjoint from lakes, and that the ball count equals the goal count.

# Misc

## Coordinate convention

All arrays and positions are indexed `[row][col]` (or `[r, c]`) with row 0 at the top and col 0 at the left. `lakes[r][c]` is the cell at row `r`, col `c`. Ball origins, goal positions, and trail stop cells all use the same `[r, c]` convention.
