import { PuzzleDefinition } from "../types/puzzle";
import { ProgressCalculator } from "./index";
import { mazeEdgesFromValues, parseMazeCanon, picturesqueMazeProgress } from "../components/picturesqueMazeRules";

// "Path length, no hint": path cells walked from the entrance / shortest-route cells,
// capped at 99 until the route is exactly right. Never says whether the path is on
// the right track.
export const computePicturesqueMazeProgress: ProgressCalculator = {
  puzzleType: 44,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canon = parseMazeCanon(puzzle.canonRepr);
    return picturesqueMazeProgress(canon, mazeEdgesFromValues(canon.width, canon.height, userValues));
  },
};
