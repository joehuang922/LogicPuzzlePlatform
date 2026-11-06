import { SolverPlugin } from "../../types";
import { ComboSudokuModel, ComboSudokuCanon, ComboSudokuSolution } from "./model";

/**
 * Combo sudoku (type 2), gate only. The solution is stored in the attempt answer's
 * shape without notes, `{ subboards: [{ x, y, answers }] }`, every board's 9x9 filled
 * in, so a shared cell appears once per board covering it.
 */
export const comboSudokuPlugin: SolverPlugin<ComboSudokuCanon, unknown, ComboSudokuSolution> = {
  puzzleType: 2,
  buildModel: (canon) => ComboSudokuModel.fromCanon(canon),
};

export type { ComboSudokuCanon, ComboSudokuSolution };
export { ComboSudokuModel };
