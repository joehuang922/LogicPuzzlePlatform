/**
 * Hashi (type 34) rules, shared by the board, editor, progress and tests.
 *
 * Cells are lattice points: 0 = no island, 1-8 = an island with that number. Bridges are
 * stored per unit segment (h: rows x (cols-1), v: (rows-1) x cols) holding 0, 1 or 2; a
 * bridge between two islands covers every segment between them with the same count.
 */

export interface Bridges {
  h: number[][];
  v: number[][];
}

export interface Point {
  r: number;
  c: number;
}

export const EMPTY = 0;
export const MAX_CLUE = 8;

export function isIsland(v: number): boolean {
  return v >= 1 && v <= MAX_CLUE;
}

export function emptyBridges(rows: number, cols: number): Bridges {
  return {
    h: Array.from({ length: rows }, () => Array(Math.max(0, cols - 1)).fill(0)),
    v: Array.from({ length: Math.max(0, rows - 1) }, () => Array(cols).fill(0)),
  };
}

/** Bridges from player values keyed "h:r,c" / "v:r,c" (as in Masyu), counts 1 or 2. */
export function bridgesFromValues(rows: number, cols: number, values: Record<string, number>): Bridges {
  const b = emptyBridges(rows, cols);
  for (const [key, val] of Object.entries(values)) {
    const [r, c] = key.slice(2).split(",").map(Number);
    if (key.startsWith("h:") && r >= 0 && r < rows && c >= 0 && c < cols - 1) b.h[r][c] = val;
    else if (key.startsWith("v:") && r >= 0 && r < rows - 1 && c >= 0 && c < cols) b.v[r][c] = val;
  }
  return b;
}

const DIRS: [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]];

/** Count on the unit segment from (r, c) one step along (dr, dc); 0 off the board. */
function segment(b: Bridges, r: number, c: number, dr: number, dc: number): number {
  if (dr === 0) return b.h[r]?.[dc > 0 ? c : c - 1] ?? 0;
  return b.v[dr > 0 ? r : r - 1]?.[c] ?? 0;
}

/** The nearest island from `p` along (dr, dc), or null. */
export function neighbour(cells: number[][], p: Point, dr: number, dc: number): Point | null {
  let r = p.r + dr;
  let c = p.c + dc;
  while (r >= 0 && r < cells.length && c >= 0 && c < cells[0].length) {
    if (isIsland(cells[r][c])) return { r, c };
    r += dr;
    c += dc;
  }
  return null;
}

/** Unit step from a to b when they share a row or column, else null. */
function stepBetween(a: Point, b: Point): [number, number] | null {
  if (a.r === b.r && a.c !== b.c) return [0, Math.sign(b.c - a.c)];
  if (a.c === b.c && a.r !== b.r) return [Math.sign(b.r - a.r), 0];
  return null;
}

/** Bridges between neighbouring islands a and b (the segment leaving a towards b). */
export function bridgeCount(b: Bridges, a: Point, to: Point): number {
  const step = stepBetween(a, to);
  return step ? segment(b, a.r, a.c, step[0], step[1]) : 0;
}

/** A copy of `b` with `n` bridges on every segment between a and to. */
export function withBridge(b: Bridges, a: Point, to: Point, n: number): Bridges {
  const step = stepBetween(a, to);
  if (!step) return b;
  const next = { h: b.h.map((row) => [...row]), v: b.v.map((row) => [...row]) };
  const [dr, dc] = step;
  for (let r = a.r, c = a.c; r !== to.r || c !== to.c; r += dr, c += dc) {
    if (dr === 0) next.h[r][dc > 0 ? c : c - 1] = n;
    else next.v[dr > 0 ? r : r - 1][c] = n;
  }
  return next;
}

/** True when a bridge between a and to would cross a perpendicular bridge. */
export function wouldCross(b: Bridges, a: Point, to: Point): boolean {
  const step = stepBetween(a, to);
  if (!step) return false;
  const [dr, dc] = step;
  for (let r = a.r + dr, c = a.c + dc; r !== to.r || c !== to.c; r += dr, c += dc) {
    // A perpendicular bridge through (r, c) uses the segment on one side of it.
    const across = dr === 0 ? segment(b, r, c, 1, 0) + segment(b, r, c, -1, 0) : segment(b, r, c, 0, 1) + segment(b, r, c, 0, -1);
    if (across > 0) return true;
  }
  return false;
}

/** Bridges touching an island: the sum over its four sides. */
export function islandBridges(b: Bridges, r: number, c: number): number {
  return DIRS.reduce((n, [dr, dc]) => n + segment(b, r, c, dr, dc), 0);
}

export type IslandState = "open" | "done" | "over";

export function islandState(cells: number[][], b: Bridges, r: number, c: number): IslandState {
  const n = islandBridges(b, r, c);
  if (n === cells[r][c]) return "done";
  return n > cells[r][c] ? "over" : "open";
}

export function satisfiedIslands(cells: number[][], b: Bridges): number {
  let n = 0;
  cells.forEach((row, r) => row.forEach((v, c) => {
    if (isIsland(v) && islandBridges(b, r, c) === v) n++;
  }));
  return n;
}

export function countIslands(cells: number[][]): number {
  return cells.reduce((n, row) => n + row.filter(isIsland).length, 0);
}

/** Every island's number met, no crossing, no loose bridge ends, all islands connected. */
export function validateHashi(cells: number[][], b: Bridges): boolean {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const islands: Point[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const up = segment(b, r, c, -1, 0);
      const down = segment(b, r, c, 1, 0);
      const left = segment(b, r, c, 0, -1);
      const right = segment(b, r, c, 0, 1);
      if (isIsland(cells[r][c])) {
        if (up + down + left + right !== cells[r][c]) return false;
        islands.push({ r, c });
      } else {
        // A bridge runs straight through an empty point, never ends or crosses there.
        if (up !== down || left !== right) return false;
        if (up > 0 && left > 0) return false;
      }
      if (up > 2 || down > 2 || left > 2 || right > 2) return false;
    }
  }
  if (islands.length === 0) return false;
  const seen = new Set<string>([`${islands[0].r},${islands[0].c}`]);
  const queue = [islands[0]];
  while (queue.length) {
    const p = queue.pop()!;
    for (const [dr, dc] of DIRS) {
      if (segment(b, p.r, p.c, dr, dc) === 0) continue;
      const q = neighbour(cells, p, dr, dc);
      if (q && !seen.has(`${q.r},${q.c}`)) {
        seen.add(`${q.r},${q.c}`);
        queue.push(q);
      }
    }
  }
  return seen.size === islands.length;
}

/** Overridable misread warnings for the editor. */
export function hashiWarnings(cells: number[][]): string[] {
  const warnings: string[] = [];
  let sum = 0;
  let count = 0;
  cells.forEach((row, r) => row.forEach((v, c) => {
    if (!isIsland(v)) return;
    count++;
    sum += v;
    const neighbours = DIRS.filter(([dr, dc]) => neighbour(cells, { r, c }, dr, dc)).length;
    if (v > 2 * neighbours) {
      warnings.push(`R${r + 1}C${c + 1} is ${v}, but its ${neighbours} neighbouring island${neighbours === 1 ? "" : "s"} take at most ${2 * neighbours} bridges`);
    }
  }));
  if (count === 0) warnings.unshift("No islands");
  else if (sum % 2 === 1) warnings.unshift(`The numbers sum to ${sum}, an odd total: every bridge counts at both ends`);
  return warnings;
}
