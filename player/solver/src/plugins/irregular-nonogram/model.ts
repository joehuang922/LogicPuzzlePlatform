import { Branch, ConstraintModel } from "../../types";
import { EMPTY, FILLED, UNKNOWN, solveLine } from "../nonogram/model";

/**
 * Irregular Nonogram canon (type 45), mirroring the frontend `IrregularNonogramCanon`:
 * a mask of board cells and, per segment (maximal run of board cells along a row or
 * column, named by its first cell), at most one clue.
 */
export interface IrregularNonogramCanon {
  width: number;
  height: number;
  cells: number[][];
  rowClues: { row: number; start: number; side: string; clues: number[] }[];
  colClues: { col: number; start: number; side: string; clues: number[] }[];
}

/**
 * Static per-puzzle metadata, shared by every model of one puzzle. Lines are the clued
 * segments; `lineCells[l]` lists their cell ids (r * width + c) in reading order and
 * `cellLines[id]` the (at most two) lines through a cell. Cells outside the board, or in
 * no clued line at all, start EMPTY / are left to the search respectively.
 */
export interface Spec {
  width: number;
  height: number;
  board: Uint8Array;
  lineCells: number[][];
  blocks: number[][];
  cellLines: number[][];
}

export function buildSpec(canon: IrregularNonogramCanon): Spec {
  const { width, height } = canon;
  const board = new Uint8Array(width * height);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) board[r * width + c] = canon.cells[r]?.[c] === 1 ? 1 : 0;
  const isBoard = (r: number, c: number) => r >= 0 && c >= 0 && r < height && c < width && board[r * width + c] === 1;
  const lineCells: number[][] = [];
  const blocks: number[][] = [];
  const cellLines: number[][] = Array.from({ length: width * height }, () => []);
  const seen = new Set<string>();
  const add = (ids: number[], clues: number[]) => {
    const l = lineCells.length;
    lineCells.push(ids);
    blocks.push(clues.filter((n) => n > 0));
    for (const id of ids) cellLines[id].push(l);
  };
  for (const e of canon.rowClues) {
    const key = `r${e.row}:${e.start}`;
    if (seen.has(key) || !isBoard(e.row, e.start) || isBoard(e.row, e.start - 1)) continue;
    seen.add(key);
    const ids: number[] = [];
    for (let c = e.start; isBoard(e.row, c); c++) ids.push(e.row * width + c);
    add(ids, e.clues);
  }
  for (const e of canon.colClues) {
    const key = `c${e.col}:${e.start}`;
    if (seen.has(key) || !isBoard(e.start, e.col) || isBoard(e.start - 1, e.col)) continue;
    seen.add(key);
    const ids: number[] = [];
    for (let r = e.start; isBoard(r, e.col); r++) ids.push(r * width + e.col);
    add(ids, e.clues);
  }
  return { width, height, board, lineCells, blocks, cellLines };
}

/** Line propagation to a fixed point, in place; a settled cell re-queues its other line. */
export function propagate(state: Int8Array, spec: Spec, queue: number[]): boolean {
  const queued = new Uint8Array(spec.lineCells.length);
  for (const l of queue) queued[l] = 1;
  while (queue.length > 0) {
    const l = queue.pop()!;
    queued[l] = 0;
    const ids = spec.lineCells[l];
    const solved = solveLine(
      ids.map((id) => state[id]),
      spec.blocks[l]
    );
    if (!solved) return false;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (solved[i] === UNKNOWN || state[id] !== UNKNOWN) continue;
      state[id] = solved[i];
      for (const other of spec.cellLines[id]) {
        if (other !== l && !queued[other]) {
          queued[other] = 1;
          queue.push(other);
        }
      }
    }
  }
  return true;
}

/** One-cell lookahead, as Nonogram's probe (see plugins/nonogram/model.ts). */
function probe(state: Int8Array, spec: Spec, scores: Int32Array): boolean {
  const trial = (id: number, v: number): Int8Array | null => {
    const t = state.slice();
    t[id] = v;
    return propagate(t, spec, [...spec.cellLines[id]]) ? t : null;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let id = 0; id < state.length; id++) {
      if (state[id] !== UNKNOWN || spec.cellLines[id].length === 0) continue;
      const filled = trial(id, FILLED);
      const empty = trial(id, EMPTY);
      if (!filled && !empty) return false;
      if (!filled || !empty) {
        state.set(filled ?? empty!);
        changed = true;
        continue;
      }
      let settledFilled = 0;
      let settledEmpty = 0;
      const agreed: number[] = [];
      for (let i = 0; i < state.length; i++) {
        if (state[i] !== UNKNOWN || i === id) continue;
        if (filled[i] !== UNKNOWN) settledFilled++;
        if (empty[i] !== UNKNOWN) settledEmpty++;
        if (filled[i] !== UNKNOWN && filled[i] === empty[i]) agreed.push(i);
      }
      if (agreed.length > 0) {
        const queue = new Set<number>();
        for (const i of agreed) {
          state[i] = filled[i];
          for (const l of spec.cellLines[i]) queue.add(l);
        }
        if (!propagate(state, spec, [...queue])) return false;
        changed = true;
        continue;
      }
      scores[id] = Math.min(settledFilled, settledEmpty);
    }
  }
  return true;
}

function settle(state: Int8Array, spec: Spec, queue: number[]): Int32Array | null {
  if (!propagate(state, spec, queue)) return null;
  const scores = new Int32Array(state.length);
  return probe(state, spec, scores) ? scores : null;
}

export class IrregularNonogramModel implements ConstraintModel {
  private constructor(
    private readonly spec: Spec,
    private readonly state: Int8Array,
    private readonly scores: Int32Array | null
  ) {}

  static fromCanon(canon: IrregularNonogramCanon): IrregularNonogramModel {
    const spec = buildSpec(canon);
    const state = new Int8Array(spec.width * spec.height).fill(UNKNOWN);
    for (let id = 0; id < state.length; id++) if (!spec.board[id]) state[id] = EMPTY;
    const all = Array.from({ length: spec.lineCells.length }, (_, l) => l);
    return new IrregularNonogramModel(spec, state, settle(state, spec, all));
  }

  isDead(): boolean {
    return this.scores === null;
  }

  isSolved(): boolean {
    return this.scores !== null && this.state.every((v) => v !== UNKNOWN);
  }

  /** The unknown cell whose weaker probe settled the most, as Nonogram's. */
  selectBranch(): Branch | null {
    if (!this.scores) return null;
    let best = -1;
    let bestScore = -1;
    for (let id = 0; id < this.state.length; id++) {
      if (this.state[id] !== UNKNOWN) continue;
      if (this.scores[id] > bestScore) {
        bestScore = this.scores[id];
        best = id;
      }
    }
    return best < 0 ? null : { id: best, candidates: [FILLED, EMPTY] };
  }

  assign(id: number, value: number): IrregularNonogramModel {
    const state = this.state.slice();
    state[id] = value;
    return new IrregularNonogramModel(this.spec, state, settle(state, this.spec, [...this.spec.cellLines[id]]));
  }

  /** height x width of 0 / 1 (non-board cells 0): the answer's `cells`. */
  solution(): number[][] {
    const { width, height } = this.spec;
    return Array.from({ length: height }, (_, r) => Array.from(this.state.subarray(r * width, (r + 1) * width)));
  }
}
