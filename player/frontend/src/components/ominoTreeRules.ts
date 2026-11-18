/**
 * Omino Tree rules, shared by the board (completion, live errors), the progress
 * calculator and (ported) the Android engine.
 *
 * Walls: h[r][c] = 1 is a wall between (r, c) and (r + 1, c); v[r][c] = 1 between
 * (r, c) and (r, c + 1). Player values key them "h:r,c" / "v:r,c". Blocks are the
 * connected components of cells joined across edges without a wall.
 */
import { OminoTreeArrow, OminoTreeCanon, OminoTreeDir } from "../types/canon";

export type Cell = [number, number];

export interface Walls {
  h: number[][];
  v: number[][];
}

export const DIR_STEP: Record<OminoTreeDir, Cell> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

export function arrowEnd({ r, c, dir }: OminoTreeArrow): Cell {
  const [dr, dc] = DIR_STEP[dir];
  return [r + dr, c + dc];
}

/** The wall key of the edge an arrow sits on ("h:r,c" or "v:r,c"). */
export function arrowEdgeKey(a: OminoTreeArrow): string {
  const [r2, c2] = arrowEnd(a);
  return a.dir === "up" || a.dir === "down"
    ? `h:${Math.min(a.r, r2)},${a.c}`
    : `v:${a.r},${Math.min(a.c, c2)}`;
}

export function wallsFromValues(rows: number, cols: number, values: Record<string, number>): Walls {
  const h = Array.from({ length: Math.max(rows - 1, 0) }, () => Array(cols).fill(0));
  const v = Array.from({ length: rows }, () => Array(Math.max(cols - 1, 0)).fill(0));
  for (const [key, val] of Object.entries(values)) {
    if (val !== 1) continue;
    const m = /^([hv]):(\d+),(\d+)$/.exec(key);
    if (!m) continue;
    const r = Number(m[2]);
    const c = Number(m[3]);
    if (m[1] === "h" && r < rows - 1 && c < cols) h[r][c] = 1;
    if (m[1] === "v" && r < rows && c < cols - 1) v[r][c] = 1;
  }
  return { h, v };
}

export function valuesFromWalls({ h, v }: Walls): Record<string, number> {
  const values: Record<string, number> = {};
  h.forEach((row, r) => row.forEach((x, c) => x === 1 && (values[`h:${r},${c}`] = 1)));
  v.forEach((row, r) => row.forEach((x, c) => x === 1 && (values[`v:${r},${c}`] = 1)));
  return values;
}

export interface Blocks {
  /** ids[r][c] = the block of cell (r, c) */
  ids: number[][];
  /** cells of each block, by id */
  cells: Cell[][];
}

export function computeBlocks(rows: number, cols: number, { h, v }: Walls): Blocks {
  const ids: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const cells: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (ids[r][c] >= 0) continue;
      const id = cells.length;
      const block: Cell[] = [];
      const stack: Cell[] = [[r, c]];
      ids[r][c] = id;
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        block.push([cr, cc]);
        const go = (nr: number, nc: number, open: boolean) => {
          if (open && ids[nr][nc] < 0) {
            ids[nr][nc] = id;
            stack.push([nr, nc]);
          }
        };
        if (cr > 0) go(cr - 1, cc, h[cr - 1][cc] !== 1);
        if (cr < rows - 1) go(cr + 1, cc, h[cr][cc] !== 1);
        if (cc > 0) go(cr, cc - 1, v[cr][cc - 1] !== 1);
        if (cc < cols - 1) go(cr, cc + 1, v[cr][cc] !== 1);
      }
      cells.push(block);
    }
  }
  return { ids, cells };
}

/** Shape key up to translation only. */
function shapeKey(cells: Cell[]): string {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  return cells
    .map(([r, c]) => [r - minR, c - minC] as Cell)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([r, c]) => `${r},${c}`)
    .join("|");
}

/** Whether `end` is `start` in the same orientation (translated) plus one cell. */
export function grows(start: Cell[], end: Cell[]): boolean {
  if (end.length !== start.length + 1) return false;
  const want = shapeKey(start);
  for (let i = 0; i < end.length; i++) {
    if (shapeKey(end.filter((_, j) => j !== i)) === want) return true;
  }
  return false;
}

/** Arrows whose start and end cells are both inside the grid. */
function arrowsIn(canon: OminoTreeCanon): OminoTreeArrow[] {
  const inside = ([r, c]: Cell) => r >= 0 && r < canon.rows && c >= 0 && c < canon.cols;
  return canon.arrows.filter((a) => inside([a.r, a.c]) && inside(arrowEnd(a)));
}

/** Whether an arrow's two cells are in different blocks with end = start + one cell. */
function arrowHolds(a: OminoTreeArrow, blocks: Blocks): boolean {
  const [er, ec] = arrowEnd(a);
  const s = blocks.ids[a.r][a.c];
  const e = blocks.ids[er][ec];
  return s !== e && grows(blocks.cells[s], blocks.cells[e]);
}

/**
 * Blocks that pass every rule on their own: every number equals the size, at least
 * one arrow start or end inside, and every arrow touching it holds.
 */
export function validBlockIds(canon: OminoTreeCanon, blocks: Blocks): Set<number> {
  const n = blocks.cells.length;
  const ok = Array(n).fill(true);
  const touched = Array(n).fill(false);
  blocks.cells.forEach((cells, id) => {
    for (const [r, c] of cells) {
      const num = canon.numbers[r]?.[c] ?? 0;
      if (num > 0 && num !== cells.length) ok[id] = false;
    }
  });
  for (const a of arrowsIn(canon)) {
    const [er, ec] = arrowEnd(a);
    const s = blocks.ids[a.r][a.c];
    const e = blocks.ids[er][ec];
    touched[s] = touched[e] = true;
    if (!arrowHolds(a, blocks)) ok[s] = ok[e] = false;
  }
  const out = new Set<number>();
  for (let id = 0; id < n; id++) if (ok[id] && touched[id]) out.add(id);
  return out;
}

/** Whether every wall separates two different blocks. */
function noDanglingWalls(walls: Walls, blocks: Blocks): boolean {
  const { ids } = blocks;
  for (let r = 0; r < walls.h.length; r++)
    for (let c = 0; c < walls.h[r].length; c++) if (walls.h[r][c] === 1 && ids[r][c] === ids[r + 1][c]) return false;
  for (let r = 0; r < walls.v.length; r++)
    for (let c = 0; c < walls.v[r].length; c++) if (walls.v[r][c] === 1 && ids[r][c] === ids[r][c + 1]) return false;
  return true;
}

export function validateOminoTree(canon: OminoTreeCanon, walls: Walls): boolean {
  const blocks = computeBlocks(canon.rows, canon.cols, walls);
  return validBlockIds(canon, blocks).size === blocks.cells.length && noDanglingWalls(walls, blocks);
}

/** (cells in valid blocks / all cells) * 100. */
export function ominoTreeProgress(canon: OminoTreeCanon, walls: Walls): number {
  const total = canon.rows * canon.cols;
  if (total === 0) return 0;
  const blocks = computeBlocks(canon.rows, canon.cols, walls);
  let counted = 0;
  for (const id of validBlockIds(canon, blocks)) counted += blocks.cells[id].length;
  return (counted / total) * 100;
}

export interface LiveErrors {
  /** "r,c" of numbers to outline red */
  numbers: Set<string>;
  /** indices into canon.arrows to draw red */
  arrows: Set<number>;
}

/**
 * Errors that drawing more walls can't fix: a number whose block is already smaller
 * than it; an arrow between two complete blocks (each with a number, every number
 * equal to its size) where the end isn't the start plus one cell.
 */
export function liveErrors(canon: OminoTreeCanon, walls: Walls): LiveErrors {
  const blocks = computeBlocks(canon.rows, canon.cols, walls);
  const numbers = new Set<string>();
  const complete = blocks.cells.map((cells) => {
    let hasNumber = false;
    let allMatch = true;
    for (const [r, c] of cells) {
      const num = canon.numbers[r]?.[c] ?? 0;
      if (num === 0) continue;
      hasNumber = true;
      if (num !== cells.length) allMatch = false;
      if (cells.length < num) numbers.add(`${r},${c}`);
    }
    return hasNumber && allMatch;
  });
  const arrows = new Set<number>();
  const inside = ([r, c]: Cell) => r >= 0 && r < canon.rows && c >= 0 && c < canon.cols;
  canon.arrows.forEach((a, i) => {
    if (!inside([a.r, a.c]) || !inside(arrowEnd(a))) return;
    const [er, ec] = arrowEnd(a);
    const s = blocks.ids[a.r][a.c];
    const e = blocks.ids[er][ec];
    if (s !== e && complete[s] && complete[e] && !grows(blocks.cells[s], blocks.cells[e])) arrows.add(i);
  });
  return { numbers, arrows };
}

/** Format problems the editor lists and the API rejects. */
export function ominoTreeFormatProblems(canon: OminoTreeCanon): string[] {
  const problems: string[] = [];
  const { rows, cols, numbers, arrows } = canon;
  if (numbers.length !== rows || numbers.some((row) => row.length !== cols)) {
    problems.push(`Numbers must be ${rows}x${cols}`);
  }
  const seen = new Set<string>();
  for (const a of arrows) {
    const [r2, c2] = arrowEnd(a);
    if (a.r < 0 || a.r >= rows || a.c < 0 || a.c >= cols || r2 < 0 || r2 >= rows || c2 < 0 || c2 >= cols) {
      problems.push(`Arrow ${a.dir} from (${a.r},${a.c}) leaves the grid`);
      continue;
    }
    const key = arrowEdgeKey(a);
    if (seen.has(key)) problems.push(`Two arrows on the edge at (${a.r},${a.c}) ${a.dir}`);
    seen.add(key);
  }
  return problems;
}
