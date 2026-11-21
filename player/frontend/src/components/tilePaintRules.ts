import { TilePaintCanon } from "../types/canon";

// Cell states (player values and answer `states`).
export const UNSET = 0;
export const SHADED = 1;
export const MARKED = 2;

export type ClueDir = "right" | "down";

/** A clue number and the run of tile cells it counts, up to the edge or the next clue cell. */
export interface TilePaintRun {
  r: number;
  c: number;
  dir: ClueDir;
  value: number;
  cells: [number, number][];
}

/** A problem tied to a cell, so the editor can mark it on the board. */
export interface TilePaintProblem {
  message: string;
  r: number;
  c: number;
}

export function isTileCell(canon: TilePaintCanon, r: number, c: number): boolean {
  return r >= 0 && r < canon.cells.length && c >= 0 && c < canon.cells[0].length && canon.cells[r][c] === null;
}

/**
 * Tile id of every cell (-1 for clue cells): tile cells joined across edges without a wall.
 * Edges beside a clue cell never join anything, whatever the wall grids say.
 */
export function computeTiles(canon: TilePaintCanon): { ids: number[][]; count: number } {
  const { cells, grids } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const ids = Array.from({ length: rows }, () => Array<number>(cols).fill(-1));
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] !== null || ids[r][c] >= 0) continue;
      ids[r][c] = count;
      const stack: [number, number][] = [[r, c]];
      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        const next: [number, number, boolean][] = [
          [cr - 1, cc, cr > 0 && grids.h[cr - 1]?.[cc] === 0],
          [cr + 1, cc, cr < rows - 1 && grids.h[cr]?.[cc] === 0],
          [cr, cc - 1, cc > 0 && grids.v[cr]?.[cc - 1] === 0],
          [cr, cc + 1, cc < cols - 1 && grids.v[cr]?.[cc] === 0],
        ];
        for (const [nr, nc, open] of next) {
          if (open && isTileCell(canon, nr, nc) && ids[nr][nc] < 0) {
            ids[nr][nc] = count;
            stack.push([nr, nc]);
          }
        }
      }
      count++;
    }
  }
  return { ids, count };
}

/** Is there a wall drawn between (r, c) and its neighbour below / right? */
export function hasWallBelow(canon: TilePaintCanon, r: number, c: number): boolean {
  const a = isTileCell(canon, r, c);
  const b = isTileCell(canon, r + 1, c);
  if (a !== b) return true; // clue cell beside a tile cell
  if (!a) return false; // two clue cells
  return canon.grids.h[r]?.[c] === 1;
}

export function hasWallRight(canon: TilePaintCanon, r: number, c: number): boolean {
  const a = isTileCell(canon, r, c);
  const b = isTileCell(canon, r, c + 1);
  if (a !== b) return true;
  if (!a) return false;
  return canon.grids.v[r]?.[c] === 1;
}

/** Every clue number with its run. */
export function clueRuns(canon: TilePaintCanon): TilePaintRun[] {
  const { cells } = canon;
  const runs: TilePaintRun[] = [];
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      const clue = cells[r][c];
      if (!clue) continue;
      for (const dir of ["right", "down"] as ClueDir[]) {
        const value = clue[dir];
        if (value === null || value === undefined) continue;
        const [dr, dc] = dir === "right" ? [0, 1] : [1, 0];
        const run: [number, number][] = [];
        for (let rr = r + dr, cc = c + dc; isTileCell(canon, rr, cc); rr += dr, cc += dc) run.push([rr, cc]);
        runs.push({ r, c, dir, value, cells: run });
      }
    }
  }
  return runs;
}

/** Solved when every clue's run holds exactly its number of shaded cells. */
export function validateTilePaint(canon: TilePaintCanon, states: number[][]): boolean {
  return clueRuns(canon).every(
    (run) => run.cells.filter(([r, c]) => states[r]?.[c] === SHADED).length === run.value
  );
}

/** Keys `${r},${c},${dir}` of clues the decided cells already break (Errors: On). */
export function brokenClues(canon: TilePaintCanon, states: number[][]): Set<string> {
  const broken = new Set<string>();
  for (const run of clueRuns(canon)) {
    let shaded = 0;
    let open = 0;
    for (const [r, c] of run.cells) {
      const s = states[r]?.[c] ?? UNSET;
      if (s === SHADED) shaded++;
      else if (s === UNSET) open++;
    }
    if (shaded > run.value || shaded + open < run.value) broken.add(`${run.r},${run.c},${run.dir}`);
  }
  return broken;
}

/** Progress: tiles shaded or marked over all tiles, 0-100. */
export function tilePaintProgress(canon: TilePaintCanon, states: (r: number, c: number) => number): number {
  const { ids, count } = computeTiles(canon);
  if (count === 0) return 0;
  const decided = new Set<number>();
  ids.forEach((row, r) =>
    row.forEach((id, c) => {
      if (id >= 0 && states(r, c) !== UNSET) decided.add(id);
    })
  );
  return (decided.size / count) * 100;
}

/**
 * Format problems: what the API's semanticChecks rejects. A board with any can't be saved.
 * Dimension mismatches come first; with them nothing else is checked.
 */
export function tilePaintFormatProblems(canon: TilePaintCanon): TilePaintProblem[] {
  const { cells, grids } = canon;
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  if (rows === 0 || cols === 0 || cells.some((row) => row.length !== cols)) {
    return [{ message: "Rows of cells differ in length", r: 0, c: 0 }];
  }
  const fits = (grid: number[][], h: number, w: number) => grid.length === h && grid.every((line) => line.length === w);
  if (!fits(grids.h, rows - 1, cols) || !fits(grids.v, rows, cols - 1)) {
    return [{ message: `Walls don't match the ${cols}x${rows} grid`, r: 0, c: 0 }];
  }
  const problems: TilePaintProblem[] = [];
  const { ids } = computeTiles(canon);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (
        (isTileCell(canon, r, c) && isTileCell(canon, r + 1, c) && grids.h[r][c] === 1 && ids[r][c] === ids[r + 1][c]) ||
        (isTileCell(canon, r, c) && isTileCell(canon, r, c + 1) && grids.v[r][c] === 1 && ids[r][c] === ids[r][c + 1])
      ) {
        problems.push({ message: `Wall at R${r + 1}C${c + 1} doesn't close off a tile`, r, c });
      }
    }
  }
  for (const run of clueRuns(canon)) {
    if (run.cells.length === 0) {
      problems.push({
        message: `The ${run.dir} clue at R${run.r + 1}C${run.c + 1} has no cells to count`,
        r: run.r,
        c: run.c,
      });
    }
  }
  return problems;
}

/** Misread warnings: suspicious but saveable once overridden. */
export function tilePaintWarnings(canon: TilePaintCanon): TilePaintProblem[] {
  const warnings: TilePaintProblem[] = [];
  const runs = clueRuns(canon);
  for (const run of runs) {
    if (run.cells.length > 0 && run.value > run.cells.length) {
      warnings.push({
        message: `The ${run.dir} clue ${run.value} at R${run.r + 1}C${run.c + 1} is more than its ${run.cells.length} cells`,
        r: run.r,
        c: run.c,
      });
    }
  }
  if (runs.length === 0) warnings.push({ message: "No clue numbers", r: 0, c: 0 });
  if (computeTiles(canon).count === 0) warnings.push({ message: "No tiles", r: 0, c: 0 });
  return warnings;
}

/**
 * The picture area: the board without a leading row / column made only of clue cells
 * (the printed clue strips). Returns the first picture row and column.
 */
export function pictureOrigin(canon: TilePaintCanon): { r0: number; c0: number } {
  const { cells } = canon;
  const r0 = cells.length > 1 && cells[0].every((cell) => cell !== null) ? 1 : 0;
  const c0 = cells[0].length > 1 && cells.every((row) => row[0] !== null) ? 1 : 0;
  return { r0, c0 };
}

/** Normalise the edges beside clue cells: 1 between a clue and a tile cell, 0 between clues. */
export function normalizeClueWalls(canon: TilePaintCanon): TilePaintCanon {
  const h = canon.grids.h.map((row, r) =>
    row.map((w, c) => {
      const a = isTileCell(canon, r, c);
      const b = isTileCell(canon, r + 1, c);
      return a && b ? w : a !== b ? 1 : 0;
    })
  );
  const v = canon.grids.v.map((row, r) =>
    row.map((w, c) => {
      const a = isTileCell(canon, r, c);
      const b = isTileCell(canon, r, c + 1);
      return a && b ? w : a !== b ? 1 : 0;
    })
  );
  return { cells: canon.cells, grids: { h, v } };
}
