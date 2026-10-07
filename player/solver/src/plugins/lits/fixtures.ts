import { LitsCanon } from "./model";

/**
 * Build a LitsCanon from a human-readable region map. Each string is a grid row; each
 * character labels the region a cell belongs to (any label works — letters, digits).
 * A thick border is placed between orthogonally-adjacent cells with different labels,
 * which is exactly how the frontend derives `h`/`v` from a region partition.
 *
 *   canonFromRegions(["AB", "AB"])  // two vertical 2x1 regions in a 2x2 grid
 */
export function canonFromRegions(rows: string[]): LitsCanon {
  const grid = rows.map((r) => r.split(""));
  const nr = grid.length;
  const nc = grid[0].length;
  const h: number[][] = [];
  for (let r = 0; r < nr - 1; r++) {
    h.push(grid[r].map((label, c) => (label === grid[r + 1][c] ? 0 : 1)));
  }
  const v: number[][] = [];
  for (let r = 0; r < nr; r++) {
    const row: number[] = [];
    for (let c = 0; c < nc - 1; c++) row.push(grid[r][c] === grid[r][c + 1] ? 0 : 1);
    v.push(row);
  }
  return { grids: { h, v } };
}

// -- fixtures (defined by their region partition) -----------------------------

/**
 * UNIQUE. A 6x6 board of five regions. Found by searching random contiguous partitions and
 * keeping one that BOTH the model and an independent bounds-safe counter prove has exactly
 * one solution; the solution is independently re-checked by isValidSolution in the tests.
 * Its one shaded pattern (# = shaded):
 *
 *   .#.#..
 *   .#.#..
 *   ######
 *   #..#.#
 *   #....#
 *   #.####
 */
export const UNIQUE: LitsCanon = canonFromRegions([
  "EDAACC",
  "EDAACC",
  "EDDACC",
  "EBDAAC",
  "EBDDBC",
  "EBBBBB",
]);

/**
 * MULTIPLE. A 4x4 board split by one vertical border into two 4x2 regions. Each region
 * admits an I plus several L/T/S placements, and many left/right pairings satisfy the
 * global rules, so the puzzle has multiple solutions.
 */
export const MULTIPLE: LitsCanon = canonFromRegions([
  "AABB",
  "AABB",
  "AABB",
  "AABB",
]);

/**
 * NONE. A single 2x2 region. The only 4-cell piece that fits is the O square, which LITS
 * forbids, so the region has zero legal placements and the puzzle is unsatisfiable.
 */
export const NONE: LitsCanon = canonFromRegions([
  "AA",
  "AA",
]);

// -- independent rule checker -------------------------------------------------

type Coord = [number, number];
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function serialize(coords: Coord[]): string {
  const minR = Math.min(...coords.map(([r]) => r));
  const minC = Math.min(...coords.map(([, c]) => c));
  return coords
    .map(([r, c]) => [r - minR, c - minC] as Coord)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
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
  for (const [letter, coords] of Object.entries(refs)) map[canonicalKey(coords)] = letter;
  return map;
})();

/** Flood-fill the canon into region ids (same rule as the model: borders are barriers). */
function regionsOf(canon: LitsCanon): { region: number[]; rows: number; cols: number } {
  const h = canon.grids.h;
  const v = canon.grids.v;
  const rows = h.length + 1;
  const cols = (v[0]?.length ?? -1) + 1;
  const region = new Array<number>(rows * cols).fill(-1);
  const edge = (g: number[][], r: number, c: number) => g[r]?.[c] ?? 0;
  let next = 0;
  for (let r0 = 0; r0 < rows; r0++) {
    for (let c0 = 0; c0 < cols; c0++) {
      if (region[r0 * cols + c0] >= 0) continue;
      const id = next++;
      const stack: Coord[] = [[r0, c0]];
      region[r0 * cols + c0] = id;
      while (stack.length) {
        const [r, c] = stack.pop()!;
        if (r > 0 && region[(r - 1) * cols + c] < 0 && edge(h, r - 1, c) === 0) {
          region[(r - 1) * cols + c] = id;
          stack.push([r - 1, c]);
        }
        if (r < rows - 1 && region[(r + 1) * cols + c] < 0 && edge(h, r, c) === 0) {
          region[(r + 1) * cols + c] = id;
          stack.push([r + 1, c]);
        }
        if (c > 0 && region[r * cols + (c - 1)] < 0 && edge(v, r, c - 1) === 0) {
          region[r * cols + (c - 1)] = id;
          stack.push([r, c - 1]);
        }
        if (c < cols - 1 && region[r * cols + (c + 1)] < 0 && edge(v, r, c) === 0) {
          region[r * cols + (c + 1)] = id;
          stack.push([r, c + 1]);
        }
      }
    }
  }
  return { region, rows, cols };
}

function pieceShape(cells: Coord[]): string | null {
  if (cells.length !== 4) return null;
  // Must be orthogonally connected.
  const set = new Set(cells.map(([r, c]) => `${r},${c}`));
  const seen = new Set<string>([`${cells[0][0]},${cells[0][1]}`]);
  const stack: Coord[] = [cells[0]];
  while (stack.length) {
    const [r, c] = stack.pop()!;
    for (const [dr, dc] of DIRS) {
      const k = `${r + dr},${c + dc}`;
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push([r + dr, c + dc]);
      }
    }
  }
  if (seen.size !== 4) return null;
  const letter = TETROMINO_KEYS[canonicalKey(cells)];
  return letter && letter !== "O" ? letter : null;
}

/**
 * Independent LITS validity check used by the tests to confirm a solver-produced grid
 * genuinely satisfies all four rules — this never calls the model, so a bug shared with
 * the model cannot hide here.
 */
export function isValidSolution(canon: LitsCanon, grid: number[][]): boolean {
  const { region, rows, cols } = regionsOf(canon);
  const regionCount = region.length ? Math.max(...region) + 1 : 0;

  // Rule 1: each region has exactly one non-O tetromino shaded.
  const shapeByRegion: (string | null)[] = [];
  for (let rid = 0; rid < regionCount; rid++) {
    const cells: Coord[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] === 1 && region[r * cols + c] === rid) cells.push([r, c]);
      }
    }
    if (cells.length !== 4) return false;
    const shape = pieceShape(cells);
    if (!shape) return false;
    shapeByRegion[rid] = shape;
  }

  // Collect all shaded cells.
  const shaded: Coord[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) if (grid[r][c] === 1) shaded.push([r, c]);
  }

  // Rule 2: all shaded cells form one connected group.
  const shadedSet = new Set(shaded.map(([r, c]) => r * cols + c));
  const start = shaded[0];
  const seen = new Set<number>([start[0] * cols + start[1]]);
  const stack: Coord[] = [start];
  while (stack.length) {
    const [r, c] = stack.pop()!;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      // Bounds-check both axes before indexing: without the column guard, the
      // right-neighbor of a last-column cell would wrap to the next row's first
      // cell (and the left-neighbor of a first-column cell to the previous row's
      // last cell), falsely joining two disconnected pieces into one group.
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const nid = nr * cols + nc;
      if (shadedSet.has(nid) && !seen.has(nid)) {
        seen.add(nid);
        stack.push([nr, nc]);
      }
    }
  }
  if (seen.size !== shadedSet.size) return false;

  // Rule 3: no fully-shaded 2x2.
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (
        grid[r][c] === 1 &&
        grid[r][c + 1] === 1 &&
        grid[r + 1][c] === 1 &&
        grid[r + 1][c + 1] === 1
      ) {
        return false;
      }
    }
  }

  // Rule 4: no two orthogonally-adjacent pieces (different regions) share a shape.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== 1) continue;
      const rid = region[r * cols + c];
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        if (grid[nr][nc] !== 1) continue;
        const orid = region[nr * cols + nc];
        if (orid !== rid && shapeByRegion[rid] === shapeByRegion[orid]) return false;
      }
    }
  }

  return true;
}
