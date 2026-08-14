import { PuzzleDefinition } from "../types/puzzle";
import { NurikabeCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeNurikabeProgress: ProgressCalculator = {
  puzzleType: 24,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as NurikabeCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0]?.length ?? 0;

    // Clue cells are fixed white by rule, so they are excluded from both the
    // numerator and denominator. Progress = fraction of the remaining (non-clue)
    // cells the player has decided (painted black or white-marked).
    let clues = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (canonRepr.cells[r][c] > 0) clues++;
      }
    }
    const total = rows * cols - clues;
    if (total < 1) return 0;

    let assigned = 0;
    for (const [key, val] of Object.entries(userValues)) {
      if (val === 0) continue;
      const [cStr, rStr] = key.split(",");
      const c = parseInt(cStr);
      const r = parseInt(rStr);
      // Ignore any stray value landing on a clue cell (clues are read-only).
      if (r >= 0 && r < rows && c >= 0 && c < cols && canonRepr.cells[r][c] === 0) {
        assigned++;
      }
    }

    return Math.min(100, (assigned / total) * 100);
  },
};
