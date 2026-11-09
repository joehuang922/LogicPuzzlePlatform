import { PuzzleDefinition } from "../types/puzzle";
import { LRingCanon } from "../types/canon";
import { ProgressCalculator } from "./index";
import { edgesFromValues, isArrow, satisfiedArrows } from "../components/lRingRules";

export const computeLRingProgress: ProgressCalculator = {
  puzzleType: 33,

  // Satisfied arrows / all arrows. An arrow is satisfied when its cell turns with one arm
  // in the arrow's direction, both arms reach a turn, and the arrow's arm is one longer.
  // Segments ride in userValues as "h:r,c" / "v:r,c", as in Masyu.
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as LRingCanon;
    const cells = canonRepr.cells;
    const total = cells.reduce((n, row) => n + row.filter(isArrow).length, 0);
    if (total === 0) return 0;
    const edges = edgesFromValues(cells.length, cells[0]?.length ?? 0, userValues);
    return Math.min(100, (satisfiedArrows(cells, edges) / total) * 100);
  },
};
