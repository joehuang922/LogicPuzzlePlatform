import { PuzzleDefinition } from "../types/puzzle";
import { TetroChainKCanon } from "../types/canon";
import { fromValues, tetroChainKProgress } from "../components/tetroChainKRules";
import { ProgressCalculator } from "./index";

export const computeTetroChainKProgress: ProgressCalculator = {
  puzzleType: 50,

  // Cells shaded or dotted, over all cells.
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as TetroChainKCanon;
    return tetroChainKProgress(canonRepr, fromValues(canonRepr, userValues));
  },
};
