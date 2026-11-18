import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { OminoTreeCanon } from "../types/canon";
import { wallsFromValues } from "../components/ominoTreeRules";

export const ominoTreeExtractor: AnswerExtractor = {
  puzzleType: 38,

  // Walls keyed "h:r,c" / "v:r,c" -> { grids: { h, v } }.
  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const { rows, cols } = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as OminoTreeCanon;
    return { grids: wallsFromValues(rows, cols, userValues) };
  },
};
