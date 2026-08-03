import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { LitsCanon } from "../types/canon";

export const litsExtractor: AnswerExtractor = {
  puzzleType: 15,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as LitsCanon;

    const rows = canonRepr.grids.h.length + 1;
    const cols = canonRepr.grids.v[0].length + 1;

    const shaded: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
      if (key.startsWith("c:") && val === 1) {
        const [cStr, rStr] = key.slice(2).split(",");
        const c = parseInt(cStr);
        const r = parseInt(rStr);
        if (r >= 0 && r < rows && c >= 0 && c < cols) shaded[r][c] = 1;
      }
    }

    return { shaded };
  },
};
