import { PuzzleDefinition } from "../types/puzzle";
import { MajorityYajilixCanon } from "../types/canon";
import { majorityYajilixProgress, fromValues } from "../components/majorityYajilixRules";
import { ProgressCalculator } from "./index";

export const computeMajorityYajilixProgress: ProgressCalculator = {
  puzzleType: 47,

  // Empty cells touched by a loop segment or carrying a mark (× or •), over all empty cells.
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as MajorityYajilixCanon;
    const { loop, marks } = fromValues(canonRepr.cells.length, canonRepr.cells[0].length, userValues);
    return majorityYajilixProgress(canonRepr, loop, marks);
  },
};
