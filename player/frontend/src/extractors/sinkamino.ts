import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { SinkaminoCanon } from "../types/canon";

export const sinkaminoExtractor: AnswerExtractor = {
  puzzleType: 31,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as SinkaminoCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0]?.length ?? 0;

    const states: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
      const [cStr, rStr] = key.split(",");
      const c = parseInt(cStr);
      const r = parseInt(rStr);
      // Black cells and given squares take no input: always 0.
      if (r >= 0 && r < rows && c >= 0 && c < cols && canonRepr.cells[r][c] === 0) states[r][c] = val;
    }

    return { states };
  },
};
