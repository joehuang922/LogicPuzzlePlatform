import { PuzzleDefinition } from "../types/puzzle";
import { PencilsCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computePencilsProgress: ProgressCalculator = {
  puzzleType: 8,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as PencilsCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;
    const totalCells = rows * cols;

    if (totalCells === 0) return 0;

    const cellTouched = Array.from({ length: rows }, () => Array(cols).fill(false));

    // Canon heads are always "touched"
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (canonRepr.cells[r][c] < 0) cellTouched[r][c] = true;
      }
    }

    for (const [key, val] of Object.entries(userValues)) {
      if (val === 0) continue;

      if (key.startsWith("th:")) {
        // Horizontal trail between (r,c) and (r,c+1)
        const [r, c] = key.slice(3).split(",").map(Number);
        if (r < rows && c < cols) cellTouched[r][c] = true;
        if (r < rows && c + 1 < cols) cellTouched[r][c + 1] = true;
      } else if (key.startsWith("tv:")) {
        // Vertical trail between (r,c) and (r+1,c)
        const [r, c] = key.slice(3).split(",").map(Number);
        if (r < rows && c < cols) cellTouched[r][c] = true;
        if (r + 1 < rows && c < cols) cellTouched[r + 1][c] = true;
      } else if (key.startsWith("hd:")) {
        // Player-placed head
        const [r, c] = key.slice(3).split(",").map(Number);
        if (r < rows && c < cols) cellTouched[r][c] = true;
      } else if (key.startsWith("eh:")) {
        // Horizontal edge between (r,c) and (r+1,c)
        const [r, c] = key.slice(3).split(",").map(Number);
        if (r < rows && c < cols) cellTouched[r][c] = true;
        if (r + 1 < rows && c < cols) cellTouched[r + 1][c] = true;
      } else if (key.startsWith("ev:")) {
        // Vertical edge between (r,c) and (r,c+1)
        const [r, c] = key.slice(3).split(",").map(Number);
        if (r < rows && c < cols) cellTouched[r][c] = true;
        if (r < rows && c + 1 < cols) cellTouched[r][c + 1] = true;
      }
    }

    let touched = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cellTouched[r][c]) touched++;
      }
    }

    return (touched / totalCells) * 100;
  },
};
