/**
 * L-Ring (type 33) rules, shared by the board, progress and tests.
 *
 * Cells: 0 = empty, 1-4 = an arrow pointing up / right / down / left. A single loop runs
 * through cell centres, passes every arrow cell and turns there; the arm in the arrow's
 * direction (segments walked straight from the arrow cell until the loop turns) is
 * exactly one longer than the other arm.
 */

export interface Edges {
  h: number[][];
  v: number[][];
}

export const EMPTY = 0;
/** Row/col step for arrow codes 1-4 (up, right, down, left). */
export const ARROW_STEP: Record<number, [number, number]> = {
  1: [-1, 0],
  2: [0, 1],
  3: [1, 0],
  4: [0, -1],
};

export function isArrow(v: number): boolean {
  return v >= 1 && v <= 4;
}

/** True when there is a segment from (r, c) one step along (dr, dc). */
function linked(e: Edges, r: number, c: number, dr: number, dc: number): boolean {
  if (dr === 0) {
    const cc = dc > 0 ? c : c - 1;
    return e.h[r]?.[cc] === 1;
  }
  const rr = dr > 0 ? r : r - 1;
  return e.v[rr]?.[c] === 1;
}

const DIRS: [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]];

function degree(e: Edges, r: number, c: number): number {
  return DIRS.filter(([dr, dc]) => linked(e, r, c, dr, dc)).length;
}

/**
 * Length of the arm leaving (r, c) along (dr, dc): segments walked straight until the
 * loop turns. null while undecided (no segment that way, or the line stops or runs off
 * without turning).
 */
export function armLength(e: Edges, r: number, c: number, dr: number, dc: number, rows: number, cols: number): number | null {
  if (!linked(e, r, c, dr, dc)) return null;
  let len = 0;
  let cr = r;
  let cc = c;
  while (linked(e, cr, cc, dr, dc)) {
    cr += dr;
    cc += dc;
    len++;
    if (len > rows * cols) return null;
  }
  // Stopped at (cr, cc): it must leave at a right angle.
  if (degree(e, cr, cc) !== 2) return null;
  return len;
}

export type ArrowState = "ok" | "bad" | "open";

/**
 * "ok" when the arrow cell turns with one arm in the arrow's direction and that arm is
 * exactly one longer than the other; "bad" when that is already impossible; "open"
 * otherwise.
 */
export function arrowState(cells: number[][], e: Edges, r: number, c: number): ArrowState {
  const step = ARROW_STEP[cells[r][c]];
  if (!step) return "open";
  const rows = cells.length;
  const cols = cells[0].length;
  const [ar, ac] = step;
  const deg = degree(e, r, c);
  if (deg > 2) return "bad";
  // A segment straight back against the arrow, or no room for the arrow's arm.
  if (linked(e, r, c, -ar, -ac)) return "bad";
  const tr = r + ar;
  const tc = c + ac;
  if (tr < 0 || tr >= rows || tc < 0 || tc >= cols) return "bad";
  if (deg < 2 || !linked(e, r, c, ar, ac)) return "open";
  const other = DIRS.find(([dr, dc]) => !(dr === ar && dc === ac) && linked(e, r, c, dr, dc))!;
  const main = armLength(e, r, c, ar, ac, rows, cols);
  const side = armLength(e, r, c, other[0], other[1], rows, cols);
  if (main === null || side === null) return "open";
  return main === side + 1 ? "ok" : "bad";
}

export function satisfiedArrows(cells: number[][], e: Edges): number {
  let n = 0;
  for (let r = 0; r < cells.length; r++)
    for (let c = 0; c < cells[r].length; c++)
      if (isArrow(cells[r][c]) && arrowState(cells, e, r, c) === "ok") n++;
  return n;
}

/** One closed loop (every cell degree 0 or 2, all loop cells connected) and every arrow ok. */
export function validateLRing(cells: number[][], e: Edges): boolean {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  let loopCells = 0;
  let start: [number, number] | null = null;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const d = degree(e, r, c);
      if (d !== 0 && d !== 2) return false;
      if (d === 2) {
        loopCells++;
        start ??= [r, c];
      }
      if (isArrow(cells[r][c]) && arrowState(cells, e, r, c) !== "ok") return false;
    }
  }
  if (!start) return false;
  const seen = new Set<string>([start.join(",")]);
  const stack = [start];
  while (stack.length) {
    const [r, c] = stack.pop()!;
    for (const [dr, dc] of DIRS) {
      if (!linked(e, r, c, dr, dc)) continue;
      const k = `${r + dr},${c + dc}`;
      if (!seen.has(k)) {
        seen.add(k);
        stack.push([r + dr, c + dc]);
      }
    }
  }
  return seen.size === loopCells;
}

/** Edges from userValues keyed "h:r,c" / "v:r,c". */
export function edgesFromValues(rows: number, cols: number, values: Record<string, number>): Edges {
  const h = Array.from({ length: rows }, () => Array(Math.max(cols - 1, 0)).fill(0));
  const v = Array.from({ length: Math.max(rows - 1, 0) }, () => Array(cols).fill(0));
  for (const [key, val] of Object.entries(values)) {
    if (val !== 1) continue;
    const [r, c] = key.slice(2).split(",").map(Number);
    if (key.startsWith("h:") && r >= 0 && r < rows && c >= 0 && c < cols - 1) h[r][c] = 1;
    if (key.startsWith("v:") && r >= 0 && r < rows - 1 && c >= 0 && c < cols) v[r][c] = 1;
  }
  return { h, v };
}

/** Overridable misread warnings for the editor. */
export function lRingWarnings(cells: number[][]): string[] {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const warnings: string[] = [];
  let arrows = 0;
  const names: Record<number, string> = { 1: "up", 2: "right", 3: "down", 4: "left" };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = cells[r][c];
      if (!isArrow(v)) continue;
      arrows++;
      const [dr, dc] = ARROW_STEP[v];
      if (r + dr < 0 || r + dr >= rows || c + dc < 0 || c + dc >= cols) {
        warnings.push(`Row ${r + 1}, column ${c + 1}: the ${names[v]} arrow points off the board`);
      }
    }
  }
  if (arrows === 0) warnings.unshift("No arrows");
  return warnings;
}
