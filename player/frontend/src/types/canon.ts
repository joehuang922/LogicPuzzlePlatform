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
