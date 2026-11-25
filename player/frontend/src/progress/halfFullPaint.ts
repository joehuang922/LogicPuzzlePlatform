import { PuzzleDefinition } from "../types/puzzle";
import { HalfFullPaintCanon } from "../types/canon";
import { fromValues, halfFullPaintProgress } from "../components/halfFullPaintRules";
import { ProgressCalculator } from "./index";

export const computeHalfFullPaintProgress: ProgressCalculator = {
  puzzleType: 48,

  // Cells shaded or dotted, over all cells.
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as HalfFullPaintCanon;
    return halfFullPaintProgress(canonRepr, fromValues(canonRepr, userValues));
  },
};
