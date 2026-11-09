import { PuzzleDefinition } from "../types/puzzle";
import { SinkaminoCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeSinkaminoProgress: ProgressCalculator = {
  puzzleType: 31,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as SinkaminoCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0]?.length ?? 0;

    // Only white cells take input; black cells and given squares are excluded from both
    // the numerator and denominator. Progress = fraction of white cells the player has
    // decided (square or marked).
    let locked = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (canonRepr.cells[r][c] !== 0) locked++;
      }
    }
    const total = rows * cols - locked;
    if (total < 1) return 0;

    let assigned = 0;
    for (const [key, val] of Object.entries(userValues)) {
      if (val === 0) continue;
      const [cStr, rStr] = key.split(",");
      const c = parseInt(cStr);
      const r = parseInt(rStr);
      // Ignore any stray value landing on a locked cell.
      if (r >= 0 && r < rows && c >= 0 && c < cols && canonRepr.cells[r][c] === 0) {
        assigned++;
      }
    }

    return Math.min(100, (assigned / total) * 100);
  },
};
