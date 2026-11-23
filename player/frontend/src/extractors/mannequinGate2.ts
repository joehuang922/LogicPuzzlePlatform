import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { MannequinGate2Canon } from "../types/canon";
import { SHADED, statesFromValues } from "../components/mannequinGate2Rules";

/** Mannequin Gate 2 (type 43): {shaded} from userValues "c:col,row" -> 1 (marks dropped). */
export const mannequinGate2Extractor: AnswerExtractor = {
  puzzleType: 43,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canon = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as MannequinGate2Canon;
    const states = statesFromValues(canon.rows, canon.cols, userValues);
    return { shaded: states.map((row) => row.map((s) => (s === SHADED ? 1 : 0))) };
  },
};
