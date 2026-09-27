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

    // 9x9 of ascending candidate-digit lists. Notes are dropped for cells that
    // hold a hint or committed answer (answer overwrites notes).
    const notes: number[][][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => [] as number[])
    );
    for (const [key, val] of Object.entries(userValues)) {
      if (val !== 1 || !key.startsWith("n:")) continue;
      const [cell, digitStr] = key.slice(2).split(":");
      const [col, row] = cell.split(",").map(Number);
      const digit = Number(digitStr);
      if (
        Number.isInteger(col) && Number.isInteger(row) &&
        col >= 0 && col < 9 && row >= 0 && row < 9 &&
        digit >= 1 && digit <= 9 &&
        answers[row][col] === 0
      ) {
        notes[row][col].push(digit);
      }
    }
    for (const rowArr of notes) for (const cell of rowArr) cell.sort((a, b) => a - b);

    return { hints: answers, notes };
  },
};
