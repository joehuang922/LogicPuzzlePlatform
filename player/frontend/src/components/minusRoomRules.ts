/**
 * Minus Room rules, shared by the board (completion, live errors), the progress
 * calculator and (ported) the Android engine.
 *
 * Player values are keyed "col,row" -> number (as Ripple Effect). A grid holds the
 * number of every cell, 0 for empty. Blocks are the components of equal numbers joined
 * across edges inside one room; equal numbers across a wall don't join.
 */
import { MinusRoomCanon, MinusRoomCircle } from "../types/canon";

export type Cell = [number, number];

/** Every cell's number: the given, else the player's value in 1..max, else 0. */
export function gridOf(canon: MinusRoomCanon, values: Record<string, number>): number[][] {
  return Array.from({ length: canon.rows }, (_, r) =>
    Array.from({ length: canon.cols }, (_, c) => {
      const given = canon.cells[r]?.[c] ?? 0;
      if (given > 0) return given;
      const v = values[`${c},${r}`];
      return typeof v === "number" && v >= 1 && v <= canon.max ? v : 0;
    })
  );
}

const wallH = (canon: MinusRoomCanon, r: number, c: number) => canon.edges.h[r]?.[c] === 1;
const wallV = (canon: MinusRoomCanon, r: number, c: number) => canon.edges.v[r]?.[c] === 1;

/** Room id per cell. */
export function roomIds(canon: MinusRoomCanon): number[][] {
  const { rows, cols } = canon;
  const ids = Array.from({ length: rows }, () => Array<number>(cols).fill(-1));
  let next = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (ids[r][c] >= 0) continue;
      ids[r][c] = next;
      const stack: Cell[] = [[r, c]];
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        const open: [number, number, boolean][] = [
          [cr - 1, cc, cr > 0 && !wallH(canon, cr - 1, cc)],
          [cr + 1, cc, cr < rows - 1 && !wallH(canon, cr, cc)],
          [cr, cc - 1, cc > 0 && !wallV(canon, cr, cc - 1)],
          [cr, cc + 1, cc < cols - 1 && !wallV(canon, cr, cc)],
        ];
        for (const [nr, nc, ok] of open) {
          if (ok && ids[nr][nc] < 0) {
            ids[nr][nc] = next;
            stack.push([nr, nc]);
          }
        }
      }
      next++;
    }
  }
  return ids;
}

export interface Block {
  num: number;
  room: number;
  cells: Cell[];
  /** whether an empty cell of the same room touches it (it could still grow) */
  open: boolean;
}

/** The blocks of the filled cells. */
export function blocksOf(canon: MinusRoomCanon, grid: number[][], rooms: number[][]): Block[] {
  const { rows, cols } = canon;
  const seen = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const out: Block[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const num = grid[r][c];
      if (num === 0 || seen[r][c]) continue;
      const room = rooms[r][c];
      const cells: Cell[] = [];
      let open = false;
      const stack: Cell[] = [[r, c]];
      seen[r][c] = true;
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        cells.push([cr, cc]);
        for (const [nr, nc] of [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]] as Cell[]) {
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || rooms[nr][nc] !== room) continue;
          if (grid[nr][nc] === 0) open = true;
          else if (grid[nr][nc] === num && !seen[nr][nc]) {
            seen[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      out.push({ num, room, cells, open });
    }
  }
  return out;
}

/** The two cells of a circle, or null when it isn't on an edge inside the grid. */
export function circleCells(canon: MinusRoomCanon, { dr, dc }: MinusRoomCircle): [Cell, Cell] | null {
  if ((dr + dc) % 2 !== 1 || dr < 0 || dc < 0 || dr > 2 * (canon.rows - 1) || dc > 2 * (canon.cols - 1)) return null;
  return [
    [Math.floor(dr / 2), Math.floor(dc / 2)],
    [Math.ceil(dr / 2), Math.ceil(dc / 2)],
  ];
}

/** Top-left corners "r,c" of 2x2 squares of four equal numbers. */
function squares(grid: number[][]): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r + 1 < grid.length; r++) {
    for (let c = 0; c + 1 < grid[r].length; c++) {
      const v = grid[r][c];
      if (v > 0 && grid[r][c + 1] === v && grid[r + 1][c] === v && grid[r + 1][c + 1] === v) out.push([r, c]);
    }
  }
  return out;
}

export function validateMinusRoom(canon: MinusRoomCanon, values: Record<string, number>): boolean {
  const grid = gridOf(canon, values);
  if (grid.some((row) => row.some((v) => v === 0))) return false;
  const rooms = roomIds(canon);
  const perRoom = new Set<string>();
  for (const b of blocksOf(canon, grid, rooms)) {
    if (b.cells.length !== b.num) return false;
    const key = `${b.room}:${b.num}`;
    if (perRoom.has(key)) return false;
    perRoom.add(key);
  }
  for (const circle of canon.circles) {
    const cells = circleCells(canon, circle);
    if (!cells) return false;
    const [[r1, c1], [r2, c2]] = cells;
    if (Math.abs(grid[r1][c1] - grid[r2][c2]) !== circle.value) return false;
  }
  return squares(grid).length === 0;
}

/** (non-given cells holding a number / non-given cells) * 100. */
export function minusRoomProgress(canon: MinusRoomCanon, values: Record<string, number>): number {
  const grid = gridOf(canon, values);
  let open = 0;
  let filled = 0;
  for (let r = 0; r < canon.rows; r++) {
    for (let c = 0; c < canon.cols; c++) {
      if ((canon.cells[r]?.[c] ?? 0) > 0) continue;
      open++;
      if (grid[r][c] > 0) filled++;
    }
  }
  return open === 0 ? 100 : (filled / open) * 100;
}

export interface LiveErrors {
  /** "r,c" of cells to draw red */
  cells: Set<string>;
  /** indices into canon.circles to ring red */
  circles: Set<number>;
}

/**
 * Errors more numbers can't fix: a block bigger than its number, or smaller with no
 * empty cell of its room beside it; two complete blocks of one number in a room; a
 * circle whose two filled cells differ by the wrong amount; a 2x2 of equal numbers.
 */
export function liveErrors(canon: MinusRoomCanon, values: Record<string, number>): LiveErrors {
  const grid = gridOf(canon, values);
  const rooms = roomIds(canon);
  const cells = new Set<string>();
  const mark = (list: Cell[]) => list.forEach(([r, c]) => cells.add(`${r},${c}`));
  const complete = new Map<string, Block[]>();
  for (const b of blocksOf(canon, grid, rooms)) {
    const size = b.cells.length;
    if (size > b.num || (size < b.num && !b.open)) mark(b.cells);
    if (size === b.num) {
      const key = `${b.room}:${b.num}`;
      complete.set(key, [...(complete.get(key) ?? []), b]);
    }
  }
  for (const list of complete.values()) if (list.length > 1) list.forEach((b) => mark(b.cells));
  for (const [r, c] of squares(grid)) mark([[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]]);
  const circles = new Set<number>();
  canon.circles.forEach((circle, i) => {
    const pair = circleCells(canon, circle);
    if (!pair) return;
    const [[r1, c1], [r2, c2]] = pair;
    const a = grid[r1][c1];
    const b = grid[r2][c2];
    if (a > 0 && b > 0 && Math.abs(a - b) !== circle.value) circles.add(i);
  });
  return { cells, circles };
}

/** Walls that don't separate two rooms (end inside one), as "h:r,c" / "v:r,c". */
export function danglingWalls(canon: MinusRoomCanon): string[] {
  const rooms = roomIds(canon);
  const out: string[] = [];
  canon.edges.h.forEach((row, r) =>
    row.forEach((w, c) => w === 1 && rooms[r]?.[c] === rooms[r + 1]?.[c] && out.push(`h:${r},${c}`))
  );
  canon.edges.v.forEach((row, r) =>
    row.forEach((w, c) => w === 1 && rooms[r]?.[c] === rooms[r]?.[c + 1] && out.push(`v:${r},${c}`))
  );
  return out;
}

/** Format problems the editor lists and the API rejects. */
export function minusRoomFormatProblems(canon: MinusRoomCanon): string[] {
  const { rows, cols, max, cells, edges, circles } = canon;
  const problems: string[] = [];
  if (cells.length !== rows || cells.some((row) => row.length !== cols)) problems.push(`Cells must be ${rows}x${cols}`);
  const fits = (g: number[][], h: number, w: number) => g.length === h && g.every((row) => row.length === w);
  if (!fits(edges.h, rows - 1, cols) || !fits(edges.v, rows, cols - 1)) {
    problems.push(`Walls must fit the ${rows}x${cols} grid`);
    return problems;
  }
  cells.forEach((row, r) =>
    row.forEach((v, c) => v > max && problems.push(`Given ${v} at (${r},${c}) is above ${max}`))
  );
  const dangling = danglingWalls(canon);
  if (dangling.length) problems.push(`${dangling.length} wall${dangling.length > 1 ? "s end" : " ends"} inside a room`);
  const seen = new Set<string>();
  for (const circle of circles) {
    const at = `(${circle.dr},${circle.dc})`;
    if (!circleCells(canon, circle)) problems.push(`Circle at ${at} is not on an edge between two cells`);
    if (circle.value > max - 1) problems.push(`Circle ${circle.value} at ${at} is ${max} or more`);
    if (seen.has(at)) problems.push(`Two circles at ${at}`);
    seen.add(at);
  }
  return problems;
}
