import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { ComboSudokuCanon } from "../types/canon";

export const comboSudokuExtractor: AnswerExtractor = {
  puzzleType: 2,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as ComboSudokuCanon;

    const subboards = canonRepr.subboards.map((sb) => {
      const answers: number[][] = [];
      for (let row = 0; row < 9; row++) {
        const rowArr: number[] = [];
        for (let col = 0; col < 9; col++) {
          const globalCol = 3 * sb.x + col;
          const globalRow = 3 * sb.y + row;
          const hint = sb.hints[row]?.[col] ?? 0;
          if (hint > 0) {
            rowArr.push(hint);
          } else {
            rowArr.push(userValues[`${globalCol},${globalRow}`] ?? 0);
          }
        }
        answers.push(rowArr);
      }
      return { x: sb.x, y: sb.y, answers };
    });

    return { subboards };
  },
};
