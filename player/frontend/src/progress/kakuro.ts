import { PuzzleDefinition } from "../types/puzzle";
import { KakuroCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeKakuroProgress: ProgressCalculator = {
  puzzleType: 12,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as KakuroCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;

    let totalEmpty = 0;
    let filled = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (canonRepr.cells[r][c].type === "empty") {
          totalEmpty++;
          if (userValues[`${c},${r}`] != null) {
            filled++;
          }
        }
      }
    }

    if (totalEmpty === 0) return 0;
    return (filled / totalEmpty) * 100;
  },
};
