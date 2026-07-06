import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { SudokuCanon } from "../types/canon";

export const sudokuExtractor: AnswerExtractor = {
  puzzleType: 1,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as SudokuCanon;

    const answers: number[][] = [];
    for (let row = 0; row < 9; row++) {
      const rowArr: number[] = [];
      for (let col = 0; col < 9; col++) {
        const hint = canonRepr.hints[row]?.[col] ?? 0;
        if (hint > 0) {
          rowArr.push(hint);
        } else {
          rowArr.push(userValues[`${col},${row}`] ?? 0);
        }
      }
      answers.push(rowArr);
    }

    return { hints: answers };
  },
};
