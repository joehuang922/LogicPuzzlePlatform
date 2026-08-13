import { PuzzleDefinition } from "../types/puzzle";
import { NorinoriCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

type Coord = [number, number];

function computeRegions(rows: number, cols: number, hEdges: number[][], vEdges: number[][]): number[][] {
  const regionIds: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
  let nextId = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (regionIds[r][c] >= 0) continue;
      const id = nextId++;
      const queue: Coord[] = [[r, c]];
      regionIds[r][c] = id;
      while (queue.length > 0) {
        const [cr, cc] = queue.pop()!;
        if (cr > 0 && regionIds[cr - 1][cc] < 0 && hEdges[cr - 1][cc] === 0) {
          regionIds[cr - 1][cc] = id;
          queue.push([cr - 1, cc]);
        }
        if (cr < rows - 1 && regionIds[cr + 1][cc] < 0 && hEdges[cr][cc] === 0) {
          regionIds[cr + 1][cc] = id;
          queue.push([cr + 1, cc]);
        }
        if (cc > 0 && regionIds[cr][cc - 1] < 0 && vEdges[cr][cc - 1] === 0) {
          regionIds[cr][cc - 1] = id;
          queue.push([cr, cc - 1]);
        }
        if (cc < cols - 1 && regionIds[cr][cc + 1] < 0 && vEdges[cr][cc] === 0) {
          regionIds[cr][cc + 1] = id;
          queue.push([cr, cc + 1]);
        }
      }
    }
  }
  return regionIds;
}

export const computeNorinoriProgress: ProgressCalculator = {
  puzzleType: 23,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as NorinoriCanon;

    const hEdges = canonRepr.grids.h;
    const vEdges = canonRepr.grids.v;
    const rows = hEdges.length + 1;
    const cols = vEdges[0].length + 1;

    const regionIds = computeRegions(rows, cols, hEdges, vEdges);

    // Count shaded (black) cells per region. Marks (value 2) do not count.
    const shadedCounts = new Map<number, number>();
    const allRegions = new Set<number>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        allRegions.add(regionIds[r][c]);
        if (userValues[`c:${c},${r}`] === 1) {
          const rid = regionIds[r][c];
          shadedCounts.set(rid, (shadedCounts.get(rid) ?? 0) + 1);
        }
      }
    }

    if (allRegions.size === 0) return 0;

    // A region counts toward progress when it holds exactly two shaded cells.
    let validRegions = 0;
    for (const rid of allRegions) {
      if ((shadedCounts.get(rid) ?? 0) === 2) validRegions++;
    }

    return (validRegions / allRegions.size) * 100;
  },
};
