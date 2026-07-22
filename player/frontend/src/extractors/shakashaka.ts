import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { ShakashakaCanon } from "../types/canon";

export const shakashakaExtractor: AnswerExtractor = {
  puzzleType: 11,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as ShakashakaCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;
    const states: number[][] = [];

    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        if (canonRepr.cells[r][c] !== -1) {
          row.push(0);
        } else {
          row.push(userValues[`${c},${r}`] ?? 0);
        }
      }
      states.push(row);
    }

    return { states };
  },
};
