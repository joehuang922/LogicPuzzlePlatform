import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { mazeEdgesFromValues, parseMazeCanon } from "../components/picturesqueMazeRules";

export const picturesqueMazeExtractor: AnswerExtractor = {
  puzzleType: 44,

  // { edges: { h, v } } from "h:r,c" / "v:r,c" path segments.
  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canon = parseMazeCanon(puzzle.canonRepr);
    return { edges: mazeEdgesFromValues(canon.width, canon.height, userValues) };
  },
};
