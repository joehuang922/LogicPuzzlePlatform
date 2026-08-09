import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { ShikakuCanon, ShikakuRect } from "../types/canon";

export const shikakuExtractor: AnswerExtractor = {
  puzzleType: 22,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as ShikakuCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;

    const rects: ShikakuRect[] = [];
    for (const [key, val] of Object.entries(userValues)) {
      if (!key.startsWith("rect:")) continue;
      const [rStr, cStr] = key.slice(5).split(",");
      const r = parseInt(rStr, 10);
      const c = parseInt(cStr, 10);
      const w = Math.floor(val / 1000);
      const h = val % 1000;
      if (
        Number.isFinite(r) &&
        Number.isFinite(c) &&
        w >= 1 &&
        h >= 1 &&
        r >= 0 &&
        c >= 0 &&
        r + h <= rows &&
        c + w <= cols
      ) {
        rects.push({ r, c, w, h });
      }
    }

    return { rects };
  },
};
