import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { ZebraRopeCanon } from "../types/canon";

export const zebraRopeExtractor: AnswerExtractor = {
  puzzleType: 36,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as ZebraRopeCanon;
    const { width: cols, height: rows } = canonRepr;

    const states: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (const [key, val] of Object.entries(userValues)) {
      const [c, r] = key.split(",").map((s) => parseInt(s));
      if (r >= 0 && r < rows && c >= 0 && c < cols && (val === 1 || val === 2)) states[r][c] = val;
    }
    return { states };
  },
};
