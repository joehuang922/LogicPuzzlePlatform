import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { SudokuCanon } from "../types/canon";
import { sudokuSize } from "../components/sudokuRules";

export const sudokuExtractor: AnswerExtractor = {
  puzzleType: 1,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as SudokuCanon;

    const n = sudokuSize(canonRepr).size;
    const answers: number[][] = [];
    for (let row = 0; row < n; row++) {
      const rowArr: number[] = [];
      for (let col = 0; col < n; col++) {
        const hint = canonRepr.hints[row]?.[col] ?? 0;
        if (hint > 0) {
          rowArr.push(hint);
        } else {
          rowArr.push(userValues[`${col},${row}`] ?? 0);
        }
      }
      answers.push(rowArr);
    }

    // N x N of ascending candidate-digit lists. Notes are dropped for cells that
    // hold a hint or committed answer (answer overwrites notes).
    const notes: number[][][] = Array.from({ length: n }, () =>
      Array.from({ length: n }, () => [] as number[])
    );
    for (const [key, val] of Object.entries(userValues)) {
      if (val !== 1 || !key.startsWith("n:")) continue;
      const [cell, digitStr] = key.slice(2).split(":");
      const [col, row] = cell.split(",").map(Number);
      const digit = Number(digitStr);
      if (
        Number.isInteger(col) && Number.isInteger(row) &&
        col >= 0 && col < n && row >= 0 && row < n &&
        digit >= 1 && digit <= n &&
        answers[row][col] === 0
      ) {
        notes[row][col].push(digit);
      }
    }
    for (const rowArr of notes) for (const cell of rowArr) cell.sort((a, b) => a - b);

    return { hints: answers, notes };
  },
};
