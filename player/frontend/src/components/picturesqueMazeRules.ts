// Picturesque Maze (type 44) rules, shared by the board, the editor and the progress
// calculator. The Android engine and authoring port these functions.
import { MazeOpening, PicturesqueMazeAnswer, PicturesqueMazeCanon } from "../types/canon";

export type Cell = [number, number];

/** The border cell an opening opens, or null when its index is off the board. */
export function openingCell(o: MazeOpening, width: number, height: number): Cell | null {
  const limit = o.side === "top" || o.side === "bottom" ? width : height;
  if (!Number.isInteger(o.index) || o.index < 0 || o.index >= limit) return null;
  switch (o.side) {
    case "top": return [0, o.index];
    case "bottom": return [height - 1, o.index];
    case "left": return [o.index, 0];
    case "right": return [o.index, width - 1];
  }
}

/** True when (r1,c1) and (r2,c2) are orthogonal neighbours with no wall between them. */
export function isOpen(canon: PicturesqueMazeCanon, r1: number, c1: number, r2: number, c2: number): boolean {
  const { width, height, walls } = canon;
  if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0 || r1 >= height || r2 >= height || c1 >= width || c2 >= width) {
    return false;
  }
  if (r1 === r2 && Math.abs(c1 - c2) === 1) return !walls.v[r1][Math.min(c1, c2)];
  if (c1 === c2 && Math.abs(r1 - r2) === 1) return !walls.h[Math.min(r1, r2)][c1];
  return false;
}

const STEPS: Cell[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** Open neighbours of a cell. */
export function openNeighbours(canon: PicturesqueMazeCanon, r: number, c: number): Cell[] {
  const out: Cell[] = [];
  for (const [dr, dc] of STEPS) {
    if (isOpen(canon, r, c, r + dr, c + dc)) out.push([r + dr, c + dc]);
  }
  return out;
}

function bfs(canon: PicturesqueMazeCanon, start: Cell): { dist: number[]; ways: number[]; parent: number[] } {
  const { width, height } = canon;
  const n = width * height;
  const dist = new Array<number>(n).fill(-1);
  const ways = new Array<number>(n).fill(0);
  const parent = new Array<number>(n).fill(-1);
  const s = start[0] * width + start[1];
  dist[s] = 0;
  ways[s] = 1;
  const queue = [s];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const r = Math.floor(cur / width);
    const c = cur % width;
    for (const [nr, nc] of openNeighbours(canon, r, c)) {
      const nb = nr * width + nc;
      if (dist[nb] < 0) {
        dist[nb] = dist[cur] + 1;
        parent[nb] = cur;
        queue.push(nb);
      }
      if (dist[nb] === dist[cur] + 1) ways[nb] = Math.min(2, ways[nb] + ways[cur]);
    }
  }
  return { dist, ways, parent };
}

export interface MazeSolution {
  /** A shortest route from the entrance cell to the exit cell, or null if none. */
  route: Cell[] | null;
  /** True when exactly one shortest route exists. */
  unique: boolean;
}

export function solveMaze(canon: PicturesqueMazeCanon): MazeSolution {
  const { width, height } = canon;
  const start = openingCell(canon.entrance, width, height);
  const goal = openingCell(canon.exit, width, height);
  if (!start || !goal || !wallShapeOk(canon)) return { route: null, unique: false };
  const { dist, ways, parent } = bfs(canon, start);
  const g = goal[0] * width + goal[1];
  if (dist[g] < 0) return { route: null, unique: false };
  const route: Cell[] = [];
  for (let cur = g; cur >= 0; cur = parent[cur]) route.push([Math.floor(cur / width), cur % width]);
  route.reverse();
  return { route, unique: ways[g] === 1 };
}

function wallShapeOk(canon: PicturesqueMazeCanon): boolean {
  const { width, height, walls } = canon;
  return (
    walls.h.length === height - 1 &&
    walls.h.every((row) => row.length === width) &&
    walls.v.length === height &&
    walls.v.every((row) => row.length === width - 1)
  );
}

/** Cells shared by some but not all shortest routes (where tied routes part ways). */
export function tiedRouteCells(canon: PicturesqueMazeCanon): Cell[] {
  const { width, height } = canon;
  const start = openingCell(canon.entrance, width, height);
  const goal = openingCell(canon.exit, width, height);
  if (!start || !goal || !wallShapeOk(canon)) return [];
  const a = bfs(canon, start).dist;
  const b = bfs(canon, goal).dist;
  const total = a[goal[0] * width + goal[1]];
  if (total < 0) return [];
  const perLayer = new Map<number, number[]>();
  for (let i = 0; i < width * height; i++) {
    if (a[i] >= 0 && b[i] >= 0 && a[i] + b[i] === total) {
      const layer = perLayer.get(a[i]) ?? [];
      layer.push(i);
      perLayer.set(a[i], layer);
    }
  }
  const out: Cell[] = [];
  for (const layer of perLayer.values()) {
    if (layer.length > 1) for (const i of layer) out.push([Math.floor(i / width), i % width]);
  }
  return out;
}

/** Format problems: the canon can't be a question. The API rejects the same. */
export function picturesqueMazeFormatProblems(canon: PicturesqueMazeCanon): string[] {
  const { width, height, entrance, exit } = canon;
  const problems: string[] = [];
  if (!wallShapeOk(canon)) {
    problems.push(`Wall arrays don't match a ${width} x ${height} grid`);
    return problems;
  }
  const s = openingCell(entrance, width, height);
  const g = openingCell(exit, width, height);
  if (!s) problems.push(`Entrance (${entrance.side} ${entrance.index}) is off the board`);
  if (!g) problems.push(`Exit (${exit.side} ${exit.index}) is off the board`);
  if (!s || !g) return problems;
  if (entrance.side === exit.side && entrance.index === exit.index) {
    problems.push("Entrance and exit are the same opening");
    return problems;
  }
  const { route, unique } = solveMaze(canon);
  if (!route) problems.push("No route from the entrance to the exit");
  else if (!unique) problems.push("The shortest route is not unique");
  return problems;
}

export interface MazeWarnings {
  /** Cells on a loop of open passages. */
  loopCells: Cell[];
  /** Cells no route from the entrance reaches. */
  unreachable: Cell[];
}

/**
 * Misread warnings (overridable): a perfect maze has no loops and no sealed-off
 * cells. Both are legal, but on the publishers' mazes they usually mean a misread wall.
 */
export function picturesqueMazeWarnings(canon: PicturesqueMazeCanon): MazeWarnings {
  const { width, height } = canon;
  if (!wallShapeOk(canon)) return { loopCells: [], unreachable: [] };
  const n = width * height;
  // 2-core of the passage graph: peel cells with at most one remaining open side.
  const degree = new Array<number>(n).fill(0);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) degree[r * width + c] = openNeighbours(canon, r, c).length;
  }
  const removed = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) if (degree[i] <= 1) stack.push(i);
  while (stack.length) {
    const i = stack.pop()!;
    if (removed[i]) continue;
    removed[i] = true;
    for (const [nr, nc] of openNeighbours(canon, Math.floor(i / width), i % width)) {
      const j = nr * width + nc;
      if (removed[j]) continue;
      degree[j]--;
      if (degree[j] <= 1) stack.push(j);
    }
  }
  const loopCells: Cell[] = [];
  for (let i = 0; i < n; i++) if (!removed[i]) loopCells.push([Math.floor(i / width), i % width]);
  const unreachable: Cell[] = [];
  const start = openingCell(canon.entrance, width, height);
  if (start) {
    const { dist } = bfs(canon, start);
    for (let i = 0; i < n; i++) if (dist[i] < 0) unreachable.push([Math.floor(i / width), i % width]);
  }
  return { loopCells, unreachable };
}

export function warningMessages(w: MazeWarnings): string[] {
  const out: string[] = [];
  if (w.loopCells.length) out.push(`Not a perfect maze: ${w.loopCells.length} cells sit on loops (a wall may be missing)`);
  if (w.unreachable.length) out.push(`Not a perfect maze: ${w.unreachable.length} cells can't be reached (a wall may be extra)`);
  return out;
}

// ---- Player path ----------------------------------------------------------------

export function emptyEdges(width: number, height: number): PicturesqueMazeAnswer["edges"] {
  return {
    h: Array.from({ length: height }, () => Array(width - 1).fill(0)),
    v: Array.from({ length: height - 1 }, () => Array(width).fill(0)),
  };
}

/** The answer edges of an ordered path. */
export function edgesFromPath(path: Cell[], width: number, height: number): PicturesqueMazeAnswer["edges"] {
  const edges = emptyEdges(width, height);
  for (let i = 1; i < path.length; i++) {
    const [r1, c1] = path[i - 1];
    const [r2, c2] = path[i];
    if (r1 === r2) edges.h[r1][Math.min(c1, c2)] = 1;
    else edges.v[Math.min(r1, r2)][c1] = 1;
  }
  return edges;
}

function edgeAt(edges: PicturesqueMazeAnswer["edges"], r1: number, c1: number, r2: number, c2: number): boolean {
  if (r1 === r2) return edges.h[r1]?.[Math.min(c1, c2)] === 1;
  return edges.v[Math.min(r1, r2)]?.[c1] === 1;
}

/**
 * The path walked from the entrance cell along the answer edges, stopping at a
 * branch or a revisit. Edges not on this walk are ignored.
 */
export function pathFromEdges(
  canon: PicturesqueMazeCanon,
  edges: PicturesqueMazeAnswer["edges"] | undefined | null,
): Cell[] {
  const { width, height } = canon;
  const start = openingCell(canon.entrance, width, height);
  if (!start) return [];
  const path: Cell[] = [start];
  if (!edges) return path;
  const seen = new Set<number>([start[0] * width + start[1]]);
  let [r, c] = start;
  for (;;) {
    const next: Cell[] = [];
    for (const [dr, dc] of STEPS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= height || nc >= width) continue;
      if (edgeAt(edges, r, c, nr, nc) && !seen.has(nr * width + nc)) next.push([nr, nc]);
    }
    if (next.length !== 1) break;
    [r, c] = next[0];
    seen.add(r * width + c);
    path.push([r, c]);
  }
  return path;
}

function countEdges(edges: PicturesqueMazeAnswer["edges"]): number {
  let n = 0;
  for (const row of edges.h) for (const v of row) if (v === 1) n++;
  for (const row of edges.v) for (const v of row) if (v === 1) n++;
  return n;
}

/** Solved: the edges form exactly the unique shortest route, entrance to exit. */
export function isPicturesqueMazeSolved(
  canon: PicturesqueMazeCanon,
  edges: PicturesqueMazeAnswer["edges"] | undefined | null,
): boolean {
  if (!edges) return false;
  const { route } = solveMaze(canon);
  if (!route) return false;
  const path = pathFromEdges(canon, edges);
  if (path.length !== route.length || countEdges(edges) !== route.length - 1) return false;
  return path.every(([r, c], i) => r === route[i][0] && c === route[i][1]);
}

/** Progress 0-100: path cells / route cells, capped at 99 until solved. No hint. */
export function picturesqueMazeProgress(
  canon: PicturesqueMazeCanon,
  edges: PicturesqueMazeAnswer["edges"] | undefined | null,
): number {
  if (isPicturesqueMazeSolved(canon, edges)) return 100;
  const { route } = solveMaze(canon);
  if (!route || !edges || countEdges(edges) === 0) return 0;
  const path = pathFromEdges(canon, edges);
  return Math.min(99, Math.round((path.length / route.length) * 100));
}

/** The path's end is stuck: a non-exit cell whose only open side is the way in. */
export function pathEndsInDeadEnd(canon: PicturesqueMazeCanon, path: Cell[]): boolean {
  if (path.length < 2) return false;
  const [r, c] = path[path.length - 1];
  const goal = openingCell(canon.exit, canon.width, canon.height);
  if (goal && goal[0] === r && goal[1] === c) return false;
  return openNeighbours(canon, r, c).length <= 1;
}

/**
 * Next step for a drag from `last` toward the pointer at fractional cell position
 * (py, px): the open neighbour that best matches the pointer's direction, or null.
 * A wall never sends the path sideways: a neighbour more than ~60° off is refused.
 */
export function stepToward(canon: PicturesqueMazeCanon, last: Cell, py: number, px: number): Cell | null {
  const dy = py - (last[0] + 0.5);
  const dx = px - (last[1] + 0.5);
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return null;
  let best: Cell | null = null;
  let bestDot = 0.5;
  for (const [dr, dc] of STEPS) {
    const dot = (dr * dy + dc * dx) / len;
    if (dot > bestDot && isOpen(canon, last[0], last[1], last[0] + dr, last[1] + dc)) {
      best = [last[0] + dr, last[1] + dc];
      bestDot = dot;
    }
  }
  return best;
}

// ---- Stored user values: "h:r,c" / "v:r,c" = 1, as in Picto Link -----------------

export function mazeToValues(edges: PicturesqueMazeAnswer["edges"]): Record<string, number> {
  const values: Record<string, number> = {};
  edges.h.forEach((row, r) => row.forEach((v, c) => { if (v === 1) values[`h:${r},${c}`] = 1; }));
  edges.v.forEach((row, r) => row.forEach((v, c) => { if (v === 1) values[`v:${r},${c}`] = 1; }));
  return values;
}

export function mazeEdgesFromValues(
  width: number,
  height: number,
  values: Record<string, number>,
): PicturesqueMazeAnswer["edges"] {
  const edges = emptyEdges(width, height);
  for (const [key, val] of Object.entries(values)) {
    if (val !== 1) continue;
    const kind = key.slice(0, 2);
    if (kind !== "h:" && kind !== "v:") continue;
    const [r, c] = key.slice(2).split(",").map(Number);
    const grid = kind === "h:" ? edges.h : edges.v;
    if (grid[r] && c >= 0 && c < grid[r].length) grid[r][c] = 1;
  }
  return edges;
}

export function parseMazeCanon(canonRepr: unknown): PicturesqueMazeCanon {
  return (typeof canonRepr === "string" ? JSON.parse(canonRepr) : canonRepr) as PicturesqueMazeCanon;
}
