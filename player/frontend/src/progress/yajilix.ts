import { PuzzleDefinition } from "../types/puzzle";
import { YajilixCanon } from "../types/canon";
import { yajilixProgress, fromValues } from "../components/yajilixRules";
import { ProgressCalculator } from "./index";

export const computeYajilixProgress: ProgressCalculator = {
  puzzleType: 46,

  // Empty cells touched by a loop segment or carrying a mark (× or •), over all empty cells.
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as YajilixCanon;
    const { loop, marks } = fromValues(canonRepr.cells.length, canonRepr.cells[0].length, userValues);
    return yajilixProgress(canonRepr, loop, marks);
  },
};
