import { PuzzleDefinition } from "../types/puzzle";
import { HeyawakeCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeHeyawakeProgress: ProgressCalculator = {
  puzzleType: 21,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as HeyawakeCanon;

    const rows = canonRepr.height;
    const cols = canonRepr.width;
    const total = rows * cols;
    if (total < 1) return 0;

    // A cell counts as soon as the player assigns it any state (black=1 or
    // white-marked=2); unset cells are omitted from userValues.
    let assigned = 0;
    for (const [key, val] of Object.entries(userValues)) {
      if (val === 0) continue;
      const [cStr, rStr] = key.split(",");
      const c = parseInt(cStr);
      const r = parseInt(rStr);
      if (r >= 0 && r < rows && c >= 0 && c < cols) assigned++;
    }

    return (assigned / total) * 100;
  },
};
