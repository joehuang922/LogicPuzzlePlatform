import { CellValues, Step, Technique } from "../../types";
import { NonogramCanon, propagate, UNKNOWN, EMPTY, FILLED } from "./model";
import { NonogramBoard, toClient } from "./board";

// Nonogram hint ladder, ordered easiest-first by depth. Nonogram reasoning is about
// lines, so most rungs point the player at a line (row or column) whose clue settles
// cells given the marks so far — the "which clue should I look at next" hint. Every
// step also carries the cells it settles (`placements`, client marks: 1 fill, 2 cross)
// so the UI can show or apply them on request.
//
// Hints reason from the player's marks as if they're correct (like Sudoku's).

/** The line with the most deductions among those `accept` keeps, or -1. */
function bestLine(board: NonogramBoard, accept: (l: number, deduced: { value: number }[]) => boolean): number {
  let best = -1;
  let bestCount = 0;
  for (let l = 0; l < board.lineCount; l++) {
    const deduced = board.deductions(l);
    if (deduced.length === 0 || !accept(l, deduced)) continue;
    if (deduced.length > bestCount) {
      best = l;
      bestCount = deduced.length;
    }
  }
  return best;
}

function lineStep(board: NonogramBoard, l: number, technique: string, depth: number, explanation: string): Step {
  const deduced = board.deductions(l);
  return {
    technique,
    focusCells: deduced.map((d) => d.cell),
    focusLines: [board.focusLine(l)],
    placements: deduced.map((d) => ({ cell: d.cell, value: toClient(d.value) })),
    explanation,
    depth,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Depth 0: a line whose marks can't fit its clue — a mistake to fix before anything else. */
const lineContradiction: Technique<NonogramBoard> = {
  name: "line-contradiction",
  depth: 0,
  apply(board) {
    for (let l = 0; l < board.lineCount; l++) {
      if (board.solvedLine(l) !== null) continue;
      return {
        technique: "line-contradiction",
        focusCells: [],
        focusLines: [board.focusLine(l)],
        explanation: `${board.lineLabel(l)} can't be completed as marked — one of its marks is wrong.`,
        depth: 0,
      };
    }
    return null;
  },
};

/** Depth 1: a line with only one arrangement left that fits — it can be finished outright. */
const lineComplete: Technique<NonogramBoard> = {
  name: "line-complete",
  depth: 1,
  apply(board) {
    const l = bestLine(
      board,
      (line, deduced) => deduced.length === board.unknownCount(line) && deduced.some((d) => d.value === FILLED)
    );
    if (l < 0) return null;
    return lineStep(
      board,
      l,
      "line-complete",
      1,
      `${board.lineLabel(l)} has only one arrangement that fits the cells marked so far — it can be finished.`
    );
  },
};

/** Depth 2: blocks whose every fitting placement overlaps — some cells must be filled. */
const lineOverlap: Technique<NonogramBoard> = {
  name: "line-overlap",
  depth: 2,
  apply(board) {
    const l = bestLine(board, (_, deduced) => deduced.some((d) => d.value === FILLED));
    if (l < 0) return null;
    const n = board.deductions(l).length;
    return lineStep(
      board,
      l,
      "line-overlap",
      2,
      `Look at ${board.lineLabel(l)}: every way its blocks fit the cells marked so far agrees on ` +
        `${plural(n, "more cell")}.`
    );
  },
};

/** Depth 3: cells no block of the line can reach — they can be crossed out. */
const lineEmpties: Technique<NonogramBoard> = {
  name: "line-empties",
  depth: 3,
  apply(board) {
    const l = bestLine(board, () => true);
    if (l < 0) return null;
    const n = board.deductions(l).length;
    const finished = n === board.unknownCount(l);
    return lineStep(
      board,
      l,
      "line-empties",
      3,
      finished
        ? `${board.lineLabel(l)} already has all its blocks — the rest of it can be crossed out.`
        : `In ${board.lineLabel(l)}, ${plural(n, "cell")} can't be reached by any block — ` +
            `they can be crossed out.`
    );
  },
};

/**
 * Depth 4: no single line settles anything, so look where a row and a column cross:
 * assuming one value for the cell and following the line logic runs into a
 * contradiction, so the cell takes the other value.
 */
const twoLines: Technique<NonogramBoard> = {
  name: "two-lines",
  depth: 4,
  apply(board) {
    const { rows, cols } = board.spec;
    // Only meaningful at a line fixpoint (shallower rungs found nothing), where every
    // line is consistent and settles nothing on its own.
    for (let l = 0; l < board.lineCount; l++) {
      if (board.solvedLine(l) === null || board.deductions(l).length > 0) return null;
    }
    const contradicts = (id: number, v: number) => {
      const t = board.state.slice();
      t[id] = v;
      return !propagate(t, board.spec, [Math.floor(id / cols), rows + (id % cols)]);
    };
    for (let id = 0; id < board.state.length; id++) {
      if (board.state[id] !== UNKNOWN) continue;
      const fillFails = contradicts(id, FILLED);
      const emptyFails = contradicts(id, EMPTY);
      if (!fillFails && !emptyFails) continue;
      const r = Math.floor(id / cols);
      const focusLines = [
        { axis: "row" as const, index: r },
        { axis: "col" as const, index: id % cols },
      ];
      if (fillFails && emptyFails) {
        return {
          technique: "inconsistent-marks",
          focusCells: [],
          explanation:
            "Your marks can't all be right: the row and column logic runs into a contradiction " +
            "whichever way the next cell goes. Undo back to a point you trust, or check your work.",
          depth: 4,
        };
      }
      const value = fillFails ? EMPTY : FILLED;
      return {
        technique: "two-lines",
        focusCells: [id],
        focusLines,
        placements: [{ cell: id, value: toClient(value) }],
        explanation:
          `No single line settles a cell now. Try supposing the cell at ${board.cellLabel(id)} is ` +
          `${value === FILLED ? "empty" : "filled"}: following its row and column leads to a ` +
          `contradiction, so it must be ${value === FILLED ? "filled" : "empty"}.`,
        depth: 4,
      };
    }
    return null;
  },
};

export const NONOGRAM_TECHNIQUES: Technique<NonogramBoard>[] = [
  lineContradiction,
  lineComplete,
  lineOverlap,
  lineEmpties,
  twoLines,
];

/**
 * The solution-backed "give up" fallback when the ladder finds nothing: reveal the first
 * unmarked cell from the stored solution (rows x cols of 0/1). Null when the solution is
 * missing or every cell is already marked.
 */
export function revealStep(canon: NonogramCanon, values: CellValues, solution: number[][] | null): Step | null {
  if (!solution) return null;
  const board = NonogramBoard.build(canon, values);
  const { rows, cols } = board.spec;
  for (let id = 0; id < rows * cols; id++) {
    const r = Math.floor(id / cols);
    const c = id % cols;
    const want = solution[r]?.[c];
    if (board.state[id] !== UNKNOWN || (want !== 0 && want !== 1)) continue;
    return {
      technique: "reveal",
      focusCells: [id],
      focusLines: [
        { axis: "row", index: r },
        { axis: "col", index: c },
      ],
      placements: [{ cell: id, value: toClient(want === 1 ? FILLED : EMPTY) }],
      explanation:
        `No simple next step was found, so here's one cell from the solution: ` +
        `${board.cellLabel(id)} is ${want === 1 ? "filled" : "empty"}.`,
      depth: 5,
    };
  }
  return null;
}
