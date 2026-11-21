import { PuzzleDefinition } from "../types/puzzle";
import { CountryRoadCanon } from "../types/canon";
import { countryRoadProgress, fromValues } from "../components/countryRoadRules";
import { ProgressCalculator } from "./index";

export const computeCountryRoadProgress: ProgressCalculator = {
  puzzleType: 41,

  // Cells touched by a loop segment or carrying a mark (× or •), over all cells.
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as CountryRoadCanon;
    const { loop, marks } = fromValues(canonRepr.cells.length, canonRepr.cells[0].length, userValues);
    return countryRoadProgress(canonRepr, loop, marks);
  },
};
