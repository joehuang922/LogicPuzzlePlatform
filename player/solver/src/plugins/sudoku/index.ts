import { SolverPlugin } from "../../types";
import { SudokuModel, SudokuCanon } from "./model";
import { SudokuBoard, cellLabel, sudokuGeometry } from "./board";
import { SudokuDims, MAX_SUDOKU_SIZE, sudokuDims } from "./dims";
import { SUDOKU_TECHNIQUES } from "./techniques";

export const sudokuPlugin: SolverPlugin<SudokuCanon, SudokuBoard> = {
  puzzleType: 1,
  buildModel: (canon) => SudokuModel.fromCanon(canon),
  // solution_repr mirrors SudokuCanon / SudokuAnswer: a filled N x N grid under `hints`.
  serializeSolution: (grid) => ({ hints: grid }),
  buildBoard: (canon, values) => SudokuBoard.build(canon, values),
  techniques: SUDOKU_TECHNIQUES,
  withEliminations: (board, eliminations) => board.withEliminations(eliminations),
  describePlacement: (board, cell, value) => `${board.geo.cellLabel(cell)} is ${value}.`,
};

export type { SudokuCanon, SudokuDims };
export { SudokuModel, SudokuBoard, cellLabel, sudokuGeometry, sudokuDims, MAX_SUDOKU_SIZE };
