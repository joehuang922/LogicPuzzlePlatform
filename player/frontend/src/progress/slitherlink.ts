import { PuzzleDefinition } from "../types/puzzle";
import { SlitherlinkCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeSlitherlinkProgress: ProgressCalculator = {
  puzzleType: 5,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as SlitherlinkCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;
    const totalCells = rows * cols;

    if (totalCells === 0) return 0;

    // For each cell, check if any of its 4 edges has a non-empty value
    const cellHasEdge = Array.from({ length: rows }, () => Array(cols).fill(false));

    for (const [key, val] of Object.entries(userValues)) {
      if (val === 0) continue;
      if (key.startsWith("h:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        // Horizontal edge at row r, col c affects cell above (r-1, c) and below (r, c)
        if (r > 0 && r <= rows && c < cols) cellHasEdge[r - 1][c] = true;
        if (r >= 0 && r < rows && c < cols) cellHasEdge[r][c] = true;
      } else if (key.startsWith("v:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        // Vertical edge at row r, col c affects cell left (r, c-1) and right (r, c)
        if (r < rows && c > 0 && c <= cols) cellHasEdge[r][c - 1] = true;
        if (r < rows && c >= 0 && c < cols) cellHasEdge[r][c] = true;
      }
    }

    let cellsWithEdges = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cellHasEdge[r][c]) cellsWithEdges++;
      }
    }

    return (cellsWithEdges / totalCells) * 100;
  },
};
