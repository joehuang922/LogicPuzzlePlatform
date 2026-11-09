import { PuzzleDefinition } from "../types/puzzle";
import { BalanceLinkCanon } from "../types/canon";
import { ProgressCalculator } from "./index";
import { finishedSymbols, isSymbol } from "../components/balanceLinkRules";

export const computeBalanceLinkProgress: ProgressCalculator = {
  puzzleType: 32,

  // Symbols on a finished line (two identical symbols joined by a balanced line) / all
  // symbols. Segments ride in userValues as "h:r,c" / "v:r,c", as in Number Link.
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as BalanceLinkCanon;
    const cells = canonRepr.cells;
    const rows = cells.length;
    const cols = cells[0]?.length ?? 0;
    const total = cells.reduce((n, row) => n + row.filter(isSymbol).length, 0);
    if (total === 0) return 0;

    const h = Array.from({ length: rows }, () => Array(Math.max(cols - 1, 0)).fill(0));
    const v = Array.from({ length: Math.max(rows - 1, 0) }, () => Array(cols).fill(0));
    for (const [key, val] of Object.entries(userValues)) {
      if (val !== 1) continue;
      const [r, c] = key.slice(2).split(",").map(Number);
      if (key.startsWith("h:") && r >= 0 && r < rows && c >= 0 && c < cols - 1) h[r][c] = 1;
      if (key.startsWith("v:") && r >= 0 && r < rows - 1 && c >= 0 && c < cols) v[r][c] = 1;
    }
    return Math.min(100, (finishedSymbols(cells, { h, v }) / total) * 100);
  },
};
