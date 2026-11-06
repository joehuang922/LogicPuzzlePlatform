import { CellValues } from "../../types";
import { SudokuCanon } from "./model";
import { Geometry, UnitBoard, geometry } from "./units";

/** Row/col/box units: 9 rows, then 9 columns, then 9 boxes (cell id = row * 9 + col). */
export const UNITS: number[][] = (() => {
  const units: number[][] = [];
  for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let br = 0; br < 9; br += 3)
    for (let bc = 0; bc < 9; bc += 3) {
      const box: number[] = [];
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++) box.push((br + dr) * 9 + (bc + dc));
      units.push(box);
    }
  return units;
})();

/** Human-readable cell label, e.g. id 30 -> "R4C4". */
export function cellLabel(id: number): string {
  return `R${Math.floor(id / 9) + 1}C${(id % 9) + 1}`;
}

/** Unit label for an explanation, given the unit's index in UNITS (0..26). */
export function unitLabel(unitIndex: number): string {
  if (unitIndex < 9) return `row ${unitIndex + 1}`;
  if (unitIndex < 18) return `column ${unitIndex - 9 + 1}`;
  return `box ${unitIndex - 18 + 1}`;
}

export const SUDOKU_GEOMETRY: Geometry = geometry(
  81,
  UNITS,
  UNITS.map((_, u) => (u < 9 ? "row" : u < 18 ? "col" : "box")),
  (id) => `${id % 9},${Math.floor(id / 9)}`,
  cellLabel,
  unitLabel
);

/** A sudoku's candidate board: the shared hint board over the 9x9 geometry. */
export type SudokuBoard = UnitBoard;

export const SudokuBoard = {
  /** Givens win; otherwise the player's entry keyed "col,row". Pencil marks are ignored. */
  build(canon: SudokuCanon, entered: CellValues): UnitBoard {
    const values = Array.from({ length: 81 }, (_, id) => {
      const r = Math.floor(id / 9);
      const c = id % 9;
      const hint = canon.hints[r]?.[c] ?? 0;
      return hint !== 0 ? hint : entered[`${c},${r}`] ?? 0;
    });
    return UnitBoard.build(SUDOKU_GEOMETRY, values);
  },
};
