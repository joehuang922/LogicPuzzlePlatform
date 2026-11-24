export interface SudokuCanon {
  // Room size, default 3x3. The board is N x N, N = room_width * room_height (<= 30).
  room_width?: number;
  room_height?: number;
  // N x N, 0 = empty, 1..N = given
  hints: number[][];
}

export interface SudokuAnswer {
  // N x N committed answers (canon hints merged with the player's entries)
  hints: number[][];
  // N x N; each cell an ascending list of candidate digits (1..N). Optional/additive:
  // absent on legacy snapshots. A cell with a committed answer carries [].
  notes?: number[][][];
}

export interface ComboSudokuSubBoard {
  x: number;
  y: number;
  hints: number[][];
}

export interface ComboSudokuCanon {
  room_width?: number;
  room_height?: number;
  subboards: ComboSudokuSubBoard[];
}

export interface NurimazeCanon {
  cells: number[][];
  grids: {
    h: number[][];
    v: number[][];
  };
}

export interface DoubleChocoCanon {
  cells: [number, number][][];
}

export interface DoubleChocoAnswer {
  grids: {
    h: number[][];
    v: number[][];
  };
}

export interface SlitherlinkCanon {
  cells: number[][];
}

export interface SlitherlinkAnswer {
  edges: {
    h: number[][];
    v: number[][];
  };
}

export interface NonogramCanon {
  rowClues: number[][];
  colClues: number[][];
}

export interface NonogramAnswer {
  cells: number[][];
}

export interface MasyuCanon {
  cells: number[][];
}

export interface MasyuAnswer {
  edges: {
    h: number[][];
    v: number[][];
  };
}

export interface PencilsCanon {
  cells: number[][];
}

export interface PencilsAnswer {
  trails: {
    h: number[][];
    v: number[][];
  };
  heads: number[][];
  edges: {
    h: number[][];
    v: number[][];
  };
}

export interface NuritwinCanon {
  cells: number[][];
  grids: {
    h: number[][];
    v: number[][];
  };
}

export interface NuritwinAnswer {
  states: number[][];
}

export interface SlalomGate {
  orientation: "h" | "v";
  line: number;
  from: number;
  to: number;
  number: number | null;
}

export interface SlalomCanon {
  cells: number[][];
  start: { row: number; col: number };
  gateCount: number;
  gates: SlalomGate[];
}

export interface SlalomAnswer {
  trail: {
    h: number[][];
    v: number[][];
  };
}

export interface ShakashakaCanon {
  cells: number[][];
}

export interface ShakashakaAnswer {
  states: number[][];
}

export type KakuroCell =
  | { type: "clue"; right?: number | null; down?: number | null }
  | { type: "empty" };

export interface KakuroCanon {
  cells: KakuroCell[][];
}

export interface KakuroAnswer {
  values: number[][];
}

export type YajilinClue = {
  dir: "up" | "down" | "left" | "right";
  num: number;
};

export interface YajilinCanon {
  cells: (YajilinClue | null)[][];
}

export interface YajilinAnswer {
  blacks: number[][];
  edges: {
    h: number[][];
    v: number[][];
  };
}

export interface FillominoCanon {
  cells: number[][];
}

export interface FillominoAnswer {
  numbers: number[][];
  edges: {
    h: number[][];
    v: number[][];
  };
}

export interface LitsCanon {
  grids: {
    h: number[][];
    v: number[][];
  };
}

export interface LitsAnswer {
  shaded: number[][];
}

export interface ChocoBananaCanon {
  cells: number[][];
}

export interface ChocoBananaAnswer {
  // rows x cols tri-state: 0 = unknown, 1 = shaded (chocolate), 2 = white-mark (banana)
  states: number[][];
}

export interface NumberLinkCanon {
  // rows x cols: 0 = empty, positive integer = numbered endpoint (each value appears twice)
  cells: number[][];
}

export interface NumberLinkAnswer {
  edges: {
    // h: rows x (cols-1) — segment between (r,c) and (r,c+1); 1 = drawn, 0 = none
    h: number[][];
    // v: (rows-1) x cols — segment between (r,c) and (r+1,c); 1 = drawn, 0 = none
    v: number[][];
  };
}

export interface AkariCanon {
  // rows x cols: -1 = white/empty, 0-4 = black wall with number, 5 = black wall no number
  cells: number[][];
}

export interface AkariAnswer {
  // rows x cols (only white cells): 0 = empty, 1 = bulb, 2 = dot/no-bulb mark
  states: number[][];
}

export interface HellGolfBall {
  r: number;
  c: number;
  n: number;
}

export interface HellGolfCanon {
  // height x width: 1 = lake cell (may not be stopped on), 0 = normal cell
  lakes: number[][];
  // balls with position (r, c) and starting number n; count equals goals.length
  balls: HellGolfBall[];
  // goal positions [r, c] (H marks); count equals balls.length
  goals: number[][];
}

export interface HellGolfAnswer {
  // aligned by index with canon.balls; each trail is an ordered list of stop cells
  // starting at the ball origin and ending on a goal
  trails: { path: number[][] }[];
}

export interface TentaishowDot {
  // doubled coordinates: cell (r, c) center is (2r+1, 2c+1).
  // parity of (dr, dc): odd/odd = cell center, odd/even = vertical edge,
  // even/odd = horizontal edge, even/even = grid corner.
  dr: number;
  dc: number;
  // 0 = open/white circle, 1 = filled/black circle (cosmetic only)
  color: number;
}

export interface TentaishowCanon {
  width: number;
  height: number;
  dots: TentaishowDot[];
}

export interface TentaishowAnswer {
  edges: {
    // h: (height-1) x width — wall between row r and row r+1 at col c; 1 = wall, 0 = none
    h: number[][];
    // v: height x (width-1) — wall between col c and col c+1 at row r; 1 = wall, 0 = none
    v: number[][];
  };
}

export interface HeyawakeRoom {
  // zero-based top-left cell of the rectangular room
  r: number;
  c: number;
  // room size in cells
  w: number;
  h: number;
  // number of black cells required in this room; null/undefined = unclued
  clue?: number | null;
}

export interface HeyawakeCanon {
  width: number;
  height: number;
  rooms: HeyawakeRoom[];
}

export interface HeyawakeAnswer {
  // height x width; 0 = unset, 1 = black, 2 = white-marked
  states: number[][];
}

export interface ShikakuCanon {
  // rows x cols; 0 = empty (no clue), positive integer = area clue
  cells: number[][];
}

export interface ShikakuRect {
  r: number; // top row (0-based)
  c: number; // left column (0-based)
  w: number; // width in columns (>= 1)
  h: number; // height in rows (>= 1)
}

export interface ShikakuAnswer {
  rects: ShikakuRect[];
}

export interface NorinoriCanon {
  grids: {
    h: number[][];
    v: number[][];
  };
}

export interface NorinoriAnswer {
  // rows x cols tri-state: 0 = empty, 1 = shaded, 2 = marked (a solver-aid dot that
  // stays unshaded). Both shaded and marked cells are substantial player input, so the
  // full grid round-trips. `shaded` is the legacy shape, still read on restore.
  states?: number[][];
  /** @deprecated legacy answers before marks were persisted; still accepted on restore. */
  shaded?: number[][];
}

export interface NurikabeCanon {
  // rows x cols; 0 = empty, positive integer = island clue (island size)
  cells: number[][];
}

export interface NurikabeAnswer {
  // rows x cols; 0 = unset, 1 = black (sea), 2 = white-marked (solver aid)
  states: number[][];
}

export interface HitoriCanon {
  // rows x cols; every cell holds a positive integer (no empty cells)
  cells: number[][];
}

export interface HitoriAnswer {
  // rows x cols; 0 = unset, 1 = shaded, 2 = marked (circled; stays unshaded)
  states: number[][];
}

export interface RippleEffectCanon {
  // rows x cols; 0 = empty, positive integer = pre-filled clue
  cells: number[][];
  // thick room borders; board perimeter is implicit
  edges: {
    h: number[][]; // (rows-1) x cols: h[r][c] = border between cell[r][c] and cell[r+1][c]
    v: number[][]; // rows x (cols-1): v[r][c] = border between cell[r][c] and cell[r][c+1]
  };
}

export interface RippleEffectAnswer {
  // rows x cols; every cell filled with a positive integer
  numbers: number[][];
}

export interface PictoLinkCanon {
  // rows x cols: 0 = empty, positive integer = clue whose value is the path length.
  // values >= 2 come in matched pairs; 1 is a standalone single cell. No upper limit.
  cells: number[][];
}

export interface PictoLinkAnswer {
  edges: {
    // h: rows x (cols-1) — segment between (r,c) and (r,c+1); 1 = drawn, 0 = none
    h: number[][];
    // v: (rows-1) x cols — segment between (r,c) and (r+1,c); 1 = drawn, 0 = none
    v: number[][];
  };
  // standalone filled cells (only ever 1-clue cells); each [row, col]
  singles: [number, number][];
}

export interface KuralinCircle {
  // doubled coordinates: cell (r, c) center is (2r+1, 2c+1). Circles sit on grid lines:
  // odd/even = vertical edge (2 cells), even/odd = horizontal edge (2 cells),
  // even/even = corner (4 cells). Never odd/odd.
  dr: number;
  dc: number;
  // 0 = white (more white cells), 1 = black (more black cells), 2 = gray (equal)
  color: number;
}

export interface KuralinCanon {
  width: number;
  height: number;
  circles: KuralinCircle[];
}

export interface KuralinAnswer {
  // height x width; 1 = blackened, 0 = not
  blacks: number[][];
  edges: {
    // h: height x (width-1) — loop segment between (r,c) and (r,c+1); 1 = drawn, 0 = none
    h: number[][];
    // v: (height-1) x width — loop segment between (r,c) and (r+1,c); 1 = drawn, 0 = none
    v: number[][];
  };
}

// Unequal sudoku (type 29). Sign codes: 0 = none, 1 = this cell smaller (< / ∧),
// 2 = this cell larger (> / ∨).
export interface UnequalSudokuCanon {
  // 9x9, 0 = empty, 1-9 = given
  hints: number[][];
  // 9x8: sign between (row, col) and (row, col + 1)
  right: number[][];
  // 8x9: sign between (row, col) and (row + 1, col)
  down: number[][];
}

export interface UnequalSudokuAnswer {
  // 9x9 committed answers (givens merged with the player's entries)
  hints: number[][];
  // 9x9 pencil-mark candidates, as in SudokuAnswer
  notes?: number[][][];
}

export interface CornerChainCanon {
  // rows x cols; 0 = empty, positive integer = size of the island containing the cell
  cells: number[][];
}

export interface CornerChainAnswer {
  // rows x cols; 0 = unset, 1 = black, 2 = white-marked (solver aid)
  states: number[][];
}

export interface SinkaminoCanon {
  // rows x cols; 0 = white, 1 = black, 2 = given square
  cells: number[][];
  // trails, each an ordered list of [row, col] cells from tail to head
  arrows: number[][][];
}

export interface SinkaminoAnswer {
  // rows x cols; 0 = unset, 1 = placed square, 2 = marked (no square)
  states: number[][];
}

export interface BalanceLinkCanon {
  // rows x cols; 0 = white, 1 = black, 10-71 = symbol (tens = shape, ones = 0 white / 1 black)
  cells: number[][];
}

export interface BalanceLinkAnswer {
  // h: rows x (cols-1), v: (rows-1) x cols; 1 = segment drawn
  edges: { h: number[][]; v: number[][] };
}

export interface LRingCanon {
  // rows x cols; 0 = empty, 1 = arrow up, 2 = right, 3 = down, 4 = left
  cells: number[][];
}

export interface LRingAnswer {
  // h: rows x (cols-1), v: (rows-1) x cols; 1 = loop segment drawn
  edges: { h: number[][]; v: number[][] };
}

/** Perfect L-Ring (type 42): L-Ring's question and answer, with one more rule. */
export type PerfectLRingCanon = LRingCanon;
export type PerfectLRingAnswer = LRingAnswer;

export interface MannequinGate2Canon {
  rows: number;
  cols: number;
  // Each line lists every cell it passes through, in order, as [row, col]; consecutive
  // cells are 8-neighbours.
  lines: number[][][];
}

export interface MannequinGate2Answer {
  // rows x cols; 1 = shaded
  shaded: number[][];
}

export interface HashiCanon {
  // rows x cols lattice points; 0 = no island, 1-8 = an island with that number
  cells: number[][];
}

export interface HashiAnswer {
  // h: rows x (cols-1), v: (rows-1) x cols; bridges (0, 1 or 2) on each unit segment
  bridges: { h: number[][]; v: number[][] };
}

export interface SkeletonPuzzleWord {
  // the kana as printed, small kana included
  word: string;
  // the parenthesised text, shown but never placed
  hint?: string;
}

export interface SkeletonPuzzleMark {
  r: number;
  c: number;
  label: string;
}

export interface SkeletonPuzzleCanon {
  // rows x cols; 1 = a cell, 0 = not a cell
  cells: number[][];
  words: SkeletonPuzzleWord[];
  // double-framed cells for a prize question, display only
  marks?: SkeletonPuzzleMark[];
}

export interface SkeletonPuzzlePlacement {
  // index into the canon's words
  word: number;
  // the slot's first cell
  r: number;
  c: number;
  dir: "across" | "down";
}

export interface SkeletonPuzzleAnswer {
  placements: SkeletonPuzzlePlacement[];
}

// Zebra Rope (type 36). Circles share Kuralin's doubled coordinates and colour codes.
export type ZebraRopeCircle = KuralinCircle;

export interface ZebraRopeCanon {
  width: number;
  height: number;
  // each rope: ordered [row, col] cells; consecutive cells are 8-neighbours
  ropes: [number, number][][];
  circles: ZebraRopeCircle[];
}

export interface ZebraRopeAnswer {
  // height x width; 0 = unset, 1 = shaded, 2 = marked unshaded (solver aid)
  states: number[][];
}

// Whimsical Knight (type 37). Points use doubled lattice coordinates: dot (r, c) is
// (2r, 2c); a midpoint between orthogonal neighbours has exactly one odd coordinate.
export interface WhimsicalKnightPoint {
  dr: number;
  dc: number;
}

export interface WhimsicalKnightCanon {
  // dot counts
  rows: number;
  cols: number;
  // (rows - 1) x (cols - 1); 1 = gray square in the cell between dots
  gray: number[][];
  // on a dot or an orthogonal midpoint: the loop goes straight through
  circles: WhimsicalKnightPoint[];
  // on a dot: the loop turns at a right angle
  squares: WhimsicalKnightPoint[];
}

export interface WhimsicalKnightAnswer {
  // each segment is [[r1, c1], [r2, c2]], the smaller dot first, sorted
  segments: [number, number][][];
}

// Omino Tree (type 38). Cells are (r, c), row 0 at the top.
export type OminoTreeDir = "up" | "down" | "left" | "right";

export interface OminoTreeArrow {
  // start cell; the end cell is its neighbour in `dir`
  r: number;
  c: number;
  dir: OminoTreeDir;
}

export interface OminoTreeCanon {
  rows: number;
  cols: number;
  // rows x cols; 0 = no number, n > 0 = the size of the cell's block
  numbers: number[][];
  arrows: OminoTreeArrow[];
}

export interface OminoTreeAnswer {
  grids: {
    // (rows - 1) x cols; 1 = wall between (r, c) and (r + 1, c)
    h: number[][];
    // rows x (cols - 1); 1 = wall between (r, c) and (r, c + 1)
    v: number[][];
  };
}

// Minus Room (type 39). Cells are (r, c), row 0 at the top; circles use doubled
// coordinates: cell (r, c) is (2r, 2c), an edge has exactly one odd coordinate.
export interface MinusRoomCircle {
  dr: number;
  dc: number;
  // the difference of its two cells
  value: number;
}

export interface MinusRoomCanon {
  rows: number;
  cols: number;
  // cells take 1..max
  max: number;
  // rows x cols; 0 = empty, 1..max = given
  cells: number[][];
  // room walls: h (rows - 1) x cols, v rows x (cols - 1); 1 = wall
  edges: { h: number[][]; v: number[][] };
  circles: MinusRoomCircle[];
}

export interface MinusRoomAnswer {
  // rows x cols, givens included; 0 = empty
  numbers: number[][];
}

// Tile Paint (type 40). cells[r][c] is null for a tile cell or a Kakuro-style clue cell
// counting the shaded cells of its run to the right / below (null = no number).
export interface TilePaintClue {
  right: number | null;
  down: number | null;
}

export interface TilePaintCanon {
  cells: (TilePaintClue | null)[][];
  grids: {
    // (rows - 1) x cols; 1 = wall between (r, c) and (r + 1, c)
    h: number[][];
    // rows x (cols - 1); 1 = wall between (r, c) and (r, c + 1)
    v: number[][];
  };
}

export interface TilePaintAnswer {
  // rows x cols; 0 = unset, 1 = shaded, 2 = marked; clue cells 0
  states: number[][];
}

// Country Road (type 41). Rooms are cells joined across edges without a wall.
export interface CountryRoadCanon {
  // rows x cols; 0 = no number, N >= 1 = the room's number, printed in this cell
  cells: number[][];
  grids: {
    // (rows - 1) x cols; 1 = wall between (r, c) and (r + 1, c)
    h: number[][];
    // rows x (cols - 1); 1 = wall between (r, c) and (r, c + 1)
    v: number[][];
  };
}

export interface CountryRoadAnswer {
  edges: {
    // rows x (cols - 1); 1 = loop segment between (r, c) and (r, c + 1)
    h: number[][];
    // (rows - 1) x cols; 1 = loop segment between (r, c) and (r + 1, c)
    v: number[][];
  };
  // rows x cols; 0 none, 1 = × (unused), 2 = • (used); solving aids only
  marks: number[][];
}

// Picturesque Maze (type 44). Walls lie on cell edges; the outer border is a wall
// except at the entrance and exit openings.
export type MazeSide = "top" | "bottom" | "left" | "right";

export interface MazeOpening {
  side: MazeSide;
  // column for top/bottom, row for left/right
  index: number;
}

export interface PicturesqueMazeCanon {
  width: number;
  height: number;
  walls: {
    // (height - 1) x width; 1 = wall between (r, c) and (r + 1, c)
    h: number[][];
    // height x (width - 1); 1 = wall between (r, c) and (r, c + 1)
    v: number[][];
  };
  entrance: MazeOpening;
  exit: MazeOpening;
}

export interface PicturesqueMazeAnswer {
  edges: {
    // height x (width - 1); 1 = path segment between (r, c) and (r, c + 1)
    h: number[][];
    // (height - 1) x width; 1 = path segment between (r, c) and (r + 1, c)
    v: number[][];
  };
}

// Irregular Nonogram (type 45). Board cells are a mask over a bounding box; each segment
// (maximal run of board cells along a row or column) has at most one clue, printed at one
// end of it ("start" = left / above, "end" = right / below).
export interface IrregularNonogramClue {
  // A column for a row segment, a row for a column segment: the segment's first cell.
  start: number;
  side: "start" | "end";
  // Run lengths in reading order (left to right, top to bottom)
  clues: number[];
}

export interface IrregularNonogramCanon {
  width: number;
  height: number;
  // height x width; 1 = board cell
  cells: number[][];
  rowClues: (IrregularNonogramClue & { row: number })[];
  colClues: (IrregularNonogramClue & { col: number })[];
}

export interface IrregularNonogramAnswer {
  // height x width; 1 = filled
  cells: number[][];
}
