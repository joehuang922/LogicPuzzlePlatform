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
