import { CountryRoadCanon } from "../types/canon";

// Cell marks (player values "m:r,c" and answer `marks`).
export const NO_MARK = 0;
export const CROSS = 1; // the loop skips this cell
export const DOT = 2; // the loop uses this cell

export interface Loop {
  // rows x (cols - 1): segment between (r, c) and (r, c + 1)
  h: number[][];
  // (rows - 1) x cols: segment between (r, c) and (r + 1, c)
  v: number[][];
}

export interface CountryRoadProblem {
  message: string;
  r: number;
  c: number;
}

export function dims(canon: CountryRoadCanon): { rows: number; cols: number } {
  return { rows: canon.cells.length, cols: canon.cells[0]?.length ?? 0 };
}

/** Wall between (r, c) and the cell below / right of it (the border counts). */
export function wallBelow(canon: CountryRoadCanon, r: number, c: number): boolean {
  return canon.grids.h[r]?.[c] === 1;
}

export function wallRight(canon: CountryRoadCanon, r: number, c: number): boolean {
  return canon.grids.v[r]?.[c] === 1;
}

/** Room id of every cell and the room count. */
export function computeRooms(canon: CountryRoadCanon): { ids: number[][]; count: number } {
  const { rows, cols } = dims(canon);
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
          [cr - 1, cc, cr > 0 && !wallBelow(canon, cr - 1, cc)],
          [cr + 1, cc, cr < rows - 1 && !wallBelow(canon, cr, cc)],
          [cr, cc - 1, cc > 0 && !wallRight(canon, cr, cc - 1)],
          [cr, cc + 1, cc < cols - 1 && !wallRight(canon, cr, cc)],
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

export function emptyLoop(rows: number, cols: number): Loop {
  return {
    h: Array.from({ length: rows }, () => Array(Math.max(cols - 1, 0)).fill(0)),
    v: Array.from({ length: Math.max(rows - 1, 0) }, () => Array(cols).fill(0)),
  };
}

/** The loop and marks held in player values ("h:r,c", "v:r,c", "m:r,c"). */
export function fromValues(
  rows: number,
  cols: number,
  values: Record<string, number>
): { loop: Loop; marks: number[][] } {
  const loop = emptyLoop(rows, cols);
  const marks = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (const [key, val] of Object.entries(values)) {
    const kind = key.slice(0, 2);
    const [r, c] = key.slice(2).split(",").map(Number);
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0) continue;
    if (kind === "h:" && r < rows && c < cols - 1 && val === 1) loop.h[r][c] = 1;
    else if (kind === "v:" && r < rows - 1 && c < cols && val === 1) loop.v[r][c] = 1;
    else if (kind === "m:" && r < rows && c < cols && (val === CROSS || val === DOT)) marks[r][c] = val;
  }
  return { loop, marks };
}

export function toValues(loop: Loop, marks: number[][]): Record<string, number> {
  const values: Record<string, number> = {};
  loop.h.forEach((row, r) => row.forEach((x, c) => x === 1 && (values[`h:${r},${c}`] = 1)));
  loop.v.forEach((row, r) => row.forEach((x, c) => x === 1 && (values[`v:${r},${c}`] = 1)));
  marks.forEach((row, r) => row.forEach((m, c) => m !== NO_MARK && (values[`m:${r},${c}`] = m)));
  return values;
}

/** Loop segments at each cell. */
export function degrees(rows: number, cols: number, loop: Loop): number[][] {
  const deg = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (loop.h[r]?.[c] === 1) {
        deg[r][c]++;
        deg[r][c + 1]++;
      }
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (loop.v[r]?.[c] === 1) {
        deg[r][c]++;
        deg[r + 1][c]++;
      }
    }
  }
  return deg;
}

interface RoomState {
  loopCells: number[]; // per room
  crossings: number[]; // loop segments leaving each room
  closed: boolean[]; // two crossings and no loose end inside: the loop has passed through
  number: (number | null)[]; // the room's number (first found)
  numberAt: ([number, number] | null)[];
}

function roomState(canon: CountryRoadCanon, loop: Loop): RoomState {
  const { rows, cols } = dims(canon);
  const { ids, count } = computeRooms(canon);
  const deg = degrees(rows, cols, loop);
  const s: RoomState = {
    loopCells: Array(count).fill(0),
    crossings: Array(count).fill(0),
    closed: Array(count).fill(true),
    number: Array(count).fill(null),
    numberAt: Array(count).fill(null),
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = ids[r][c];
      if (deg[r][c] > 0) s.loopCells[id]++;
      if (deg[r][c] === 1) s.closed[id] = false;
      if (canon.cells[r][c] > 0 && s.number[id] === null) {
        s.number[id] = canon.cells[r][c];
        s.numberAt[id] = [r, c];
      }
      if (c < cols - 1 && loop.h[r]?.[c] === 1 && ids[r][c + 1] !== id) {
        s.crossings[id]++;
        s.crossings[ids[r][c + 1]]++;
      }
      if (r < rows - 1 && loop.v[r]?.[c] === 1 && ids[r + 1][c] !== id) {
        s.crossings[id]++;
        s.crossings[ids[r + 1][c]]++;
      }
    }
  }
  for (let id = 0; id < count; id++) if (s.crossings[id] !== 2) s.closed[id] = false;
  return s;
}

/** The segments form exactly one closed loop (no branches, no loose ends, one piece). */
export function isSingleLoop(rows: number, cols: number, loop: Loop): boolean {
  const deg = degrees(rows, cols, loop);
  let start: [number, number] | null = null;
  let used = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (deg[r][c] === 0) continue;
      if (deg[r][c] !== 2) return false;
      used++;
      start ??= [r, c];
    }
  }
  if (!start) return false;
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const stack = [start];
  seen[start[0]][start[1]] = true;
  let reached = 0;
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    reached++;
    const next: [number, number, boolean][] = [
      [r, c + 1, loop.h[r]?.[c] === 1],
      [r, c - 1, c > 0 && loop.h[r]?.[c - 1] === 1],
      [r + 1, c, loop.v[r]?.[c] === 1],
      [r - 1, c, r > 0 && loop.v[r - 1]?.[c] === 1],
    ];
    for (const [nr, nc, on] of next) {
      if (on && !seen[nr][nc]) {
        seen[nr][nc] = true;
        stack.push([nr, nc]);
      }
    }
  }
  return reached === used;
}

/** Pairs of unused cells touching across a wall, as "r,c|r,c" keys (below / right). */
function unusedAcrossWalls(canon: CountryRoadCanon, unused: (r: number, c: number) => boolean): string[] {
  const { rows, cols } = dims(canon);
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!unused(r, c)) continue;
      if (r < rows - 1 && wallBelow(canon, r, c) && unused(r + 1, c)) out.push(`${r},${c}|${r + 1},${c}`);
      if (c < cols - 1 && wallRight(canon, r, c) && unused(r, c + 1)) out.push(`${r},${c}|${r},${c + 1}`);
    }
  }
  return out;
}

/** The four rules. */
export function validateCountryRoad(canon: CountryRoadCanon, loop: Loop): boolean {
  const { rows, cols } = dims(canon);
  if (rows === 0 || cols === 0 || !isSingleLoop(rows, cols, loop)) return false;
  const s = roomState(canon, loop);
  const rooms = s.loopCells.length;
  for (let id = 0; id < rooms; id++) {
    if (s.loopCells[id] === 0) return false; // every room visited
    if (rooms > 1 && s.crossings[id] !== 2) return false; // entered and left once
    const n = s.number[id];
    if (n !== null && s.loopCells[id] !== n) return false;
  }
  const deg = degrees(rows, cols, loop);
  return unusedAcrossWalls(canon, (r, c) => deg[r][c] === 0).length === 0;
}

export interface Broken {
  numbers: Set<string>; // "r,c" of a number cell
  rooms: Set<number>; // room ids crossed more than twice
  crosses: Set<string>; // "r,c" of × cells touching another × across a wall
}

/** What the player's decided marks already break (Errors: On). */
export function brokenClues(canon: CountryRoadCanon, loop: Loop, marks: number[][]): Broken {
  const s = roomState(canon, loop);
  const numbers = new Set<string>();
  const rooms = new Set<number>();
  s.number.forEach((n, id) => {
    if (n === null) return;
    const over = s.loopCells[id] > n;
    const wrongDone = s.closed[id] && s.loopCells[id] !== n;
    if (over || wrongDone) numbers.add(s.numberAt[id]!.join(","));
  });
  s.crossings.forEach((x, id) => x > 2 && rooms.add(id));
  const crosses = new Set<string>();
  for (const pair of unusedAcrossWalls(canon, (r, c) => marks[r]?.[c] === CROSS)) {
    for (const cell of pair.split("|")) crosses.add(cell);
  }
  return { numbers, rooms, crosses };
}

/** Cells touched by a loop segment or carrying a mark, over all cells, 0-100. */
export function countryRoadProgress(canon: CountryRoadCanon, loop: Loop, marks: number[][]): number {
  const { rows, cols } = dims(canon);
  if (rows * cols === 0) return 0;
  const deg = degrees(rows, cols, loop);
  let decided = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (deg[r][c] > 0 || (marks[r]?.[c] ?? 0) !== NO_MARK) decided++;
    }
  }
  return (decided / (rows * cols)) * 100;
}

/** Format problems: what the API's semanticChecks rejects. A board with any can't be saved. */
export function countryRoadFormatProblems(canon: CountryRoadCanon): CountryRoadProblem[] {
  const { rows, cols } = dims(canon);
  if (rows === 0 || cols === 0 || canon.cells.some((row) => row.length !== cols)) {
    return [{ message: "Rows of cells differ in length", r: 0, c: 0 }];
  }
  const fits = (g: number[][], h: number, w: number) => g.length === h && g.every((line) => line.length === w);
  if (!fits(canon.grids.h, rows - 1, cols) || !fits(canon.grids.v, rows, cols - 1)) {
    return [{ message: `Walls don't match the ${cols}x${rows} grid`, r: 0, c: 0 }];
  }
  const problems: CountryRoadProblem[] = [];
  const { ids } = computeRooms(canon);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (
        (r < rows - 1 && wallBelow(canon, r, c) && ids[r][c] === ids[r + 1][c]) ||
        (c < cols - 1 && wallRight(canon, r, c) && ids[r][c] === ids[r][c + 1])
      ) {
        problems.push({ message: `Wall at R${r + 1}C${c + 1} doesn't close off a room`, r, c });
      }
    }
  }
  const first = new Map<number, string>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canon.cells[r][c] <= 0) continue;
      const prev = first.get(ids[r][c]);
      if (prev) problems.push({ message: `Two numbers in one room (${prev} and R${r + 1}C${c + 1})`, r, c });
      else first.set(ids[r][c], `R${r + 1}C${c + 1}`);
    }
  }
  return problems;
}

/** Misread warnings: suspicious but saveable once overridden. */
export function countryRoadWarnings(canon: CountryRoadCanon): CountryRoadProblem[] {
  const { rows, cols } = dims(canon);
  const { ids, count } = computeRooms(canon);
  const size = Array(count).fill(0);
  ids.forEach((row) => row.forEach((id) => size[id]++));
  const warnings: CountryRoadProblem[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = canon.cells[r][c];
      if (n > 0 && n > size[ids[r][c]]) {
        warnings.push({ message: `Number ${n} at R${r + 1}C${c + 1} is more than its room's ${size[ids[r][c]]} cells`, r, c });
      }
    }
  }
  if (count <= 1) warnings.push({ message: "Only one room", r: 0, c: 0 });
  return warnings;
}
