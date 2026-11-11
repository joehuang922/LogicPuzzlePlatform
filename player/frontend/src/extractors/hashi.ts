import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { HashiCanon } from "../types/canon";
import { bridgesFromValues } from "../components/hashiRules";

export const hashiExtractor: AnswerExtractor = {
  puzzleType: 34,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as HashiCanon;
    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;
    return { bridges: bridgesFromValues(rows, cols, userValues) };
  },
};
