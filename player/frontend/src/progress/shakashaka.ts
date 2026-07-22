import { PuzzleDefinition } from "../types/puzzle";
import { ShakashakaCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeShakashakaProgress: ProgressCalculator = {
  puzzleType: 11,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as ShakashakaCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;

    let whiteCells = 0;
    let filledCells = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (canonRepr.cells[r][c] !== -1) continue;
        whiteCells++;
        const state = userValues[`${c},${r}`] ?? 0;
        if (state !== 0) filledCells++;
      }
    }

    if (whiteCells === 0) return 100;
    return (filledCells / whiteCells) * 100;
  },
};
