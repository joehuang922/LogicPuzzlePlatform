import { PuzzleDefinition } from "../types/puzzle";
import { ComboSudokuCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeComboSudokuProgress: ProgressCalculator = {
  puzzleType: 2,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as ComboSudokuCanon;

    const emptyCells = new Set<string>();

    for (const sb of canonRepr.subboards) {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          const hint = sb.hints[row]?.[col] ?? 0;
          if (hint === 0) {
            const globalCol = 3 * sb.x + col;
            const globalRow = 3 * sb.y + row;
            emptyCells.add(`${globalCol},${globalRow}`);
          }
        }
      }
    }

    if (emptyCells.size === 0) return 100;

    let filled = 0;
    for (const key of emptyCells) {
      if ((userValues[key] ?? 0) > 0) filled++;
    }

    return (filled / emptyCells.size) * 100;
  },
};
