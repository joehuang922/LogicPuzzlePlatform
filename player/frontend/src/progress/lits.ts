import { PuzzleDefinition } from "../types/puzzle";
import { LitsCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

type Coord = [number, number];

function normalize(coords: Coord[]): Coord[] {
  const minR = Math.min(...coords.map(([r]) => r));
  const minC = Math.min(...coords.map(([, c]) => c));
  return coords
    .map(([r, c]) => [r - minR, c - minC] as Coord)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function serialize(coords: Coord[]): string {
  return normalize(coords)
    .map(([r, c]) => `${r},${c}`)
    .join(";");
}

function canonicalKey(coords: Coord[]): string {
  let variant = coords.map(([r, c]) => [r, c] as Coord);
  const keys: string[] = [];
  for (let refl = 0; refl < 2; refl++) {
    for (let rot = 0; rot < 4; rot++) {
      keys.push(serialize(variant));
      variant = variant.map(([r, c]) => [c, -r] as Coord);
    }
    variant = variant.map(([r, c]) => [r, -c] as Coord);
  }
  keys.sort();
  return keys[0];
}

const TETROMINO_KEYS: Record<string, string> = (() => {
  const refs: Record<string, Coord[]> = {
    I: [[0, 0], [0, 1], [0, 2], [0, 3]],
    L: [[0, 0], [1, 0], [2, 0], [2, 1]],
    T: [[0, 0], [0, 1], [0, 2], [1, 1]],
    S: [[0, 1], [0, 2], [1, 0], [1, 1]],
    O: [[0, 0], [0, 1], [1, 0], [1, 1]],
  };
  const map: Record<string, string> = {};
  for (const [letter, coords] of Object.entries(refs)) {
    map[canonicalKey(coords)] = letter;
  }
  return map;
})();

function isValidTetromino(coords: Coord[]): boolean {
  if (coords.length !== 4) return false;
  if (!isConnected(coords)) return false;
  const letter = TETROMINO_KEYS[canonicalKey(coords)];
  return !!letter && letter !== "O";
}

function isConnected(cells: Coord[]): boolean {
  if (cells.length === 0) return false;
  const set = new Set(cells.map(([r, c]) => `${r},${c}`));
  const visited = new Set<string>();
  const queue: Coord[] = [cells[0]];
  visited.add(`${cells[0][0]},${cells[0][1]}`);
  while (queue.length > 0) {
    const [r, c] = queue.pop()!;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const key = `${r + dr},${c + dc}`;
      if (set.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push([r + dr, c + dc]);
      }
    }
  }
  return visited.size === cells.length;
}

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

export const computeLitsProgress: ProgressCalculator = {
  puzzleType: 15,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as LitsCanon;

    const hEdges = canonRepr.grids.h;
    const vEdges = canonRepr.grids.v;
    const rows = hEdges.length + 1;
    const cols = vEdges[0].length + 1;

    const regionIds = computeRegions(rows, cols, hEdges, vEdges);

    // Group shaded cells by region
    const byRegion = new Map<number, Coord[]>();
    const allRegions = new Set<number>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        allRegions.add(regionIds[r][c]);
        if (userValues[`c:${c},${r}`] === 1) {
          const rid = regionIds[r][c];
          if (!byRegion.has(rid)) byRegion.set(rid, []);
          byRegion.get(rid)!.push([r, c]);
        }
      }
    }

    if (allRegions.size === 0) return 0;

    let validRegions = 0;
    for (const cells of byRegion.values()) {
      if (isValidTetromino(cells)) validRegions++;
    }

    return (validRegions / allRegions.size) * 100;
  },
};
