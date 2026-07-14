import { PuzzleDefinition } from "../types/puzzle";
import { NonogramCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeNonogramProgress: ProgressCalculator = {
  puzzleType: 6,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as NonogramCanon;

    const rows = canonRepr.rowClues.length;
    const cols = canonRepr.colClues.length;
    const totalCells = rows * cols;

    if (totalCells === 0) return 0;

    let nonEmpty = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const state = userValues[`${c},${r}`] ?? 0;
        if (state !== 0) nonEmpty++;
      }
    }

    return (nonEmpty / totalCells) * 100;
  },
};
