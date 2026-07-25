import { PuzzleDefinition } from "../types/puzzle";
import { YajilinCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeYajilinProgress: ProgressCalculator = {
  puzzleType: 13,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as YajilinCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;

    let totalNonClue = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (canonRepr.cells[r][c] === null) totalNonClue++;
      }
    }
    if (totalNonClue === 0) return 0;

    const resolved = Array.from({ length: rows }, () => Array(cols).fill(false));

    for (const [key, val] of Object.entries(userValues)) {
      if (val === 0) continue;
      if (key.startsWith("b:")) {
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
        if (canonRepr.cells[r][c] === null && resolved[r][c]) count++;
      }
    }

    return (count / totalNonClue) * 100;
  },
};
