import { SolverPlugin } from "../../types";
import { SudokuModel, SudokuCanon } from "./model";

export const sudokuPlugin: SolverPlugin<SudokuCanon> = {
  puzzleType: 1,
  buildModel: (canon) => SudokuModel.fromCanon(canon),
  // solution_repr mirrors SudokuCanon / SudokuAnswer: a filled 9x9 grid under `hints`.
  serializeSolution: (grid) => ({ hints: grid }),
  // techniques: [] — hint ladder added in Phase 3
};

export type { SudokuCanon };
export { SudokuModel };
