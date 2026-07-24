import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { KakuroCanon } from "../types/canon";

export const kakuroExtractor: AnswerExtractor = {
  puzzleType: 12,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as KakuroCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;
    const values: number[][] = [];

    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        if (canonRepr.cells[r][c].type !== "empty") {
          row.push(0);
        } else {
          row.push(userValues[`${c},${r}`] ?? 0);
        }
      }
      values.push(row);
    }

    return { values };
  },
};
