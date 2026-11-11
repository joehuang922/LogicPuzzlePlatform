import { PuzzleDefinition } from "../types/puzzle";
import { HashiCanon } from "../types/canon";
import { ProgressCalculator } from "./index";
import { bridgesFromValues, countIslands, satisfiedIslands } from "../components/hashiRules";

export const computeHashiProgress: ProgressCalculator = {
  puzzleType: 34,

  // Islands whose bridge count equals their number / all islands. Bridges ride in
  // userValues per unit segment as "h:r,c" / "v:r,c" with the count, as in Masyu.
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as HashiCanon;
    const cells = canonRepr.cells;
    const total = countIslands(cells);
    if (total === 0) return 0;
    const bridges = bridgesFromValues(cells.length, cells[0]?.length ?? 0, userValues);
    return Math.min(100, (satisfiedIslands(cells, bridges) / total) * 100);
  },
};
