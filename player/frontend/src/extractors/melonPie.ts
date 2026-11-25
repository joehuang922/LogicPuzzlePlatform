import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { MelonPieCanon } from "../types/canon";
import { fromValues } from "../components/melonPieRules";

export const melonPieExtractor: AnswerExtractor = {
  puzzleType: 49,

  // { edges: { h, v } } from "h:r,c" / "v:r,c": 1 = segment, 2 = × mark.
  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as MelonPieCanon;
    return { edges: fromValues(canonRepr, userValues) };
  },
};
