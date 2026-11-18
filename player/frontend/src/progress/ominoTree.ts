import { PuzzleDefinition } from "../types/puzzle";
import { OminoTreeCanon } from "../types/canon";
import { ProgressCalculator } from "./index";
import { ominoTreeProgress, wallsFromValues } from "../components/ominoTreeRules";

export const computeOminoTreeProgress: ProgressCalculator = {
  puzzleType: 38,

  // Cells in valid blocks / all cells (see ominoTreeRules.validBlockIds).
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as OminoTreeCanon;
    return ominoTreeProgress(canonRepr, wallsFromValues(canonRepr.rows, canonRepr.cols, userValues));
  },
};
