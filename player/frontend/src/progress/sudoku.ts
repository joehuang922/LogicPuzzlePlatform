import { PuzzleDefinition } from "../types/puzzle";
import { SudokuCanon } from "../types/canon";
import { ProgressCalculator } from "./index";
import { sudokuSize } from "../components/sudokuRules";

export const computeSudokuProgress: ProgressCalculator = {
  puzzleType: 1,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as SudokuCanon;

    const n = sudokuSize(canonRepr).size;
    let totalEmpty = 0;
    let filled = 0;

    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const hint = canonRepr.hints[row]?.[col] ?? 0;
        if (hint === 0) {
          totalEmpty++;
          const val = userValues[`${col},${row}`] ?? 0;
          if (val > 0) filled++;
        }
      }
    }

    if (totalEmpty === 0) return 100;
    return (filled / totalEmpty) * 100;
  },
};
