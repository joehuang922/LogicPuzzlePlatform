import { PuzzleDefinition } from "../types/puzzle";
import { MinusRoomCanon } from "../types/canon";
import { ProgressCalculator } from "./index";
import { minusRoomProgress } from "../components/minusRoomRules";

export const computeMinusRoomProgress: ProgressCalculator = {
  puzzleType: 39,

  // Non-given cells holding a number / non-given cells.
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canon = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as MinusRoomCanon;
    return minusRoomProgress(canon, userValues);
  },
};
