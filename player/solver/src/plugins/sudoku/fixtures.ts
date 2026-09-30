import { SudokuCanon } from "./model";

/** Parse an 81-char string ('.' or '0' = empty) into a canon. */
export function parseGrid(s: string): SudokuCanon {
  const digits = s.replace(/[^0-9.]/g, "").replace(/\./g, "0");
  if (digits.length !== 81) {
    throw new Error(`expected 81 cells, got ${digits.length}`);
  }
  const hints: number[][] = [];
  for (let r = 0; r < 9; r++) {
    hints.push([...digits.slice(r * 9, r * 9 + 9)].map(Number));
  }
  return { hints };
}

/** True iff grid is a legal completed Sudoku (each row/col/box a permutation of 1..9). */
export function isValidSolution(grid: number[][]): boolean {
  const ok = (nums: number[]) =>
    nums.length === 9 && new Set(nums).size === 9 && nums.every((n) => n >= 1 && n <= 9);
  for (let i = 0; i < 9; i++) {
    if (!ok(grid[i])) return false; // row
    if (!ok(grid.map((row) => row[i]))) return false; // col
  }
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      const box: number[] = [];
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++) box.push(grid[br + dr][bc + dc]);
      if (!ok(box)) return false;
    }
  }
  return true;
}

/** Every given must survive unchanged into the solution. */
export function respectsHints(canon: SudokuCanon, grid: number[][]): boolean {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const h = canon.hints[r][c];
      if (h !== 0 && grid[r][c] !== h) return false;
    }
  return true;
}

// -- Named fixtures ---------------------------------------------------------------

/** Arto Inkala's "World's Hardest Sudoku" (2012). Unique; a classic backtracker stress test. */
export const INKALA_HARDEST =
  "800000000003600000070090200050007000000045700000100030001000068008500010090000400";

/**
 * A 17-clue puzzle (unique). 17 is the proven minimum clue count for a unique Sudoku.
 * Removing any single clue yields 16 clues, which McGuire et al. (2012) proved can
 * never be unique — so the stripped variant must have >= 2 solutions.
 */
export const SEVENTEEN_CLUE =
  "000000010400000000020000000000050407008000300001090000300400200050100000000806000";

/** Contradictory givens: two 5s in row 0 -> unsatisfiable. */
export const CONTRADICTORY =
  "550000000000000000000000000000000000000000000000000000000000000000000000000000000";
