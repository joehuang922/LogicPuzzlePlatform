import { PuzzleDefinition } from "../types/puzzle";
import { NonogramCanon } from "../types/canon";
import { LiveValidator, LiveValidationResult } from "./index";

export type CellState = 0 | 1 | 2; // 0=unset, 1=filled, 2=crossed

export type ClueStatus = "normal" | "satisfied" | "error";

export interface LineAnalysis {
  perClue: ClueStatus[];
  hasError: boolean;
  allSatisfied: boolean;
}

// Heuristic partial-line checker: detects many (not necessarily all) contradictions
// via sealed-group reasoning, and marks individual clue numbers satisfied/error.
export function analyzeLineStatus(clue: number[], line: CellState[]): LineAnalysis {
  const n = line.length;
  const clueLen = clue.length;

  // Extract "sealed" groups: groups of filled cells bounded by crossed (2) or edges.
  // A group is sealed if it cannot grow further (both ends are crossed or edge).
  interface Group {
    start: number;
    end: number; // exclusive
    size: number;
    sealedLeft: boolean;
    sealedRight: boolean;
  }

  const groups: Group[] = [];
  let i = 0;
  while (i < n) {
    if (line[i] === 1) {
      const start = i;
      while (i < n && line[i] === 1) i++;
      const end = i;
      const sealedLeft = start === 0 || line[start - 1] === 2;
      const sealedRight = end === n || line[end] === 2;
      groups.push({ start, end, size: end - start, sealedLeft, sealedRight });
    } else {
      i++;
    }
  }

  const perClue: ClueStatus[] = Array(clueLen).fill("normal");

  // Check for full satisfaction first
  if (groups.length === clueLen && groups.every((g, idx) => g.size === clue[idx])) {
    return { perClue: Array(clueLen).fill("satisfied"), hasError: false, allSatisfied: true };
  }

  // Error detection: any sealed group larger than allowed, or more sealed groups than clues
  const sealedGroups = groups.filter((g) => g.sealedLeft && g.sealedRight);
  if (sealedGroups.length > clueLen) {
    return { perClue: Array(clueLen).fill("error"), hasError: true, allSatisfied: false };
  }
  if (clueLen === 1 && clue[0] === 0) {
    // Clue is [0] meaning empty row — any filled cell is an error
    if (groups.length > 0) {
      return { perClue: ["error"], hasError: true, allSatisfied: false };
    }
    return { perClue: ["satisfied"], hasError: false, allSatisfied: true };
  }

  // Check for sealed groups that are too large for any clue
  for (const g of sealedGroups) {
    if (g.size > Math.max(...clue)) {
      return { perClue: Array(clueLen).fill("error"), hasError: true, allSatisfied: false };
    }
  }

  // Partial satisfaction from the beginning:
  // Walk sealed groups from left; if they match clues in order, mark those clues satisfied.
  // Only match when the gap before the group has no unset cells (otherwise earlier clues could fit there).
  let satisfiedFromStart = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    if (!g.sealedLeft || !g.sealedRight) break;
    if (satisfiedFromStart >= clueLen) break;
    const gapStart = gi === 0 ? 0 : groups[gi - 1].end;
    let hasUnsetInGap = false;
    for (let j = gapStart; j < g.start; j++) {
      if (line[j] === 0) { hasUnsetInGap = true; break; }
    }
    if (hasUnsetInGap) break;
    if (g.size === clue[satisfiedFromStart]) {
      satisfiedFromStart++;
    } else {
      return { perClue: Array(clueLen).fill("error"), hasError: true, allSatisfied: false };
    }
  }

  // Partial satisfaction from the end:
  let satisfiedFromEnd = 0;
  for (let gi = groups.length - 1; gi >= 0; gi--) {
    const g = groups[gi];
    if (!g.sealedLeft || !g.sealedRight) break;
    const clueIdx = clueLen - 1 - satisfiedFromEnd;
    if (clueIdx < satisfiedFromStart) break;
    const gapEnd = gi === groups.length - 1 ? n : groups[gi + 1].start;
    let hasUnsetInGap = false;
    for (let j = g.end; j < gapEnd; j++) {
      if (line[j] === 0) { hasUnsetInGap = true; break; }
    }
    if (hasUnsetInGap) break;
    if (g.size === clue[clueIdx]) {
      satisfiedFromEnd++;
    } else {
      return { perClue: Array(clueLen).fill("error"), hasError: true, allSatisfied: false };
    }
  }

  // Additional error check: count all sealed groups between the satisfied ones
  // and verify they don't exceed remaining clues
  const remainingClues = clueLen - satisfiedFromStart - satisfiedFromEnd;
  const middleSealedGroups = sealedGroups.filter((g) => {
    // Groups not accounted for by start/end satisfaction
    const startBound = satisfiedFromStart > 0 ? groups[satisfiedFromStart - 1].end : 0;
    const endBound = satisfiedFromEnd > 0 ? groups[groups.length - satisfiedFromEnd].start : n;
    return g.start >= startBound && g.end <= endBound;
  });
  // Subtract the ones we already counted
  const uncountedMiddle = middleSealedGroups.length - 0; // all middle ones are uncounted
  if (uncountedMiddle > remainingClues) {
    return { perClue: Array(clueLen).fill("error"), hasError: true, allSatisfied: false };
  }

  // Mark satisfied clues
  for (let ci = 0; ci < satisfiedFromStart; ci++) {
    perClue[ci] = "satisfied";
  }
  for (let ci = 0; ci < satisfiedFromEnd; ci++) {
    perClue[clueLen - 1 - ci] = "satisfied";
  }

  return { perClue, hasError: false, allSatisfied: satisfiedFromStart + satisfiedFromEnd === clueLen };
}

export function getColLine(cells: CellState[][], c: number): CellState[] {
  const col: CellState[] = [];
  for (let r = 0; r < cells.length; r++) {
    col.push(cells[r][c]);
  }
  return col;
}

// Reconstruct the cell grid from the flat serialized answer (keys "c,r" → state).
function gridFromValues(canon: NonogramCanon, userValues: Record<string, number>): CellState[][] {
  const rows = canon.rowClues.length;
  const cols = canon.colClues.length;
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (userValues[`${c},${r}`] ?? 0) as CellState)
  );
}

export const nonogramLiveValidator: LiveValidator = {
  puzzleType: 6,

  validate(puzzle: PuzzleDefinition, userValues: Record<string, number>): LiveValidationResult {
    const canon = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as NonogramCanon;

    const { rowClues, colClues } = canon;
    const rows = rowClues.length;
    const cols = colClues.length;
    const cells = gridFromValues(canon, userValues);

    const rowAnalyses = rowClues.map((clue, r) => analyzeLineStatus(clue, cells[r]));
    const colAnalyses = colClues.map((clue, c) => analyzeLineStatus(clue, getColLine(cells, c)));

    const errors = new Set<string>();

    // Clue-number errors: "clue:row:<r>:<i>" / "clue:col:<c>:<i>"
    for (let r = 0; r < rows; r++) {
      rowAnalyses[r].perClue.forEach((status, i) => {
        if (status === "error") errors.add(`clue:row:${r}:${i}`);
      });
    }
    for (let c = 0; c < cols; c++) {
      colAnalyses[c].perClue.forEach((status, i) => {
        if (status === "error") errors.add(`clue:col:${c}:${i}`);
      });
    }

    // Cell errors: every cell in a row OR column whose analysis has an error → "cell:<c>,<r>"
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rowAnalyses[r].hasError || colAnalyses[c].hasError) {
          errors.add(`cell:${c},${r}`);
        }
      }
    }

    return { errors };
  },
};
