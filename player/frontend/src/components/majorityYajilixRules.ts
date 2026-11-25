import { MajorityYajilixCanon, YajilixKind } from "../types/canon";
import {
  Broken,
  Loop,
  YajilixProblem,
  brokenLoopClues,
  classCounts,
  clueLabel,
  degrees,
  dims,
  finishedCounts,
  isSingleLoop,
  lineCells,
} from "./yajilixRules";

// Majority Yajilix (type 47): Yajilix's board, values and answer; a clue's letter is the
// class (L turn, I straight, X off the loop) with strictly the most of the non-clue cells
// from it to the edge in its direction.

const KINDS: YajilixKind[] = ["L", "I", "X"];

/** Whether the clue at (r, c) holds on a finished loop: its class strictly outnumbers each other. */
export function clueHolds(canon: MajorityYajilixCanon, loop: Loop, r: number, c: number, deg?: number[][]): boolean {
  const clue = canon.cells[r][c];
  if (!clue) return true;
  const { rows, cols } = dims(canon);
  const n = finishedCounts(loop, deg ?? degrees(rows, cols, loop), lineCells(canon, r, c, clue.dir));
  return KINDS.every((k) => k === clue.kind || n[clue.kind] > n[k]);
}

/** One closed loop, never through a clue cell, and every clue's class alone on top. */
export function validateMajorityYajilix(canon: MajorityYajilixCanon, loop: Loop): boolean {
  const { rows, cols } = dims(canon);
  if (rows === 0 || cols === 0 || !isSingleLoop(rows, cols, loop)) return false;
  const deg = degrees(rows, cols, loop);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canon.cells[r][c] === null) continue;
      if (deg[r][c] !== 0 || !clueHolds(canon, loop, r, c, deg)) return false;
    }
  }
  return true;
}

/**
 * Whether the committed cells already break the clue (Errors: On): even if every open cell
 * became its class, it wouldn't beat a class's cells that are already certain.
 */
export function clueBroken(
  canon: MajorityYajilixCanon,
  loop: Loop,
  marks: number[][],
  r: number,
  c: number,
  deg?: number[][]
): boolean {
  const clue = canon.cells[r][c];
  if (!clue) return false;
  const { rows, cols } = dims(canon);
  const n = classCounts(loop, marks, deg ?? degrees(rows, cols, loop), lineCells(canon, r, c, clue.dir));
  return KINDS.some((k) => k !== clue.kind && n[clue.kind].possible <= n[k].certain);
}

export function brokenClues(canon: MajorityYajilixCanon, loop: Loop, marks: number[][]): Broken {
  return brokenLoopClues(canon, loop, (r, c, deg) => clueBroken(canon, loop, marks, r, c, deg));
}

/** Misread warnings: suspicious but saveable once overridden. */
export function majorityYajilixWarnings(canon: MajorityYajilixCanon): YajilixProblem[] {
  const { rows, cols } = dims(canon);
  const warnings: YajilixProblem[] = [];
  let clues = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const clue = canon.cells[r][c];
      if (!clue) continue;
      clues++;
      if (lineCells(canon, r, c, clue.dir).length === 0) {
        warnings.push({ message: `${clueLabel(clue)} at R${r + 1}C${c + 1} has no cells in its direction`, r, c });
      }
    }
  }
  if (clues === 0) warnings.push({ message: "No clues", r: 0, c: 0 });
  return warnings;
}

export {
  yajilixFormatProblems as majorityYajilixFormatProblems,
  yajilixProgress as majorityYajilixProgress,
  fromValues,
  toValues,
  emptyLoop,
  CROSS,
  DOT,
} from "./yajilixRules";
export type { Loop, Broken } from "./yajilixRules";
