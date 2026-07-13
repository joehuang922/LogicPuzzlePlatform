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
