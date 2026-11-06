import { SolverPlugin } from "../../types";
import { ComboSudokuModel, ComboSudokuCanon, ComboSudokuSolution } from "./model";
import { UnitBoard } from "../sudoku/units";
import { SUDOKU_TECHNIQUES } from "../sudoku/techniques";
import { buildComboBoard, comboGeometry } from "./board";

/**
 * Combo sudoku (type 2): the registration gate, and hints on the sudoku ladder over
 * the layout's geometry (a step's cell ids index `comboGeometry(canon)`, whose `key`
 * gives the client's "col,row"). The solution is stored in the attempt answer's shape
 * without notes, `{ subboards: [{ x, y, answers }] }`, every board's 9x9 filled in, so
 * a shared cell appears once per board covering it.
 */
export const comboSudokuPlugin: SolverPlugin<ComboSudokuCanon, UnitBoard, ComboSudokuSolution> = {
  puzzleType: 2,
  buildModel: (canon) => ComboSudokuModel.fromCanon(canon),
  buildBoard: (canon, values) => buildComboBoard(canon, values),
  techniques: SUDOKU_TECHNIQUES,
  withEliminations: (board, eliminations) => board.withEliminations(eliminations),
  describePlacement: (board, cell, value) => `${board.geo.cellLabel(cell)} is ${value}.`,
};

export type { ComboSudokuCanon, ComboSudokuSolution };
export { ComboSudokuModel, comboGeometry, buildComboBoard };
