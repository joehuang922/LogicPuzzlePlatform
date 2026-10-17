import { PuzzleDefinition } from "../types/puzzle";
import { HitoriCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeHitoriProgress: ProgressCalculator = {
  puzzleType: 26,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as HitoriCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0]?.length ?? 0;

    // Every cell is a decision (shade or keep), so progress = fraction of all
    // cells the player has shaded or marked.
    const total = rows * cols;
    if (total < 1) return 0;

    let assigned = 0;
    for (const [key, val] of Object.entries(userValues)) {
      if (val === 0) continue;
      const [cStr, rStr] = key.split(",");
      const c = parseInt(cStr);
      const r = parseInt(rStr);
      if (r >= 0 && r < rows && c >= 0 && c < cols) assigned++;
    }

    return Math.min(100, (assigned / total) * 100);
  },
};
