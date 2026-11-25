import { HalfFullPaintCanon, HalfFullPaintCircle } from "../types/canon";

// Half-Full Paint (type 48). Cell states: 0 unset, 1 shaded, 2 dot (marked unshaded);
// player values "col,row" -> 1 | 2, as Heyawake.
export const UNSET = 0;
export const SHADED = 1;
export const DOT = 2;

export const WHITE = 0;
export const BLACK = 1;
export const GRAY = 2;

export interface HalfFullPaintProblem {
  message: string;
  r: number;
  c: number;
}

/** Room id of every cell (walls in canon.grids) and the room count. */
export function computeRooms(canon: HalfFullPaintCanon): { ids: number[][]; count: number } {
  const { width: cols, height: rows } = canon;
  const { h, v } = canon.grids;
  const ids = Array.from({ length: rows }, () => Array<number>(cols).fill(-1));
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (ids[r][c] >= 0) continue;
      ids[r][c] = count;
      const stack: [number, number][] = [[r, c]];
      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        const next: [number, number, boolean][] = [
          [cr - 1, cc, cr > 0 && h[cr - 1]?.[cc] !== 1],
          [cr + 1, cc, cr < rows - 1 && h[cr]?.[cc] !== 1],
          [cr, cc - 1, cc > 0 && v[cr]?.[cc - 1] !== 1],
          [cr, cc + 1, cc < cols - 1 && v[cr]?.[cc] !== 1],
        ];
        for (const [nr, nc, open] of next) {
          if (open && ids[nr][nc] < 0) {
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

/** The cells (r, c) a circle at doubled (dr, dc) touches: 2 on an edge, 4 on a corner. */
export function circleCells(canon: HalfFullPaintCanon, dr: number, dc: number): [number, number][] {
  const rs = dr % 2 === 1 ? [(dr - 1) / 2] : [dr / 2 - 1, dr / 2];
  const cs = dc % 2 === 1 ? [(dc - 1) / 2] : [dc / 2 - 1, dc / 2];
  const out: [number, number][] = [];
  for (const r of rs) for (const c of cs) if (r >= 0 && r < canon.height && c >= 0 && c < canon.width) out.push([r, c]);
  return out;
}

export function emptyStates(canon: HalfFullPaintCanon): number[][] {
  return Array.from({ length: canon.height }, () => Array<number>(canon.width).fill(UNSET));
}

export function fromValues(canon: HalfFullPaintCanon, values: Record<string, number>): number[][] {
  const states = emptyStates(canon);
  for (const [key, v] of Object.entries(values)) {
    const [c, r] = key.split(",").map(Number);
    if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
    if (r < 0 || r >= canon.height || c < 0 || c >= canon.width) continue;
    if (v === SHADED || v === DOT) states[r][c] = v;
  }
  return states;
}

export function toValues(states: number[][]): Record<string, number> {
  const values: Record<string, number> = {};
  states.forEach((row, r) => row.forEach((s, c) => (s === SHADED || s === DOT) && (values[`${c},${r}`] = s)));
  return values;
}

/** Whether `cells` form one orthogonally connected group (an empty set counts). */
function connected(cells: [number, number][]): boolean {
  if (cells.length <= 1) return true;
  const set = new Set(cells.map(([r, c]) => `${r},${c}`));
  const seen = new Set<string>([`${cells[0][0]},${cells[0][1]}`]);
  const stack = [cells[0]];
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      const k = `${nr},${nc}`;
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push([nr, nc]);
      }
    }
  }
  return seen.size === cells.length;
}

function circleHolds(color: number, shaded: number, n: number): boolean {
  if (color === BLACK) return 2 * shaded > n;
  if (color === WHITE) return 2 * shaded < n;
  return 2 * shaded === n;
}

function roomCells(ids: number[][], count: number): [number, number][][] {
  const rooms: [number, number][][] = Array.from({ length: count }, () => []);
  ids.forEach((row, r) => row.forEach((id, c) => rooms[id].push([r, c])));
  return rooms;
}

/** Every circle shows its cells' majority, every room is all / none / half with each colour connected. */
export function validateHalfFullPaint(canon: HalfFullPaintCanon, states: number[][]): boolean {
  const shaded = (r: number, c: number) => states[r]?.[c] === SHADED;
  for (const circle of canon.circles) {
    const cells = circleCells(canon, circle.dr, circle.dc);
    if (!circleHolds(circle.color, cells.filter(([r, c]) => shaded(r, c)).length, cells.length)) return false;
  }
  const { ids, count } = computeRooms(canon);
  for (const cells of roomCells(ids, count)) {
    const on = cells.filter(([r, c]) => shaded(r, c));
    const off = cells.filter(([r, c]) => !shaded(r, c));
    if (on.length !== 0 && off.length !== 0 && 2 * on.length !== cells.length) return false;
    if (!connected(on) || !connected(off)) return false;
  }
  return true;
}

export interface Broken {
  circles: Set<number>; // index into canon.circles
  rooms: Set<number>; // room ids
}

/** What the player's decided cells (shaded, or dotted = unshaded) already break (Errors: On). */
export function brokenClues(canon: HalfFullPaintCanon, states: number[][]): Broken {
  const circles = new Set<number>();
  canon.circles.forEach((circle, i) => {
    const cells = circleCells(canon, circle.dr, circle.dc);
    const n = cells.length;
    const on = cells.filter(([r, c]) => states[r][c] === SHADED).length;
    const off = cells.filter(([r, c]) => states[r][c] === DOT).length;
    // The most / fewest shaded cells still possible.
    const most = n - off;
    const fewest = on;
    const ok =
      circle.color === BLACK ? 2 * most > n : circle.color === WHITE ? 2 * fewest < n : 2 * on <= n && 2 * off <= n;
    if (!ok) circles.add(i);
  });
  const rooms = new Set<number>();
  const { ids, count } = computeRooms(canon);
  roomCells(ids, count).forEach((cells, id) => {
    const n = cells.length;
    const on = cells.filter(([r, c]) => states[r][c] === SHADED);
    const off = cells.filter(([r, c]) => states[r][c] === DOT);
    if (on.length > 0 && off.length > 0) {
      // Mixed: it has to be half.
      if (n % 2 === 1 || 2 * on.length > n || 2 * off.length > n) rooms.add(id);
    }
    if (on.length + off.length === n && (!connected(on) || !connected(off))) rooms.add(id);
  });
  return { circles, rooms };
}

/** Cells shaded or dotted, over all cells, 0-100. */
export function halfFullPaintProgress(canon: HalfFullPaintCanon, states: number[][]): number {
  const total = canon.width * canon.height;
  if (total === 0) return 0;
  let decided = 0;
  states.forEach((row) => row.forEach((s) => s !== UNSET && decided++));
  return (decided / total) * 100;
}

/** Format problems: what the API's semanticChecks rejects. A board with any can't be saved. */
export function halfFullPaintFormatProblems(canon: HalfFullPaintCanon): HalfFullPaintProblem[] {
  const { width: cols, height: rows, grids, circles } = canon;
  const fits = (g: number[][], hh: number, ww: number) => g.length === hh && g.every((line) => line.length === ww);
  if (rows < 1 || cols < 1 || !fits(grids.h, rows - 1, cols) || !fits(grids.v, rows, cols - 1)) {
    return [{ message: `Walls don't match the ${cols}x${rows} grid`, r: 0, c: 0 }];
  }
  const problems: HalfFullPaintProblem[] = [];
  const { ids } = computeRooms(canon);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (
        (r < rows - 1 && grids.h[r][c] === 1 && ids[r][c] === ids[r + 1][c]) ||
        (c < cols - 1 && grids.v[r][c] === 1 && ids[r][c] === ids[r][c + 1])
      ) {
        problems.push({ message: `Wall at R${r + 1}C${c + 1} doesn't close off a room`, r, c });
      }
    }
  }
  const seen = new Set<string>();
  for (const { dr, dc } of circles) {
    const at = { r: Math.min(rows - 1, Math.floor((dr - 1) / 2)), c: Math.min(cols - 1, Math.floor((dc - 1) / 2)) };
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
export function halfFullPaintWarnings(canon: HalfFullPaintCanon): HalfFullPaintProblem[] {
  const warnings: HalfFullPaintProblem[] = [];
  if (canon.circles.length === 0) warnings.push({ message: "No circles", r: 0, c: 0 });
  if (computeRooms(canon).count <= 1) warnings.push({ message: "Only one room", r: 0, c: 0 });
  return warnings;
}

export function circleKey(circle: Pick<HalfFullPaintCircle, "dr" | "dc">): string {
  return `${circle.dr},${circle.dc}`;
}
