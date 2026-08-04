import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { ChocoBananaCanon } from "../types/canon";

export const chocoBananaExtractor: AnswerExtractor = {
  puzzleType: 16,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as ChocoBananaCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;

    // Tri-state grid: 0 = unknown, 1 = shaded (chocolate), 2 = white-mark (banana).
    const states: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
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
