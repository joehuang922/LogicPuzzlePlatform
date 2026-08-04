import { PuzzleDefinition } from "../types/puzzle";
import { ChocoBananaCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeChocoBananaProgress: ProgressCalculator = {
  puzzleType: 16,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as ChocoBananaCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0]?.length ?? 0;
    const total = rows * cols;
    if (total === 0) return 0;

    // A cell is "decided" once the player marks it shaded (1) or white-mark (2).
    let decided = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = userValues[`c:${c},${r}`];
        if (v === 1 || v === 2) decided++;
      }
    }

    return (decided / total) * 100;
  },
};
