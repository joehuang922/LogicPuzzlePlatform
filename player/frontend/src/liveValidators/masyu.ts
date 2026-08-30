import { PuzzleDefinition } from "../types/puzzle";
import { MasyuCanon } from "../types/canon";
import { LiveValidator, LiveValidationResult } from "./index";

export type Direction = "up" | "down" | "left" | "right";

// The directions in which cell (r,c) currently has a drawn segment.
export function getCellConnections(
  r: number,
  c: number,
  hEdges: number[][],
  vEdges: number[][],
  rows: number,
  cols: number
): Direction[] {
  const dirs: Direction[] = [];
  if (c > 0 && hEdges[r][c - 1] === 1) dirs.push("left");
  if (c < cols - 1 && hEdges[r][c] === 1) dirs.push("right");
  if (r > 0 && vEdges[r - 1][c] === 1) dirs.push("up");
  if (r < rows - 1 && vEdges[r][c] === 1) dirs.push("down");
  return dirs;
}

export function isStraight(dirs: Direction[]): boolean {
  if (dirs.length !== 2) return false;
  return (
    (dirs.includes("left") && dirs.includes("right")) ||
    (dirs.includes("up") && dirs.includes("down"))
  );
}

export function isTurn(dirs: Direction[]): boolean {
  if (dirs.length !== 2) return false;
  return !isStraight(dirs);
}

// The result of a partial-answer analysis. Both sets key on "r,c":
//   circleErrors  — circle cells whose masyu rule is *definitely* violated given
//                   the segments drawn so far.
//   loopSegments  — the h/v segments that form a closed loop while circles are
//                   still uncovered/unsatisfied (a dead-end, since a closed loop
//                   can no longer be extended).
export interface MasyuAnalysis {
  circleErrors: Set<string>;
  loopSegments: { h: Set<string>; v: Set<string> };
}

function step(r: number, c: number, d: Direction): [number, number] {
  switch (d) {
    case "up":
      return [r - 1, c];
    case "down":
      return [r + 1, c];
    case "left":
      return [r, c - 1];
    case "right":
      return [r, c + 1];
  }
}

// Analyze a partially-drawn masyu answer. Only reports violations that are
// *certain* from the current segments — a rule that could still be satisfied by
// drawing more is left unflagged so the toggle never accuses a work-in-progress.
export function analyzeMasyu(
  cells: number[][],
  hEdges: number[][],
  vEdges: number[][]
): MasyuAnalysis {
  const rows = cells.length;
  const cols = cells[0].length;

  const conn = (r: number, c: number) =>
    getCellConnections(r, c, hEdges, vEdges, rows, cols);

  const circleErrors = new Set<string>();

  // --- Entity type 1: hint-circle rule violations ---
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const kind = cells[r][c];
      if (kind === 0) continue;

      const dirs = conn(r, c);

      // Fewer than 2 segments: the loop hasn't committed to a shape here yet,
      // so nothing is decided. More than 2: a branch — the loop can never pass
      // straight-through or make a clean turn, so the circle's rule is broken.
      if (dirs.length < 2) continue;
      if (dirs.length > 2) {
        circleErrors.add(`${r},${c}`);
        continue;
      }

      if (kind === 1) {
        // White circle: must pass straight through...
        if (!isStraight(dirs)) {
          circleErrors.add(`${r},${c}`);
          continue;
        }
        // ...and at least one adjacent along-line cell must turn. This can only
        // be *refuted* once both neighbors are fully determined and both go
        // straight (neither turns).
        const [a, b] = dirs.includes("left")
          ? [conn(r, c - 1), conn(r, c + 1)]
          : [conn(r - 1, c), conn(r + 1, c)];
        const bothDetermined = a.length === 2 && b.length === 2;
        if (bothDetermined && isStraight(a) && isStraight(b)) {
          circleErrors.add(`${r},${c}`);
        }
      } else {
        // Black circle: must turn at the cell...
        if (!isTurn(dirs)) {
          circleErrors.add(`${r},${c}`);
          continue;
        }
        // ...and each of the two segments must extend straight for ≥1 more cell.
        // Violated as soon as a determined neighbor turns immediately.
        for (const d of dirs) {
          const [nr, nc] = step(r, c, d);
          const nDirs = conn(nr, nc);
          if (nDirs.length === 2 && isTurn(nDirs)) {
            circleErrors.add(`${r},${c}`);
            break;
          }
        }
      }
    }
  }

  // --- Entity type 2: segments of a premature (dead-end) closed loop ---
  // Degree of every cell in the segment graph.
  const degree: number[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(0)
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      degree[r][c] = conn(r, c).length;
    }
  }

  // Walk connected components. A component whose every cell has degree exactly 2
  // is a closed loop (a cycle). Collect the cells it covers and its segments.
  const visited: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );
  const closedLoopH: string[] = [];
  const closedLoopV: string[] = [];
  const coveredByLoop = new Set<string>();
  let closedLoopCount = 0;

  for (let sr = 0; sr < rows; sr++) {
    for (let sc = 0; sc < cols; sc++) {
      if (degree[sr][sc] === 0 || visited[sr][sc]) continue;

      const compCells: [number, number][] = [];
      const compH: string[] = [];
      const compV: string[] = [];
      let allDegree2 = true;

      const stack: [number, number][] = [[sr, sc]];
      visited[sr][sc] = true;
      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        compCells.push([cr, cc]);
        if (degree[cr][cc] !== 2) allDegree2 = false;

        for (const d of conn(cr, cc)) {
          const [nr, nc] = step(cr, cc, d);
          // Record each segment once (from its lower/left endpoint).
          if (d === "right") compH.push(`${cr},${cc}`);
          else if (d === "down") compV.push(`${cr},${cc}`);
          if (!visited[nr][nc]) {
            visited[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }

      if (allDegree2) {
        closedLoopCount++;
        for (const [cr, cc] of compCells) coveredByLoop.add(`${cr},${cc}`);
        closedLoopH.push(...compH);
        closedLoopV.push(...compV);
      }
    }
  }

  const loopSegments = { h: new Set<string>(), v: new Set<string>() };

  if (closedLoopCount > 0) {
    // A closed loop is premature (a dead-end) if any circle is still uncovered,
    // any circle's rule is already violated, or there is more than one loop — a
    // solved masyu is exactly one loop covering every circle with no violations.
    let circleUncovered = false;
    for (let r = 0; r < rows && !circleUncovered; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r][c] !== 0 && !coveredByLoop.has(`${r},${c}`)) {
          circleUncovered = true;
          break;
        }
      }
    }

    if (circleUncovered || circleErrors.size > 0 || closedLoopCount > 1) {
      for (const k of closedLoopH) loopSegments.h.add(k);
      for (const k of closedLoopV) loopSegments.v.add(k);
    }
  }

  return { circleErrors, loopSegments };
}

// Reconstruct the h/v edge grids from the flat serialized answer
// (keys "h:r,c" / "v:r,c" → 1), matching the masyu renderer/extractor.
function edgesFromValues(
  canon: MasyuCanon,
  userValues: Record<string, number>
): { h: number[][]; v: number[][] } {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;
  const h = Array.from({ length: rows }, () => Array(cols - 1).fill(0));
  const v = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
  for (const [key, val] of Object.entries(userValues)) {
    if (val !== 1) continue;
    if (key.startsWith("h:")) {
      const [r, c] = key.slice(2).split(",").map(Number);
      if (r < rows && c < cols - 1) h[r][c] = 1;
    } else if (key.startsWith("v:")) {
      const [r, c] = key.slice(2).split(",").map(Number);
      if (r < rows - 1 && c < cols) v[r][c] = 1;
    }
  }
  return { h, v };
}

export const masyuLiveValidator: LiveValidator = {
  puzzleType: 7,

  validate(
    puzzle: PuzzleDefinition,
    userValues: Record<string, number>
  ): LiveValidationResult {
    const canon = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as MasyuCanon;

    const { h, v } = edgesFromValues(canon, userValues);
    const { circleErrors, loopSegments } = analyzeMasyu(canon.cells, h, v);

    const errors = new Set<string>();
    for (const k of circleErrors) errors.add(`circle:${k}`);
    for (const k of loopSegments.h) errors.add(`edge:h:${k}`);
    for (const k of loopSegments.v) errors.add(`edge:v:${k}`);
    return { errors };
  },
};
