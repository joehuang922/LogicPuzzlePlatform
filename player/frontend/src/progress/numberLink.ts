import { PuzzleDefinition } from "../types/puzzle";
import { NumberLinkCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeNumberLinkProgress: ProgressCalculator = {
  puzzleType: 17,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as NumberLinkCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;
    const totalCells = rows * cols;

    if (totalCells === 0) return 0;

    // A cell counts as "filled" once it has any adjacent drawn path segment.
    const cellHasEdge = Array.from({ length: rows }, () => Array(cols).fill(false));

    for (const [key, val] of Object.entries(userValues)) {
      if (val === 0) continue;
      if (key.startsWith("h:")) {
        // Horizontal segment between (r, c) and (r, c+1).
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r >= 0 && r < rows && c >= 0 && c < cols - 1) {
          cellHasEdge[r][c] = true;
          cellHasEdge[r][c + 1] = true;
        }
      } else if (key.startsWith("v:")) {
        // Vertical segment between (r, c) and (r+1, c).
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r >= 0 && r < rows - 1 && c >= 0 && c < cols) {
          cellHasEdge[r][c] = true;
          cellHasEdge[r + 1][c] = true;
        }
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
