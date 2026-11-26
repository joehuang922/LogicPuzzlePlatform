import { TetroChainKCanon } from "../types/canon";
import { BLACK, DOT, SHADED, UNSET, WHITE, circleCells, emptyStates, fromValues, toValues } from "./halfFullPaintRules";

// Tetro Chain K (type 50). Cell states and player values are Half-Full Paint's
// ("col,row" -> 1 shaded / 2 dot), and so are the circles (Kuralin's).
export { BLACK, DOT, SHADED, UNSET, WHITE, circleCells, emptyStates, fromValues, toValues };

export interface TetroChainKProblem {
  message: string;
  r: number;
  c: number;
}

export type Shape = "I" | "L" | "O" | "S" | "T";
type Cell = [number, number];

const ORTHO: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** The orthogonally connected groups of shaded cells. */
export function groups(canon: TetroChainKCanon, states: number[][]): Cell[][] {
  const seen = states.map((row) => row.map(() => false));
  const out: Cell[][] = [];
  for (let r = 0; r < canon.height; r++) {
    for (let c = 0; c < canon.width; c++) {
      if (states[r][c] !== SHADED || seen[r][c]) continue;
      seen[r][c] = true;
      const group: Cell[] = [];
      const stack: Cell[] = [[r, c]];
      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        group.push([cr, cc]);
        for (const [dr, dc] of ORTHO) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (states[nr]?.[nc] === SHADED && !seen[nr][nc]) {
            seen[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      out.push(group);
    }
  }
  return out;
}

/**
 * The tetromino a 4-cell group forms, rotations and reflections counting as the same:
 * I is a straight line and O a 2x2 square; the rest fill a 3x2 box. There T has a cell
 * with 3 neighbours in the group, L has 3 cells along the long side, and S has 2 + 2.
 */
export function shapeOf(cells: Cell[]): Shape | null {
  if (cells.length !== 4) return null;
  const rows = new Set(cells.map(([r]) => r));
  const cols = new Set(cells.map(([, c]) => c));
  if (rows.size === 1 || cols.size === 1) return "I";
  if (rows.size === 2 && cols.size === 2) return "O";
  const key = new Set(cells.map(([r, c]) => `${r},${c}`));
  const degree = cells.map(([r, c]) => ORTHO.filter(([dr, dc]) => key.has(`${r + dr},${c + dc}`)).length);
  if (degree.includes(3)) return "T";
  // In the 3x2 box: how many cells share each value of the short side.
  const tall = rows.size === 3;
  const counts = [...(tall ? cols : rows)].map((v) => cells.filter(([r, c]) => (tall ? c : r) === v).length);
  return counts.includes(3) ? "L" : "S";
}

/** Shaded cells connected through the 8-neighbourhood (all tetrominoes chained). */
export function chained(canon: TetroChainKCanon, states: number[][]): boolean {
  const cells: Cell[] = [];
  for (let r = 0; r < canon.height; r++) for (let c = 0; c < canon.width; c++) if (states[r][c] === SHADED) cells.push([r, c]);
  if (cells.length === 0) return false;
  const seen = new Set([`${cells[0][0]},${cells[0][1]}`]);
  const stack = [cells[0]];
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const k = `${r + dr},${c + dc}`;
        if (states[r + dr]?.[c + dc] === SHADED && !seen.has(k)) {
          seen.add(k);
          stack.push([r + dr, c + dc]);
        }
      }
    }
  }
  return seen.size === cells.length;
}

/** Whether two groups touch at a corner (separate groups can't share an edge). */
function touching(a: Cell[], b: Cell[]): boolean {
  return a.some(([r1, c1]) => b.some(([r2, c2]) => Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1));
}

/** Pairs of group indices that are the same tetromino shape and touch at a corner. */
export function twinTouches(gs: Cell[][]): [number, number][] {
  const shapes = gs.map(shapeOf);
  const out: [number, number][] = [];
  for (let i = 0; i < gs.length; i++) {
    for (let j = i + 1; j < gs.length; j++) {
      if (shapes[i] && shapes[i] === shapes[j] && touching(gs[i], gs[j])) out.push([i, j]);
    }
  }
  return out;
}

function circleHolds(color: number, shaded: number, n: number): boolean {
  if (color === BLACK) return 2 * shaded > n;
  if (color === WHITE) return 2 * shaded < n;
  return 2 * shaded === n;
}

/** The five rules. */
export function validateTetroChainK(canon: TetroChainKCanon, states: number[][]): boolean {
  for (const k of canon.circles) {
    const cells = circleCells(canon, k.dr, k.dc);
    if (!circleHolds(k.color, cells.filter(([r, c]) => states[r]?.[c] === SHADED).length, cells.length)) return false;
  }
  const gs = groups(canon, states);
  if (gs.length === 0 || gs.some((g) => g.length !== 4)) return false;
  if (!chained(canon, states)) return false;
  return twinTouches(gs).length === 0;
}

export interface Broken {
  circles: Set<number>; // index into canon.circles
  cells: Set<string>; // "r,c" of cells in a broken group (too big, stuck short, or a touching twin)
}

/** What the decided cells (shaded, or dotted = unshaded) already break (Errors: On). */
export function brokenClues(canon: TetroChainKCanon, states: number[][]): Broken {
  const circles = new Set<number>();
  canon.circles.forEach((k, i) => {
    const cells = circleCells(canon, k.dr, k.dc);
    const n = cells.length;
    const on = cells.filter(([r, c]) => states[r][c] === SHADED).length;
    const off = cells.filter(([r, c]) => states[r][c] === DOT).length;
    const ok = k.color === BLACK ? 2 * (n - off) > n : k.color === WHITE ? 2 * on < n : 2 * on <= n && 2 * off <= n;
    if (!ok) circles.add(i);
  });
  const cells = new Set<string>();
  const gs = groups(canon, states);
  const mark = (g: [number, number][]) => g.forEach(([r, c]) => cells.add(`${r},${c}`));
  for (const g of gs) {
    if (g.length > 4) mark(g);
    else if (g.length < 4) {
      // Stuck: no unset neighbour to grow into.
      const grows = g.some(([r, c]) =>
        ORTHO.some(([dr, dc]) => r + dr >= 0 && r + dr < canon.height && c + dc >= 0 && c + dc < canon.width && states[r + dr][c + dc] === UNSET)
      );
      if (!grows) mark(g);
    }
  }
  for (const [i, j] of twinTouches(gs)) {
    mark(gs[i]);
    mark(gs[j]);
  }
  return { circles, cells };
}

/** Cells shaded or dotted, over all cells, 0-100. */
export function tetroChainKProgress(canon: TetroChainKCanon, states: number[][]): number {
  const total = canon.width * canon.height;
  if (total === 0) return 0;
  let decided = 0;
  states.forEach((row) => row.forEach((s) => s !== UNSET && decided++));
  return (decided / total) * 100;
}

/** Format problems: what the API's semanticChecks rejects. A board with any can't be saved. */
export function tetroChainKFormatProblems(canon: TetroChainKCanon): TetroChainKProblem[] {
  const { width: cols, height: rows } = canon;
  const problems: TetroChainKProblem[] = [];
  const seen = new Set<string>();
  for (const { dr, dc } of canon.circles) {
    const at = { r: Math.max(0, Math.min(rows - 1, Math.floor((dr - 1) / 2))), c: Math.max(0, Math.min(cols - 1, Math.floor((dc - 1) / 2))) };
    if (dr < 1 || dc < 1 || dr > 2 * rows - 1 || dc > 2 * cols - 1) {
      problems.push({ message: `Circle at (${dr},${dc}) is outside the grid`, ...at });
    } else if (dr % 2 === 1 && dc % 2 === 1) {
      problems.push({ message: `Circle at (${dr},${dc}) is at a cell centre`, ...at });
    }
    const key = `${dr},${dc}`;
    if (seen.has(key)) problems.push({ message: `Two circles at (${dr},${dc})`, ...at });
    seen.add(key);
  }
  return problems;
}

/** Misread warnings: suspicious but saveable once overridden. */
export function tetroChainKWarnings(canon: TetroChainKCanon): TetroChainKProblem[] {
  return canon.circles.length === 0 ? [{ message: "No circles", r: 0, c: 0 }] : [];
}
