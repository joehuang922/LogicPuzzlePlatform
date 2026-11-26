import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { TetroChainKCanon } from "../types/canon";
import { fromValues } from "../components/tetroChainKRules";

export const tetroChainKExtractor: AnswerExtractor = {
  puzzleType: 50,

  // { states }: height x width, 0 unset, 1 shaded, 2 dot, from "col,row" values.
  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as TetroChainKCanon;
    return { states: fromValues(canonRepr, userValues) };
  },
};
