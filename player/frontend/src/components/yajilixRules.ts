import { YajilixCanon, YajilixDir, YajilixKind } from "../types/canon";
import { Loop, NO_MARK, CROSS, DOT, degrees, emptyLoop, fromValues, isSingleLoop, toValues } from "./countryRoadRules";

// Yajilix (type 46) stores its loop and marks exactly as Country Road does ("h:r,c",
// "v:r,c", "m:r,c"), so the value helpers are shared.
export { NO_MARK, CROSS, DOT, degrees, emptyLoop, fromValues, isSingleLoop, toValues };
export type { Loop };

export interface YajilixProblem {
  message: string;
  r: number;
  c: number;
}

export const DIR_STEP: Record<YajilixDir, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

/** A grid of letter-and-arrow clues: Yajilix's (with a number) or Majority Yajilix's (without). */
export interface LoopClue {
  kind: YajilixKind;
  dir: YajilixDir;
  num?: number;
}

export interface LoopClueGrid {
  cells: (LoopClue | null)[][];
}

export function dims(canon: LoopClueGrid): { rows: number; cols: number } {
  return { rows: canon.cells.length, cols: canon.cells[0]?.length ?? 0 };
}

/** The empty (non-clue) cells from (r, c) to the board's edge in `dir`; clues are skipped. */
export function lineCells(canon: LoopClueGrid, r: number, c: number, dir: YajilixDir): [number, number][] {
  const { rows, cols } = dims(canon);
  const [dr, dc] = DIR_STEP[dir];
  const out: [number, number][] = [];
  for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < rows && cc >= 0 && cc < cols; rr += dr, cc += dc) {
    if (canon.cells[rr][cc] === null) out.push([rr, cc]);
  }
  return out;
}

/** How the loop passes a cell: "none" (no segment), "turn", "straight" or "open" (1 or 3+ segments). */
export type CellShape = "none" | "turn" | "straight" | "open";

export function cellShape(loop: Loop, deg: number[][], r: number, c: number): CellShape {
  const d = deg[r][c];
  if (d === 0) return "none";
  if (d !== 2) return "open";
  const left = c > 0 && loop.h[r]?.[c - 1] === 1;
  const right = loop.h[r]?.[c] === 1;
  return left === right ? "straight" : "turn";
}

/** The clue's count on a finished loop: L turns, I straights, X cells without a segment. */
export function clueCount(canon: YajilixCanon, loop: Loop, r: number, c: number): number {
  const clue = canon.cells[r][c]!;
  const { rows, cols } = dims(canon);
  const deg = degrees(rows, cols, loop);
  const want: CellShape = clue.kind === "L" ? "turn" : clue.kind === "I" ? "straight" : "none";
  return lineCells(canon, r, c, clue.dir).filter(([rr, cc]) => cellShape(loop, deg, rr, cc) === want).length;
}

/** One closed loop, never through a clue cell, and every clue's count right. */
export function validateYajilix(canon: YajilixCanon, loop: Loop): boolean {
  const { rows, cols } = dims(canon);
  if (rows === 0 || cols === 0 || !isSingleLoop(rows, cols, loop)) return false;
  const deg = degrees(rows, cols, loop);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const clue = canon.cells[r][c];
      if (clue === null) continue;
      if (deg[r][c] !== 0) return false;
      if (clueCount(canon, loop, r, c) !== clue.num) return false;
    }
  }
  return true;
}

export interface ClassCount {
  certain: number; // cells already known to be this class
  possible: number; // certain plus open cells that could still become it
}

const SHAPE_OF: Record<YajilixKind, CellShape> = { L: "turn", I: "straight", X: "none" };

/**
 * Each class's certain and possible count among `cells`, from what the player committed: a
 * cell with 2 segments is a known turn or straight, a × cell with no segment a known X.
 */
export function classCounts(
  loop: Loop,
  marks: number[][],
  deg: number[][],
  cells: [number, number][]
): Record<YajilixKind, ClassCount> {
  const out: Record<YajilixKind, ClassCount> = {
    L: { certain: 0, possible: 0 },
    I: { certain: 0, possible: 0 },
    X: { certain: 0, possible: 0 },
  };
  for (const [r, c] of cells) {
    const shape = cellShape(loop, deg, r, c);
    const crossed = marks[r]?.[c] === CROSS;
    if (shape === "turn" || shape === "straight") {
      const k: YajilixKind = shape === "turn" ? "L" : "I";
      out[k].certain++;
      out[k].possible++;
    } else if (shape === "none") {
      if (crossed) out.X.certain++;
      out.X.possible++;
      if (!crossed) {
        out.L.possible++;
        out.I.possible++;
      }
    } else if (deg[r][c] === 1) {
      // On the loop with one segment: a turn or a straight, never X.
      out.L.possible++;
      out.I.possible++;
    }
  }
  return out;
}

/** The class of every cell on a finished loop, counted. */
export function finishedCounts(loop: Loop, deg: number[][], cells: [number, number][]): Record<YajilixKind, number> {
  const out: Record<YajilixKind, number> = { L: 0, I: 0, X: 0 };
  for (const [r, c] of cells) {
    const shape = cellShape(loop, deg, r, c);
    for (const k of ["L", "I", "X"] as YajilixKind[]) if (shape === SHAPE_OF[k]) out[k]++;
  }
  return out;
}

/**
 * Whether the player's committed cells already break a clue (Errors: On): its class's
 * certain count is over the number, or its possible count under it.
 */
export function clueBroken(canon: YajilixCanon, loop: Loop, marks: number[][], r: number, c: number, deg?: number[][]): boolean {
  const clue = canon.cells[r][c];
  if (!clue) return false;
  const { rows, cols } = dims(canon);
  const d = deg ?? degrees(rows, cols, loop);
  const n = classCounts(loop, marks, d, lineCells(canon, r, c, clue.dir))[clue.kind];
  return n.certain > clue.num || n.possible < clue.num;
}

export interface Broken {
  clues: Set<string>; // "r,c" of a clue its cells already break
  cells: Set<string>; // "r,c" of a clue cell the loop enters, or a cell with 3+ segments
}

export function brokenClues(canon: YajilixCanon, loop: Loop, marks: number[][]): Broken {
  return brokenLoopClues(canon, loop, (r, c, deg) => clueBroken(canon, loop, marks, r, c, deg));
}

/** [Broken] for any loop-clue grid, given how to judge one clue. */
export function brokenLoopClues(
  canon: LoopClueGrid,
  loop: Loop,
  isBroken: (r: number, c: number, deg: number[][]) => boolean
): Broken {
  const { rows, cols } = dims(canon);
  const deg = degrees(rows, cols, loop);
  const clues = new Set<string>();
  const cells = new Set<string>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isClue = canon.cells[r][c] !== null;
      if ((isClue && deg[r][c] > 0) || deg[r][c] > 2) cells.add(`${r},${c}`);
      if (isClue && isBroken(r, c, deg)) clues.add(`${r},${c}`);
    }
  }
  return { clues, cells };
}

/** Empty cells touched by a loop segment or carrying a mark, over all empty cells, 0-100. */
export function yajilixProgress(canon: LoopClueGrid, loop: Loop, marks: number[][]): number {
  const { rows, cols } = dims(canon);
  const deg = degrees(rows, cols, loop);
  let total = 0;
  let decided = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canon.cells[r][c] !== null) continue;
      total++;
      if (deg[r][c] > 0 || (marks[r]?.[c] ?? 0) !== NO_MARK) decided++;
    }
  }
  return total === 0 ? 0 : (decided / total) * 100;
}

/** Format problems: what the API's semanticChecks rejects. A board with any can't be saved. */
export function yajilixFormatProblems(canon: LoopClueGrid): YajilixProblem[] {
  const { rows, cols } = dims(canon);
  if (rows === 0 || cols === 0 || canon.cells.some((row) => row.length !== cols)) {
    return [{ message: "Rows of cells differ in length", r: 0, c: 0 }];
  }
  return [];
}

/** Misread warnings: suspicious but saveable once overridden. */
export function yajilixWarnings(canon: YajilixCanon): YajilixProblem[] {
  const { rows, cols } = dims(canon);
  const warnings: YajilixProblem[] = [];
  let clues = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const clue = canon.cells[r][c];
      if (!clue) continue;
      clues++;
      const room = lineCells(canon, r, c, clue.dir).length;
      if (clue.num > room) {
        warnings.push({
          message: `${clueLabel(clue)} at R${r + 1}C${c + 1} counts more than the ${room} cells in its direction`,
          r,
          c,
        });
      }
    }
  }
  if (clues === 0) warnings.push({ message: "No clues", r: 0, c: 0 });
  return warnings;
}

const ARROWS: Record<YajilixDir, string> = { up: "↑", down: "↓", left: "←", right: "→" };

export function clueLabel(clue: LoopClue): string {
  return `${clue.kind}${clue.num ?? ""}${ARROWS[clue.dir]}`;
}

export function arrowChar(dir: YajilixDir): string {
  return ARROWS[dir];
}
