import { PuzzleDefinition } from "../types/puzzle";
import { TilePaintCanon } from "../types/canon";
import { tilePaintProgress } from "../components/tilePaintRules";
import { ProgressCalculator } from "./index";

export const computeTilePaintProgress: ProgressCalculator = {
  puzzleType: 40,

  // Fraction of tiles the player has decided: shaded (1) or marked (2).
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as TilePaintCanon;
    return tilePaintProgress(canonRepr, (r, c) => {
      const v = userValues[`${c},${r}`];
      return v === 1 || v === 2 ? v : 0;
    });
  },
};
