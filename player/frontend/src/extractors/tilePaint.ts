import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { TilePaintCanon } from "../types/canon";

export const tilePaintExtractor: AnswerExtractor = {
  puzzleType: 40,

  // states[r][c]: 0 unset, 1 shaded, 2 marked; clue cells stay 0.
  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as TilePaintCanon;
    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;

    const states: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (const [key, val] of Object.entries(userValues)) {
      const [c, r] = key.split(",").map((s) => parseInt(s));
      if (r >= 0 && r < rows && c >= 0 && c < cols && canonRepr.cells[r][c] === null && (val === 1 || val === 2)) {
        states[r][c] = val;
      }
    }
    return { states };
  },
};
