import { PuzzleDefinition } from "../types/puzzle";
import { ShikakuCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeShikakuProgress: ProgressCalculator = {
  puzzleType: 22,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as ShikakuCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;
    const total = rows * cols;
    if (total === 0) return 0;

    // Mark every cell covered by any drawn rectangle. Rectangles cannot
    // overlap (enforced on input), but clamp defensively so a stale value
    // never counts a cell twice.
    const covered: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
    for (const [key, val] of Object.entries(userValues)) {
      if (!key.startsWith("rect:")) continue;
      const [rStr, cStr] = key.slice(5).split(",");
      const r = parseInt(rStr, 10);
      const c = parseInt(cStr, 10);
      const w = Math.floor(val / 1000);
      const h = val % 1000;
      if (!(w >= 1 && h >= 1 && r >= 0 && c >= 0 && r + h <= rows && c + w <= cols)) continue;
      for (let rr = r; rr < r + h; rr++) {
        for (let cc = c; cc < c + w; cc++) {
          covered[rr][cc] = true;
        }
      }
    }

    let count = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (covered[r][c]) count++;
      }
    }

    return (count / total) * 100;
  },
};
