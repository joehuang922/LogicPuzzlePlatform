import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { RippleEffectCanon } from "../types/canon";

export const rippleEffectExtractor: AnswerExtractor = {
  puzzleType: 25,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as RippleEffectCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;

    // Start from the clue grid; clue cells keep their given value.
    const numbers: number[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => canonRepr.cells[r][c])
    );

    for (const [key, val] of Object.entries(userValues)) {
      const m = /^(\d+),(\d+)$/.exec(key);
      if (!m) continue;
      const c = parseInt(m[1]);
      const r = parseInt(m[2]);
      if (r >= 0 && r < rows && c >= 0 && c < cols && canonRepr.cells[r][c] === 0) {
        numbers[r][c] = val;
      }
    }

    return { numbers };
  },
};
