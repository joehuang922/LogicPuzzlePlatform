import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { YajilixCanon } from "../types/canon";
import { fromValues } from "../components/yajilixRules";

export const yajilixExtractor: AnswerExtractor = {
  puzzleType: 46,

  // { edges: { h, v }, marks } from "h:r,c" / "v:r,c" segments and "m:r,c" marks.
  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as YajilixCanon;
    const { loop, marks } = fromValues(canonRepr.cells.length, canonRepr.cells[0].length, userValues);
    return { edges: loop, marks };
  },
};
