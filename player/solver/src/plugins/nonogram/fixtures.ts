import { NonogramCanon } from "./model";

/** The clue of one line: its filled-group lengths in order, `[0]` when it has none. */
export function lineClue(line: number[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (const v of line) {
    if (v === 1) run++;
    else if (run > 0) {
      out.push(run);
      run = 0;
    }
  }
  if (run > 0) out.push(run);
  return out.length > 0 ? out : [0];
}

/** The canon whose clues describe `grid` (rows x cols of 0/1) — the grid is one solution. */
export function canonFromGrid(grid: number[][]): NonogramCanon {
  return {
    rowClues: grid.map(lineClue),
    colClues: grid[0].map((_, c) => lineClue(grid.map((row) => row[c]))),
  };
}

/** Independent rule check: every row and column of `grid` matches its clue. */
export function isValidSolution(canon: NonogramCanon, grid: number[][]): boolean {
  const derived = canonFromGrid(grid);
  return (
    grid.length === canon.rowClues.length &&
    grid.every((row) => row.length === canon.colClues.length) &&
    JSON.stringify(derived) === JSON.stringify(canon)
  );
}

/** A deterministic rows x cols 0/1 grid with roughly `density` filled (seeded LCG). */
export function randomGrid(seed: number, rows: number, cols: number, density: number): number[][] {
  let s = seed;
  const next = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (next() < density ? 1 : 0))
  );
}

// -- fixtures -----------------------------------------------------------------

/** docs/nonogram/board-nonogram.json — the 10x10 sample board, a unique puzzle. */
export const SMALL: NonogramCanon = {
  rowClues: [[2, 1, 1, 2], [2, 2], [2, 2, 2], [3, 2, 3], [2, 2], [1, 4, 1], [2, 4, 2], [3, 2, 3], [4, 4], [10]],
  colClues: [[4, 4], [4, 5], [2, 3], [1, 3, 2], [2, 3, 1], [2, 3, 1], [1, 3, 2], [2, 3], [4, 5], [4, 4]],
};

/** docs/nonogram/board-nonogram-medium.json — the 25x25 sample board, a unique puzzle. */
export const MEDIUM: NonogramCanon = {
  rowClues: [
    [18, 5], [15, 6], [14, 3, 5], [13, 4, 5], [11, 5, 3, 1], [9, 7, 2, 2], [2, 4, 2, 3, 1],
    [3, 2, 2, 2, 4], [2, 5, 2, 5], [2, 7, 2, 6], [2, 6, 3, 7], [2, 3, 2, 4], [2, 2, 2, 3, 1],
    [3, 3, 5, 1, 2], [4, 2, 7, 3], [8, 9, 3], [6, 8, 2], [5, 5, 2], [2, 2], [3, 2], [5, 3],
    [7, 4], [14], [12], [8],
  ],
  colClues: [
    [6, 6], [6, 8], [6, 2, 5], [6, 2, 4], [6, 1, 3], [8, 2, 7], [7, 4, 8], [6, 5, 2, 5],
    [6, 5, 2, 4], [5, 3, 1, 5], [6, 3, 2, 2, 4], [4, 1, 1, 2, 4, 4], [4, 2, 2, 5, 3],
    [3, 4, 1, 6, 3], [2, 5, 2, 6, 3], [1, 5, 2, 5, 3], [1, 4, 2, 1, 4, 4], [1, 3, 2, 2, 3, 3],
    [2, 4, 1, 4], [1, 2, 6, 4], [5, 8, 4], [5, 7, 4], [4, 5, 3], [4, 1, 3], [7, 3],
  ],
};

/** MULTIPLE. A 2x2 with one cell per row and column: either diagonal fits. */
export const MULTIPLE: NonogramCanon = { rowClues: [[1], [1]], colClues: [[1], [1]] };

/** NONE (totals). Rows ask for 3 filled cells, columns for 2 — caught before any search. */
export const NONE_TOTALS: NonogramCanon = { rowClues: [[2], [1]], colClues: [[1], [1]] };

/**
 * NONE (lines). Totals agree (2 = 2) but the lines conflict: row 0 must be full, so
 * column 0 holds a filled cell in row 0 — yet column 0's [2] then needs row 1, which is [0].
 */
export const NONE_LINES: NonogramCanon = { rowClues: [[2], [0]], colClues: [[2], [0]] };
