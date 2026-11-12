import { PuzzleDefinition } from "../types/puzzle";
import { SkeletonPuzzleCanon } from "../types/canon";
import { ProgressCalculator } from "./index";
import { countCells, filledCells, findSlots, placementsFromValues } from "../components/skeletonPuzzleRules";

export const computeSkeletonPuzzleProgress: ProgressCalculator = {
  puzzleType: 35,

  // Cells holding a kana / all cells. Placements ride in userValues as
  // "p:<slot>" -> word index + 1.
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as SkeletonPuzzleCanon;
    const total = countCells(canonRepr.cells);
    if (total === 0) return 0;
    const slots = findSlots(canonRepr.cells);
    const placed = placementsFromValues(userValues, slots.length, canonRepr.words.length);
    return Math.min(100, (filledCells(canonRepr, slots, placed) / total) * 100);
  },
};
