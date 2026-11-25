import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { MajorityYajilixCanon } from "../types/canon";
import { fromValues } from "../components/majorityYajilixRules";

export const majorityYajilixExtractor: AnswerExtractor = {
  puzzleType: 47,

  // { edges: { h, v }, marks } from "h:r,c" / "v:r,c" segments and "m:r,c" marks.
  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as MajorityYajilixCanon;
    const { loop, marks } = fromValues(canonRepr.cells.length, canonRepr.cells[0].length, userValues);
    return { edges: loop, marks };
  },
};
