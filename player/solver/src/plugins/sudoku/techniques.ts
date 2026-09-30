import { Step, Technique } from "../../types";
import { SudokuBoard, UNITS, boxOf, cellLabel, unitLabel } from "./board";

const BOX_UNITS = UNITS.slice(18); // the 9 box units, box index 0..8
const LINE_UNITS = UNITS.slice(0, 18); // 9 rows then 9 columns

// v1 ladder, ordered easiest-first by depth. nextHint returns the shallowest that fires.

/** Depth 0: a cell with exactly one remaining candidate. */
const nakedSingle: Technique<SudokuBoard> = {
  name: "naked-single",
  depth: 0,
  apply(board) {
    for (let id = 0; id < 81; id++) {
      if (board.isEmpty(id) && board.candidates[id].length === 1) {
        const value = board.candidates[id][0];
        return {
          technique: "naked-single",
          focusCells: [id],
          placement: { cell: id, value },
          explanation: `${cellLabel(id)} has only one possible digit left: ${value}.`,
          depth: 0,
        };
      }
    }
    return null;
  },
};

/** Depth 1: a digit that fits in exactly one cell of some unit. */
const hiddenSingle: Technique<SudokuBoard> = {
  name: "hidden-single",
  depth: 1,
  apply(board) {
    for (let u = 0; u < UNITS.length; u++) {
      const unit = UNITS[u];
      for (let v = 1; v <= 9; v++) {
        const spots = unit.filter((id) => board.isEmpty(id) && board.candidates[id].includes(v));
        if (spots.length === 1) {
          // Skip if it's also a naked single (depth 0 would have caught it) to keep
          // the hint at the correct rung.
          if (board.candidates[spots[0]].length === 1) continue;
          const id = spots[0];
          return {
            technique: "hidden-single",
            focusCells: [id],
            placement: { cell: id, value: v },
            explanation: `In ${unitLabel(u)}, ${v} can only go in ${cellLabel(id)}.`,
            depth: 1,
          };
        }
      }
    }
    return null;
  },
};

/**
 * Depth 2: locked candidates. Within a box, if a digit's only spots all share one row
 * or column, that digit can be removed from the rest of that line (pointing). And if
 * within a line a digit's only spots all share one box, it can be removed from the rest
 * of that box (claiming).
 */
const lockedCandidates: Technique<SudokuBoard> = {
  name: "locked-candidates",
  depth: 2,
  apply(board) {
    // Pointing: box -> line.
    for (let b = 0; b < 9; b++) {
      const box = BOX_UNITS[b];
      for (let v = 1; v <= 9; v++) {
        const spots = box.filter((id) => board.isEmpty(id) && board.candidates[id].includes(v));
        if (spots.length < 2) continue;
        const rows = new Set(spots.map((id) => Math.floor(id / 9)));
        const cols = new Set(spots.map((id) => id % 9));
        let line: number[] | null = null;
        let desc = "";
        if (rows.size === 1) {
          const r = [...rows][0];
          line = UNITS[r]; // that row
          desc = `row ${r + 1}`;
        } else if (cols.size === 1) {
          const c = [...cols][0];
          line = UNITS[9 + c]; // that column
          desc = `column ${c + 1}`;
        }
        if (!line) continue;
        const targets = line.filter(
          (id) => boxOf(id) !== b && board.isEmpty(id) && board.candidates[id].includes(v)
        );
        if (targets.length > 0) {
          return {
            technique: "locked-candidates",
            focusCells: spots,
            eliminations: targets.map((cell) => ({ cell, digits: [v] })),
            explanation: `In box ${b + 1}, ${v} is confined to ${desc}, so ${v} can be removed from ${targets
              .map(cellLabel)
              .join(", ")}.`,
            depth: 2,
          };
        }
      }
    }
    // Claiming: line -> box.
    for (let u = 0; u < LINE_UNITS.length; u++) {
      const line = LINE_UNITS[u];
      for (let v = 1; v <= 9; v++) {
        const spots = line.filter((id) => board.isEmpty(id) && board.candidates[id].includes(v));
        if (spots.length < 2) continue;
        const boxes = new Set(spots.map(boxOf));
        if (boxes.size !== 1) continue;
        const b = [...boxes][0];
        const targets = BOX_UNITS[b].filter(
          (id) => !line.includes(id) && board.isEmpty(id) && board.candidates[id].includes(v)
        );
        if (targets.length > 0) {
          return {
            technique: "locked-candidates",
            focusCells: spots,
            eliminations: targets.map((cell) => ({ cell, digits: [v] })),
            explanation: `In ${unitLabel(u)}, ${v} is confined to box ${b + 1}, so ${v} can be removed from ${targets
              .map(cellLabel)
              .join(", ")}.`,
            depth: 2,
          };
        }
      }
    }
    return null;
  },
};

/**
 * Depth 3: naked pair. Two cells in a unit sharing the same two candidates lock those
 * digits to themselves, so both can be removed from the rest of the unit.
 */
const nakedPair: Technique<SudokuBoard> = {
  name: "naked-pair",
  depth: 3,
  apply(board) {
    for (let u = 0; u < UNITS.length; u++) {
      const unit = UNITS[u];
      const pairs = unit.filter((id) => board.isEmpty(id) && board.candidates[id].length === 2);
      for (let i = 0; i < pairs.length; i++) {
        for (let j = i + 1; j < pairs.length; j++) {
          const a = board.candidates[pairs[i]];
          const bcand = board.candidates[pairs[j]];
          if (a[0] !== bcand[0] || a[1] !== bcand[1]) continue; // same two digits (sorted)
          const [d1, d2] = a;
          const targets = unit.filter(
            (id) =>
              id !== pairs[i] &&
              id !== pairs[j] &&
              board.isEmpty(id) &&
              (board.candidates[id].includes(d1) || board.candidates[id].includes(d2))
          );
          if (targets.length > 0) {
            return {
              technique: "naked-pair",
              focusCells: [pairs[i], pairs[j]],
              eliminations: targets.map((cell) => ({
                cell,
                digits: [d1, d2].filter((d) => board.candidates[cell].includes(d)),
              })),
              explanation: `${cellLabel(pairs[i])} and ${cellLabel(pairs[j])} in ${unitLabel(
                u
              )} can only be ${d1} or ${d2}, so those digits can be removed from the rest of the ${unitLabel(
                u
              ).split(" ")[0]}.`,
              depth: 3,
            };
          }
        }
      }
    }
    return null;
  },
};

export const SUDOKU_TECHNIQUES: Technique<SudokuBoard>[] = [
  nakedSingle,
  hiddenSingle,
  lockedCandidates,
  nakedPair,
];
