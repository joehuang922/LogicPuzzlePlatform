import { PuzzleDefinition } from "../types/puzzle";
import { MannequinGate2Canon } from "../types/canon";
import { ProgressCalculator } from "./index";
import { linesWithTwo, statesFromValues } from "../components/mannequinGate2Rules";

export const computeMannequinGate2Progress: ProgressCalculator = {
  puzzleType: 43,

  // Lines holding exactly two shaded cells / all lines. Cells ride as "c:col,row".
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canon = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as MannequinGate2Canon;
    if (canon.lines.length === 0) return 0;
    const states = statesFromValues(canon.rows, canon.cols, userValues);
    return Math.min(100, (linesWithTwo(canon, states) / canon.lines.length) * 100);
  },
};
