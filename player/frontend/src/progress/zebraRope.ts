import { PuzzleDefinition } from "../types/puzzle";
import { ZebraRopeCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeZebraRopeProgress: ProgressCalculator = {
  puzzleType: 36,

  // Fraction of cells the player has decided: shaded (1) or marked unshaded (2).
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as ZebraRopeCanon;
    const { width: cols, height: rows } = canonRepr;
    const total = rows * cols;
    if (total < 1) return 0;

    let assigned = 0;
    for (const [key, val] of Object.entries(userValues)) {
      if (val !== 1 && val !== 2) continue;
      const [c, r] = key.split(",").map((s) => parseInt(s));
      if (r >= 0 && r < rows && c >= 0 && c < cols) assigned++;
    }
    return Math.min(100, (assigned / total) * 100);
  },
};
