import { PuzzleDefinition } from "../types/puzzle";
import { WhimsicalKnightCanon } from "../types/canon";
import { ProgressCalculator } from "./index";
import { segmentsOf, whimsicalKnightProgress } from "../components/whimsicalKnightRules";

export const computeWhimsicalKnightProgress: ProgressCalculator = {
  puzzleType: 37,

  // Satisfied white circles and squares / all of them.
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as WhimsicalKnightCanon;
    return whimsicalKnightProgress(canonRepr, segmentsOf(userValues));
  },
};
