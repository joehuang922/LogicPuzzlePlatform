import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { SkeletonPuzzleCanon } from "../types/canon";
import { findSlots, placementsFromValues, placementsToAnswer } from "../components/skeletonPuzzleRules";

export const skeletonPuzzleExtractor: AnswerExtractor = {
  puzzleType: 35,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as SkeletonPuzzleCanon;
    const slots = findSlots(canonRepr.cells);
    const placed = placementsFromValues(userValues, slots.length, canonRepr.words.length);
    return { placements: placementsToAnswer(slots, placed) };
  },
};
