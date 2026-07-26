import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { FillominoCanon } from "../types/canon";

export const fillominoExtractor: AnswerExtractor = {
  puzzleType: 14,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as FillominoCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;

    const numbers: number[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => canonRepr.cells[r][c])
    );
    const h: number[][] = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
    const v: number[][] = Array.from({ length: rows }, () => Array(cols - 1).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
      if (key.startsWith("c:")) {
        const [cStr, rStr] = key.slice(2).split(",");
        const c = parseInt(cStr);
        const r = parseInt(rStr);
        if (r >= 0 && r < rows && c >= 0 && c < cols && canonRepr.cells[r][c] === 0) {
          numbers[r][c] = val;
        }
      } else if (key.startsWith("h:")) {
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

    return { numbers, edges: { h, v } };
  },
};
