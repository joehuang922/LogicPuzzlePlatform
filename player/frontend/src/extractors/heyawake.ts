import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { HeyawakeCanon } from "../types/canon";

export const heyawakeExtractor: AnswerExtractor = {
  puzzleType: 21,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as HeyawakeCanon;

    const rows = canonRepr.height;
    const cols = canonRepr.width;

    const states: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
      const [cStr, rStr] = key.split(",");
      const c = parseInt(cStr);
      const r = parseInt(rStr);
      if (r >= 0 && r < rows && c >= 0 && c < cols) states[r][c] = val;
    }

    return { states };
  },
};
