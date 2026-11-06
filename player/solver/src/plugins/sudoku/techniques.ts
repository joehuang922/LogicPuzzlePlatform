import { Step, Technique } from "../../types";
import { UnitBoard } from "./units";

// The hint ladder, ordered easiest-first by depth, for any sudoku-family board (plain
// sudoku, combo sudoku): it reads cells, units and peers from the board's geometry.
// nextHint returns the shallowest rung that fires; nextPlacement carries candidate-only
// rungs through to a placement.

const NOUN = { row: "row", col: "column", box: "box" } as const;

/** Depth 0: a cell with exactly one remaining candidate. */
const nakedSingle: Technique<UnitBoard> = {
  name: "naked-single",
  depth: 0,
  apply(board) {
    const { geo } = board;
    for (let id = 0; id < geo.size; id++) {
      if (board.isEmpty(id) && board.candidates[id].length === 1) {
        const value = board.candidates[id][0];
        return {
          technique: "naked-single",
          focusCells: [id],
          placement: { cell: id, value },
          explanation: `${geo.cellLabel(id)} has only one possible digit left: ${value}.`,
          depth: 0,
        };
      }
    }
    return null;
  },
};

/** Depth 1: a digit that fits in exactly one cell of some unit. */
const hiddenSingle: Technique<UnitBoard> = {
  name: "hidden-single",
  depth: 1,
  apply(board) {
    const { geo } = board;
    for (let u = 0; u < geo.units.length; u++) {
      const unit = geo.units[u];
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
            explanation: `In ${geo.unitLabel(u)}, ${v} can only go in ${geo.cellLabel(id)}.`,
            depth: 1,
          };
        }
      }
    }
    return null;
  },
};

/** Units of `kind` containing every cell of `cells`, in unit order. */
function unitsContaining(board: UnitBoard, cells: number[], kind: (k: string) => boolean): number[] {
  const { geo } = board;
  return geo.cellUnits[cells[0]].filter(
    (u) => kind(geo.kinds[u]) && cells.every((id) => geo.cellUnits[id].includes(u))
  );
}

/**
 * Depth 2: locked candidates. Within a box, if a digit's only spots all share one row
 * or column, that digit can be removed from the rest of that line (pointing). And if
 * within a line a digit's only spots all share one box, it can be removed from the rest
 * of that box (claiming). In a combo sudoku a shared box meets the lines of every board
 * covering it.
 */
const lockedCandidates: Technique<UnitBoard> = {
  name: "locked-candidates",
  depth: 2,
  apply(board) {
    const { geo } = board;
    const has = (id: number, v: number) => board.isEmpty(id) && board.candidates[id].includes(v);
    // Pointing: box -> line.
    for (let b = 0; b < geo.units.length; b++) {
      if (geo.kinds[b] !== "box") continue;
      const box = geo.units[b];
      for (let v = 1; v <= 9; v++) {
        const spots = box.filter((id) => has(id, v));
        if (spots.length < 2) continue;
        for (const line of unitsContaining(board, spots, (k) => k !== "box")) {
          const targets = geo.units[line].filter((id) => !box.includes(id) && has(id, v));
          if (targets.length === 0) continue;
          return {
            technique: "locked-candidates",
            focusCells: spots,
            eliminations: targets.map((cell) => ({ cell, digits: [v] })),
            explanation: `In ${geo.unitLabel(b)}, ${v} is confined to ${geo.unitLabel(line)}, so ${v} can be removed from ${targets
              .map(geo.cellLabel)
              .join(", ")}.`,
            depth: 2,
          };
        }
      }
    }
    // Claiming: line -> box.
    for (let u = 0; u < geo.units.length; u++) {
      if (geo.kinds[u] === "box") continue;
      const line = geo.units[u];
      for (let v = 1; v <= 9; v++) {
        const spots = line.filter((id) => has(id, v));
        if (spots.length < 2) continue;
        const [b] = unitsContaining(board, spots, (k) => k === "box");
        if (b === undefined) continue;
        const targets = geo.units[b].filter((id) => !line.includes(id) && has(id, v));
        if (targets.length > 0) {
          return {
            technique: "locked-candidates",
            focusCells: spots,
            eliminations: targets.map((cell) => ({ cell, digits: [v] })),
            explanation: `In ${geo.unitLabel(u)}, ${v} is confined to ${geo.unitLabel(b)}, so ${v} can be removed from ${targets
              .map(geo.cellLabel)
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
const nakedPair: Technique<UnitBoard> = {
  name: "naked-pair",
  depth: 3,
  apply(board) {
    const { geo } = board;
    for (let u = 0; u < geo.units.length; u++) {
      const unit = geo.units[u];
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
              explanation: `${geo.cellLabel(pairs[i])} and ${geo.cellLabel(pairs[j])} in ${geo.unitLabel(
                u
              )} can only be ${d1} or ${d2}, so those digits can be removed from the rest of the ${NOUN[geo.kinds[u]]}.`,
              depth: 3,
            };
          }
        }
      }
    }
    return null;
  },
};

const isSingle = (mask: number) => mask !== 0 && (mask & (mask - 1)) === 0;

/**
 * Fill in forced digits on bitmask domains until nothing changes: a solved cell's digit
 * leaves its peers (naked single), a digit with one place left in a unit goes there
 * (hidden single). Worklist-driven from `changed`, so a trial on an already-closed board
 * costs what it changes (a 14-board combo has ~950 cells). Mutates `dom`; false on a
 * contradiction (a cell with no digit left, or a digit with no place left in a unit).
 */
function propagateSingles(board: UnitBoard, dom: number[], changed: number[]): boolean {
  const { geo } = board;
  const queue: number[] = [];
  const dirty = new Uint8Array(geo.units.length);
  const dirtyList: number[] = [];
  const touched = (id: number) => {
    queue.push(id);
    for (const u of geo.cellUnits[id]) {
      if (!dirty[u]) {
        dirty[u] = 1;
        dirtyList.push(u);
      }
    }
  };
  for (const id of changed) touched(id);
  for (;;) {
    while (queue.length > 0) {
      const id = queue.pop()!;
      const m = dom[id];
      if (!isSingle(m)) continue;
      for (const p of geo.peers[id]) {
        if (dom[p] & m) {
          dom[p] &= ~m;
          if (dom[p] === 0) return false;
          touched(p);
        }
      }
    }
    if (dirtyList.length === 0) return true;
    const u = dirtyList.pop()!;
    dirty[u] = 0;
    for (let v = 1; v <= 9; v++) {
      const b = 1 << v;
      let place = -1;
      let count = 0;
      for (const id of geo.units[u]) {
        if (dom[id] & b) {
          place = id;
          if (++count > 1) break;
        }
      }
      if (count === 0) return false;
      if (count === 1 && dom[place] !== b) {
        dom[place] = b;
        touched(place);
      }
    }
  }
}

/**
 * Depth 4: contradiction. A cell where every candidate but one, once assumed, runs into
 * a contradiction by filling in singles alone. The last rung: it finds the cell when
 * the pattern techniques above run dry (every dead end in the production puzzles, at
 * the time of writing), and a player can follow it ("if it were anything else, X breaks").
 */
const contradiction: Technique<UnitBoard> = {
  name: "contradiction",
  depth: 4,
  apply(board) {
    const { geo } = board;
    const base = board.values.map((v, id) =>
      v !== 0 ? 1 << v : board.candidates[id].reduce((m, d) => m | (1 << d), 0)
    );
    // Close the board under singles once; each trial then only spreads from its cell.
    if (!propagateSingles(board, base, base.map((_, id) => id))) return null;
    for (let id = 0; id < geo.size; id++) {
      if (!board.isEmpty(id) || board.candidates[id].length < 2) continue;
      const survivors = board.candidates[id].filter((v) => {
        if (!(base[id] & (1 << v))) return false; // already ruled out by singles
        const dom = base.slice();
        dom[id] = 1 << v;
        return propagateSingles(board, dom, [id]);
      });
      if (survivors.length !== 1) continue;
      const value = survivors[0];
      const others = board.candidates[id].filter((d) => d !== value);
      return {
        technique: "contradiction",
        focusCells: [id],
        placement: { cell: id, value },
        explanation: `Putting ${others.join(", ")} in ${geo.cellLabel(id)} leads to a contradiction, so it is ${value}.`,
        depth: 4,
      } satisfies Step;
    }
    return null;
  },
};

export const SUDOKU_TECHNIQUES: Technique<UnitBoard>[] = [
  nakedSingle,
  hiddenSingle,
  lockedCandidates,
  nakedPair,
  contradiction,
];
