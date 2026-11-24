import { PuzzleDefinition } from "../types/puzzle";
import { ProgressCalculator } from "./index";
import { irregularNonogramProgress, parseIrregularNonogramCanon } from "../components/irregularNonogramRules";

// Nonogram's metric: board cells filled or crossed / board cells.
export const computeIrregularNonogramProgress: ProgressCalculator = {
  puzzleType: 45,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    return irregularNonogramProgress(parseIrregularNonogramCanon(puzzle.canonRepr), userValues);
  },
};
