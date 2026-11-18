import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { MinusRoomCanon } from "../types/canon";
import { gridOf } from "../components/minusRoomRules";

export const minusRoomExtractor: AnswerExtractor = {
  puzzleType: 39,

  // "col,row" values plus the givens -> { numbers } (0 = empty).
  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canon = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as MinusRoomCanon;
    return { numbers: gridOf(canon, userValues) };
  },
};
