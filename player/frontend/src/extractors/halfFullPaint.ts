import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { HalfFullPaintCanon } from "../types/canon";
import { fromValues } from "../components/halfFullPaintRules";

export const halfFullPaintExtractor: AnswerExtractor = {
  puzzleType: 48,

  // { states }: height x width, 0 unset, 1 shaded, 2 dot, from "col,row" values.
  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as HalfFullPaintCanon;
    return { states: fromValues(canonRepr, userValues) };
  },
};
