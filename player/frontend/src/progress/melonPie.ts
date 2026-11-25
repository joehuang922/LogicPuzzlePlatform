import { PuzzleDefinition } from "../types/puzzle";
import { MelonPieCanon } from "../types/canon";
import { fromValues, melonPieProgress } from "../components/melonPieRules";
import { ProgressCalculator } from "./index";

export const computeMelonPieProgress: ProgressCalculator = {
  puzzleType: 49,

  // Circles whose line already reaches a circle of the same colour, over all circles.
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as MelonPieCanon;
    return melonPieProgress(canonRepr, fromValues(canonRepr, userValues));
  },
};
