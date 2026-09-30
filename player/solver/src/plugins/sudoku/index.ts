import { SolverPlugin } from "../../types";
import { SudokuModel, SudokuCanon } from "./model";
import { SudokuBoard, cellLabel } from "./board";
import { SUDOKU_TECHNIQUES } from "./techniques";

export const sudokuPlugin: SolverPlugin<SudokuCanon, SudokuBoard> = {
  puzzleType: 1,
  buildModel: (canon) => SudokuModel.fromCanon(canon),
  // solution_repr mirrors SudokuCanon / SudokuAnswer: a filled 9x9 grid under `hints`.
  serializeSolution: (grid) => ({ hints: grid }),
  buildBoard: (canon, values) => SudokuBoard.build(canon, values),
  techniques: SUDOKU_TECHNIQUES,
};

export type { SudokuCanon };
export { SudokuModel, SudokuBoard, cellLabel };
