import { PuzzleDefinition } from "../types/puzzle";
import { KuralinCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeKuralinProgress: ProgressCalculator = {
  puzzleType: 28,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as KuralinCanon;

    const rows = canonRepr.height;
    const cols = canonRepr.width;
    const total = rows * cols;
    if (total === 0) return 0;

    const resolved = Array.from({ length: rows }, () => Array(cols).fill(false));

    for (const [key, val] of Object.entries(userValues)) {
      if (val === 0) continue;
      if (key.startsWith("b:")) {
        // Only black counts; a marked dot (2) is a solving aid.
        if (val !== 1) continue;
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r < rows && c < cols) resolved[r][c] = true;
      } else if (key.startsWith("h:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r < rows && c < cols) resolved[r][c] = true;
        if (r < rows && c + 1 < cols) resolved[r][c + 1] = true;
      } else if (key.startsWith("v:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r < rows && c < cols) resolved[r][c] = true;
        if (r + 1 < rows && c < cols) resolved[r + 1][c] = true;
      }
    }

    let count = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (resolved[r][c]) count++;
      }
    }

    return (count / total) * 100;
  },
};
