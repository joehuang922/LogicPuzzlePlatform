import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { CornerChainCanon } from "../types/canon";

export const cornerChainExtractor: AnswerExtractor = {
  puzzleType: 30,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as CornerChainCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0]?.length ?? 0;

    const states: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
      const [cStr, rStr] = key.split(",");
      const c = parseInt(cStr);
      const r = parseInt(rStr);
      if (r >= 0 && r < rows && c >= 0 && c < cols) states[r][c] = val;
    }

    return { states };
  },
};
