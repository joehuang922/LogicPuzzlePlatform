import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { MasyuCanon } from "../types/canon";

export const masyuExtractor: AnswerExtractor = {
  puzzleType: 7,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as MasyuCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;

    const h: number[][] = Array.from({ length: rows }, () => Array(cols - 1).fill(0));
    const v: number[][] = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
      if (key.startsWith("h:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r < rows && c < cols - 1) h[r][c] = val;
      } else if (key.startsWith("v:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r < rows - 1 && c < cols) v[r][c] = val;
      }
    }

    return { edges: { h, v } };
  },
};
