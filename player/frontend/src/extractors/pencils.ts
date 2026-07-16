import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { PencilsCanon } from "../types/canon";

export const pencilsExtractor: AnswerExtractor = {
  puzzleType: 8,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as PencilsCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;

    const trailsH: number[][] = Array.from({ length: rows }, () => Array(cols - 1).fill(0));
    const trailsV: number[][] = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
    const heads: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
    const edgesH: number[][] = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
    const edgesV: number[][] = Array.from({ length: rows }, () => Array(cols - 1).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
      if (key.startsWith("th:")) {
        const [r, c] = key.slice(3).split(",").map(Number);
        if (r < rows && c < cols - 1) trailsH[r][c] = val;
      } else if (key.startsWith("tv:")) {
        const [r, c] = key.slice(3).split(",").map(Number);
        if (r < rows - 1 && c < cols) trailsV[r][c] = val;
      } else if (key.startsWith("hd:")) {
        const [r, c] = key.slice(3).split(",").map(Number);
        if (r < rows && c < cols) heads[r][c] = val;
      } else if (key.startsWith("eh:")) {
        const [r, c] = key.slice(3).split(",").map(Number);
        if (r < rows - 1 && c < cols) edgesH[r][c] = val;
      } else if (key.startsWith("ev:")) {
        const [r, c] = key.slice(3).split(",").map(Number);
        if (r < rows && c < cols - 1) edgesV[r][c] = val;
      }
    }

    return {
      trails: { h: trailsH, v: trailsV },
      heads,
      edges: { h: edgesH, v: edgesV },
    };
  },
};
