import { PuzzleDefinition } from "../types/puzzle";
import { TentaishowCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

// Flood-fill cells into region ids across edges that have no wall.
function computeRegions(
  rows: number,
  cols: number,
  hEdges: number[][],
  vEdges: number[][]
): number[][] {
  const ids: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
  let next = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (ids[r][c] >= 0) continue;
      const id = next++;
      const queue: [number, number][] = [[r, c]];
      ids[r][c] = id;
      while (queue.length > 0) {
        const [cr, cc] = queue.pop()!;
        if (cr > 0 && ids[cr - 1][cc] < 0 && hEdges[cr - 1][cc] === 0) {
          ids[cr - 1][cc] = id;
          queue.push([cr - 1, cc]);
        }
        if (cr < rows - 1 && ids[cr + 1][cc] < 0 && hEdges[cr][cc] === 0) {
          ids[cr + 1][cc] = id;
          queue.push([cr + 1, cc]);
        }
        if (cc > 0 && ids[cr][cc - 1] < 0 && vEdges[cr][cc - 1] === 0) {
          ids[cr][cc - 1] = id;
          queue.push([cr, cc - 1]);
        }
        if (cc < cols - 1 && ids[cr][cc + 1] < 0 && vEdges[cr][cc] === 0) {
          ids[cr][cc + 1] = id;
          queue.push([cr, cc + 1]);
        }
      }
    }
  }
  return ids;
}

function dotCellRows(dr: number): number[] {
  return dr % 2 === 1 ? [(dr - 1) / 2] : [dr / 2 - 1, dr / 2];
}
function dotCellCols(dc: number): number[] {
  return dc % 2 === 1 ? [(dc - 1) / 2] : [dc / 2 - 1, dc / 2];
}

export const computeTentaishowProgress: ProgressCalculator = {
  puzzleType: 20,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as TentaishowCanon;

    const rows = canonRepr.height;
    const cols = canonRepr.width;
    if (rows < 1 || cols < 1) return 0;

    const hEdges: number[][] = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
    const vEdges: number[][] = Array.from({ length: rows }, () => Array(cols - 1).fill(0));
    for (const [key, val] of Object.entries(userValues)) {
      if (key.startsWith("h:")) {
        const [rStr, cStr] = key.slice(2).split(",");
        const r = parseInt(rStr);
        const c = parseInt(cStr);
        if (r >= 0 && r < rows - 1 && c >= 0 && c < cols) hEdges[r][c] = val;
      } else if (key.startsWith("v:")) {
        const [rStr, cStr] = key.slice(2).split(",");
        const r = parseInt(rStr);
        const c = parseInt(cStr);
        if (r >= 0 && r < rows && c >= 0 && c < cols - 1) vEdges[r][c] = val;
      }
    }

    const regionIds = computeRegions(rows, cols, hEdges, vEdges);

    // Assign each dot to the region of the cells it touches (or -1 if it
    // straddles a wall / out of bounds).
    const dotRegion = canonRepr.dots.map((dot) => {
      const rs = dotCellRows(dot.dr);
      const cs = dotCellCols(dot.dc);
      let region = -1;
      for (const r of rs) {
        for (const c of cs) {
          if (r < 0 || r >= rows || c < 0 || c >= cols) return -1;
          const id = regionIds[r][c];
          if (region === -1) region = id;
          else if (region !== id) return -1;
        }
      }
      return region;
    });

    // Count dots per region; a cell is "assigned to a galaxy" when its region
    // contains exactly one dot.
    const dotCount = new Map<number, number>();
    for (const id of dotRegion) {
      if (id >= 0) dotCount.set(id, (dotCount.get(id) ?? 0) + 1);
    }

    const total = rows * cols;
    let assigned = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((dotCount.get(regionIds[r][c]) ?? 0) === 1) assigned++;
      }
    }

    return (assigned / total) * 100;
  },
};
