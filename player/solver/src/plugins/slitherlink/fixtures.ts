import { SlitherlinkCanon, SlitherlinkEdges } from "./model";

/**
 * Build a SlitherlinkCanon from a human-readable clue grid. Each string is a row; `.`
 * (or any non-digit) is an empty cell (-1), and a digit 0-3 is that cell's clue.
 *
 *   canonFromClues(["22", "22"])  // a 2x2 board, every cell clued 2
 */
export function canonFromClues(rows: string[]): SlitherlinkCanon {
  const cells = rows.map((row) =>
    row.split("").map((ch) => (ch >= "0" && ch <= "3" ? Number(ch) : -1)),
  );
  return { cells };
}

// -- fixtures -----------------------------------------------------------------

/**
 * UNIQUE. A 2x2 board clued 2 everywhere. Each cell needs exactly two of its four edges,
 * which only the outer perimeter loop satisfies — any smaller loop piles 4 (or 1) edges
 * onto some cell. Its single solution is the border:
 *
 *   +--+--+
 *   |     |
 *   +  +  +
 *   |     |
 *   +--+--+
 */
export const UNIQUE: SlitherlinkCanon = canonFromClues(["22", "22"]);

/** The perimeter loop that solves UNIQUE, as edge grids (h: 3x2, v: 2x3). */
export const UNIQUE_SOLUTION: SlitherlinkEdges = {
  h: [
    [1, 1], // top border
    [0, 0], // interior row: no horizontal edges
    [1, 1], // bottom border
  ],
  v: [
    [1, 0, 1], // left + right borders, no interior vertical
    [1, 0, 1],
  ],
};

/**
 * MULTIPLE. A 2x2 board with no clues at all. With nothing to pin the loop, many distinct
 * single loops exist (the perimeter, a square around any one cell, ...), so the puzzle is
 * ambiguous.
 */
export const MULTIPLE: SlitherlinkCanon = canonFromClues(["..", ".."]);

/**
 * NONE. A single cell clued 3. The only loop touching a lone cell is the 4-edge square
 * around it (clue 4); every other edge subset leaves a dot at degree 1. A clue of 3 can
 * never be met, so the puzzle is unsatisfiable.
 */
export const NONE: SlitherlinkCanon = canonFromClues(["3"]);

/**
 * A 15x25 production board (084c5d3f) that the gate used to time out on: the plain clue,
 * dot and colouring rules left 639 of its 790 edges undecided, and the search ran past
 * 340k nodes without proving it. Probing settles every edge before the search starts.
 */
export const HARD_15X25: SlitherlinkCanon = canonFromClues([
  "101..3.....022.....3..223",
  "32..0..333.....113..0..23",
  "1..3.......1.3.......1..3",
  "..1..320.21...23.203..2..",
  ".0.3........0........3.3.",
  "3...1...0..3.2..3...3...1",
  ".1.2......3...3......2.1.",
  "..3..020.0.....1.010..1..",
  ".3.1......2...1........3.",
  "2...1...0..2.0..1...3...2",
  ".3.3........3........2.3.",
  "..2..202.32...02.302..0..",
  "3..2.......3.1.......2..2",
  "13..2..313.....131..3..22",
  "132..2.....112.....1..023",
]);

/**
 * A 15x25 production board (007418ec) with no solution (most likely a misread clue). The
 * old search needed ~15s to exhaust it; probing proves it dead at construction.
 */
export const UNSOLVABLE_15X25: SlitherlinkCanon = canonFromClues([
  "33.3.3...201.112...3.0.13",
  "....2..2..1...0..3..1....",
  "..2.1.3.3...3...1.1.2.0..",
  ".30...0.2..020..3.2...33.",
  "13..0..1..11.12..3..3..22",
  "2..2.3...13...31...1.1..1",
  "..3...1.32.....32.2...2..",
  ".3..3..32.......12..0..3.",
  "..2...2.11.....22.1...3..",
  "1..0.0...23...32...3.2..0",
  "01..3..3..22.12..3..1..32",
  ".22...2.3..010..2.3...22.",
  "..2.1.3.2...1...3.3.2.1..",
  "....2..2..0...1..0..1....",
  "10.3.3...212.322.3.3.3.11",
]);

// -- independent rule checker -------------------------------------------------

/**
 * Independent validity check used by the tests to confirm a solver-produced answer is a
 * genuine Slitherlink solution: every clue is met, every dot has degree 0 or 2, and the
 * ON edges form exactly one connected loop. This never calls the model, so a bug shared
 * with the model cannot hide here. A direct port of the web board's validateSolution.
 */
export function isValidSolution(canon: SlitherlinkCanon, edges: SlitherlinkEdges): boolean {
  const cells = canon.cells;
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const { h, v } = edges;

  // Shape sanity: h is (rows+1) x cols, v is rows x (cols+1).
  if (h.length !== rows + 1 || v.length !== rows) return false;
  if (h.some((r) => r.length !== cols) || v.some((r) => r.length !== cols + 1)) return false;

  // Rule 1: each clued cell has exactly `clue` surrounding loop edges.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] < 0) continue;
      let count = 0;
      if (h[r][c] === 1) count++; // top
      if (h[r + 1][c] === 1) count++; // bottom
      if (v[r][c] === 1) count++; // left
      if (v[r][c + 1] === 1) count++; // right
      if (count !== cells[r][c]) return false;
    }
  }

  // Rule 2: every dot (intersection) has degree 0 or 2.
  const degree: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (h[r][c] === 1) {
        degree[r][c]++;
        degree[r][c + 1]++;
      }
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (v[r][c] === 1) {
        degree[r][c]++;
        degree[r + 1][c]++;
      }
    }
  }
  let loopDots = 0;
  let startR = -1;
  let startC = -1;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (degree[r][c] !== 0 && degree[r][c] !== 2) return false;
      if (degree[r][c] === 2) {
        loopDots++;
        if (startR < 0) {
          startR = r;
          startC = c;
        }
      }
    }
  }
  if (loopDots === 0) return false;

  // Rule 3: the degree-2 dots form a single connected component (one loop, no extras).
  const visited: boolean[][] = Array.from({ length: rows + 1 }, () => new Array<boolean>(cols + 1).fill(false));
  const stack: [number, number][] = [[startR, startC]];
  visited[startR][startC] = true;
  let seen = 1;
  while (stack.length) {
    const [r, c] = stack.pop()!;
    // Neighbours reachable along an ON edge.
    if (c < cols && h[r][c] === 1 && !visited[r][c + 1]) { visited[r][c + 1] = true; seen++; stack.push([r, c + 1]); }
    if (c > 0 && h[r][c - 1] === 1 && !visited[r][c - 1]) { visited[r][c - 1] = true; seen++; stack.push([r, c - 1]); }
    if (r < rows && v[r][c] === 1 && !visited[r + 1][c]) { visited[r + 1][c] = true; seen++; stack.push([r + 1, c]); }
    if (r > 0 && v[r - 1][c] === 1 && !visited[r - 1][c]) { visited[r - 1][c] = true; seen++; stack.push([r - 1, c]); }
  }
  return seen === loopDots;
}
