import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { SlitherlinkCanon } from "../types/canon";

export const slitherlinkExtractor: AnswerExtractor = {
  puzzleType: 5,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as SlitherlinkCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;

    const h: number[][] = Array.from({ length: rows + 1 }, () => Array(cols).fill(0));
    const v: number[][] = Array.from({ length: rows }, () => Array(cols + 1).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
      if (key.startsWith("h:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r <= rows && c < cols) h[r][c] = val;
      } else if (key.startsWith("v:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r < rows && c <= cols) v[r][c] = val;
      }
    }

    return { edges: { h, v } };
  },
};
