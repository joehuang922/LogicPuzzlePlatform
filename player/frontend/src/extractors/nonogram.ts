import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { NonogramCanon } from "../types/canon";

export const nonogramExtractor: AnswerExtractor = {
  puzzleType: 6,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as NonogramCanon;

    const rows = canonRepr.rowClues.length;
    const cols = canonRepr.colClues.length;

    const cells: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
      const [colStr, rowStr] = key.split(",");
      const c = parseInt(colStr, 10);
      const r = parseInt(rowStr, 10);
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        // Keep crosses (2) as well as fills (1), as Android does, so a reload restores
        // the player's marks.
        cells[r][c] = val === 1 || val === 2 ? val : 0;
      }
    }

    return { cells };
  },
};
