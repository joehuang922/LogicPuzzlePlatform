import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { NorinoriCanon } from "../types/canon";

export const norinoriExtractor: AnswerExtractor = {
  puzzleType: 23,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as NorinoriCanon;

    const rows = canonRepr.grids.h.length + 1;
    const cols = canonRepr.grids.v[0].length + 1;

    const states: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
      // Persist both shaded (1) and marked (2); a mark is real solver input, not noise.
      if (key.startsWith("c:") && (val === 1 || val === 2)) {
        const [cStr, rStr] = key.slice(2).split(",");
        const c = parseInt(cStr);
        const r = parseInt(rStr);
        if (r >= 0 && r < rows && c >= 0 && c < cols) states[r][c] = val;
      }
    }

    return { states };
  },
};
