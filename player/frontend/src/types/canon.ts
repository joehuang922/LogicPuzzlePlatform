export interface SudokuCanon {
  hints: number[][];
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
  shaded: number[][];
}

export interface NurikabeCanon {
  // rows x cols; 0 = empty, positive integer = island clue (island size)
  cells: number[][];
}

export interface NurikabeAnswer {
  // rows x cols; 0 = unset, 1 = black (sea), 2 = white-marked (solver aid)
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
