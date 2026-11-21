import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { CountryRoadCanon } from "../types/canon";
import { fromValues } from "../components/countryRoadRules";

export const countryRoadExtractor: AnswerExtractor = {
  puzzleType: 41,

  // { edges: { h, v }, marks } from "h:r,c" / "v:r,c" segments and "m:r,c" marks.
  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as CountryRoadCanon;
    const { loop, marks } = fromValues(canonRepr.cells.length, canonRepr.cells[0].length, userValues);
    return { edges: loop, marks };
  },
};
