import { KakuroCanon, KakuroCell } from "./model";

/**
 * Parse a compact ASCII grid into a canon. Cells are whitespace-separated tokens,
 * rows separated by '/'. Tokens:
 *   .                an empty (fillable) cell
 *   #                a blank clue cell (no sums)
 *   <down>\<right>   a clue cell; use '-' for an absent side (e.g. 16\-, -\23, 16\23)
 *
 * The down sum is written first, mirroring the usual below-left / above-right layout,
 * so "16\23" means down=16, right=23.
 */
export function parseKakuro(spec: string): KakuroCanon {
  const rows = spec.trim().split("/");
  const cells: KakuroCell[][] = rows.map((row) =>
    row
      .trim()
      .split(/\s+/)
      .map((tok): KakuroCell => {
        if (tok === ".") return { type: "empty" };
        if (tok === "#") return { type: "clue" };
        const [down, right] = tok.split("\\");
        return {
          type: "clue",
          down: down === "-" || down === undefined || down === "" ? null : Number(down),
          right: right === "-" || right === undefined || right === "" ? null : Number(right),
        };
      })
  );
  return { cells };
}

/** True iff every run in the canon holds distinct digits 1..9 summing to its clue. */
export function isValidSolution(canon: KakuroCanon, values: number[][]): boolean {
  const cells = canon.cells;
  const rows = cells.length;
  const cols = cells[0].length;

  const checkRun = (ids: [number, number][], sum: number): boolean => {
    const seen = new Set<number>();
    let total = 0;
    for (const [r, c] of ids) {
      const v = values[r][c];
      if (v < 1 || v > 9 || seen.has(v)) return false;
      seen.add(v);
      total += v;
    }
    return total === sum;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      if (cell.type !== "clue") continue;
      if (cell.right != null) {
        const ids: [number, number][] = [];
        for (let cc = c + 1; cc < cols && cells[r][cc].type === "empty"; cc++) ids.push([r, cc]);
        if (ids.length > 0 && !checkRun(ids, cell.right)) return false;
      }
      if (cell.down != null) {
        const ids: [number, number][] = [];
        for (let rr = r + 1; rr < rows && cells[rr][c].type === "empty"; rr++) ids.push([rr, c]);
        if (ids.length > 0 && !checkRun(ids, cell.down)) return false;
      }
    }
  }
  return true;
}

// -- Named fixtures ---------------------------------------------------------------

/**
 * A 2x2 fillable block whose crossing sums force a single solution:
 *
 *     #     4\-   6\-
 *     -\3   A     B
 *     -\7   C     D
 *
 * Row sums A+B=3, C+D=7; column sums A+C=4, B+D=6. A+B=3 forces {A,B}={1,2};
 * A=2 would need C=2 (col sum 4) — a repeat in the column — so A=1,B=2,C=3,D=4.
 * The only solution; a good minimal uniqueness check.
 */
export const UNIQUE_2x2 = `
  #    4\\-  6\\- /
  -\\3 .    .    /
  -\\7 .    .
`;

/**
 * A single horizontal 2-cell run summing to 3. Both (1,2) and (2,1) satisfy it, so
 * the puzzle has multiple solutions and must be rejected by the gate.
 */
export const MULTIPLE_RUN = `
  -\\3 . . /
  #    # #
`;

/**
 * A 2-cell run summing to 1 — impossible, since two distinct digits sum to at least
 * 1+2=3. Unsatisfiable: the gate classifies it 'none'.
 */
export const CONTRADICTORY = `
  -\\1 . . /
  #    # #
`;

/**
 * Build a canon from a filled solution grid (0 = clue/blank cell, 1..9 = fillable).
 * Clue sums are *computed* from the grid, so the puzzle is satisfiable by construction
 * (no hand-transcribed sums to get wrong). A clue cell owns a right-run when its right
 * neighbour is fillable, and a down-run when its lower neighbour is fillable — matching
 * the solver's own run detection.
 */
export function fromSolution(grid: number[][]): KakuroCanon {
  const rows = grid.length;
  const cols = grid[0].length;
  const cells: KakuroCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: KakuroCell[] = [];
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== 0) {
        row.push({ type: "empty" });
        continue;
      }
      let right: number | null = null;
      if (c + 1 < cols && grid[r][c + 1] !== 0) {
        right = 0;
        for (let cc = c + 1; cc < cols && grid[r][cc] !== 0; cc++) right += grid[r][cc];
      }
      let down: number | null = null;
      if (r + 1 < rows && grid[r + 1][c] !== 0) {
        down = 0;
        for (let rr = r + 1; rr < rows && grid[rr][c] !== 0; rr++) down += grid[rr][c];
      }
      row.push({ type: "clue", right, down });
    }
    cells.push(row);
  }
  return { cells };
}

/**
 * A 5x5 board with an 11-cell interior, built from a hand-checked valid filling so the
 * sums are consistent. Every run holds distinct digits; the solver proves uniqueness in
 * the test. Exercises propagation + backtracking on a non-trivial board.
 */
export const MEDIUM_GRID = [
  [0, 0, 0, 0, 0],
  [0, 1, 2, 0, 0],
  [0, 3, 4, 5, 0],
  [0, 0, 7, 8, 9],
  [0, 0, 6, 1, 2],
];

export const UNIQUE_MEDIUM = fromSolution(MEDIUM_GRID);
