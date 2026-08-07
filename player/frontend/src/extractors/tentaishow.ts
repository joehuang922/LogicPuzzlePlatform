import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { TentaishowCanon } from "../types/canon";

export const tentaishowExtractor: AnswerExtractor = {
  puzzleType: 20,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as TentaishowCanon;

    const rows = canonRepr.height;
    const cols = canonRepr.width;

    const h: number[][] = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
    const v: number[][] = Array.from({ length: rows }, () => Array(cols - 1).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
      if (key.startsWith("h:")) {
        const [rStr, cStr] = key.slice(2).split(",");
        const r = parseInt(rStr);
        const c = parseInt(cStr);
        if (r >= 0 && r < rows - 1 && c >= 0 && c < cols) h[r][c] = val;
      } else if (key.startsWith("v:")) {
        const [rStr, cStr] = key.slice(2).split(",");
        const r = parseInt(rStr);
        const c = parseInt(cStr);
        if (r >= 0 && r < rows && c >= 0 && c < cols - 1) v[r][c] = val;
      }
    }

    return { edges: { h, v } };
  },
};
