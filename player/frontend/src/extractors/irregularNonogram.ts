import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { irregularNonogramAnswer, parseIrregularNonogramCanon } from "../components/irregularNonogramRules";

export const irregularNonogramExtractor: AnswerExtractor = {
  puzzleType: 45,

  // { cells }: height x width, 0 unset, 1 filled, 2 crossed.
  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    return irregularNonogramAnswer(parseIrregularNonogramCanon(puzzle.canonRepr), userValues);
  },
};
