import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { WhimsicalKnightCanon } from "../types/canon";
import { isStep, segmentsOf } from "../components/whimsicalKnightRules";

export const whimsicalKnightExtractor: AnswerExtractor = {
  puzzleType: 37,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const { rows, cols } = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as WhimsicalKnightCanon;
    const inside = ([r, c]: [number, number]) => r >= 0 && r < rows && c >= 0 && c < cols;
    const segments = segmentsOf(userValues)
      .filter(([a, b]) => inside(a) && inside(b) && isStep(a, b))
      .sort(([a1, b1], [a2, b2]) => a1[0] - a2[0] || a1[1] - a2[1] || b1[0] - b2[0] || b1[1] - b2[1]);
    return { segments };
  },
};
