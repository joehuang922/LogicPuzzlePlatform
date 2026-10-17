import { Branch, ConstraintModel } from "../../types";

/**
 * Canonical Nonogram representation, mirroring the frontend `NonogramCanon`. Each clue
 * lists the lengths of a line's consecutive filled groups in order (left to right for
 * rows, top to bottom for columns); an empty line is `[0]`.
 */
export interface NonogramCanon {
  rowClues: number[][];
  colClues: number[][];
}

// Cell states. Cells are binary variables; UNKNOWN is "domain {EMPTY, FILLED}".
const UNKNOWN = -1;
const EMPTY = 0;
const FILLED = 1;

/**
 * Static per-puzzle metadata, shared by reference across all models of one puzzle so
 * `assign` only copies the mutable `state` array. Lines are indexed 0..rows-1 for rows
 * and rows..rows+cols-1 for columns; `lineCells[l]` lists the cell ids (r * cols + c) of
 * line l in clue order, and `blocks[l]` its clue with `[0]` normalized to `[]`.
 */
interface Spec {
  rows: number;
  cols: number;
  lineCells: number[][];
  blocks: number[][];
}

function buildSpec(canon: NonogramCanon): Spec {
  const rows = canon.rowClues.length;
  const cols = canon.colClues.length;
  const lineCells: number[][] = [];
  const blocks: number[][] = [];
  const normalize = (clue: number[]) => clue.filter((n) => n > 0);
  for (let r = 0; r < rows; r++) {
    lineCells.push(Array.from({ length: cols }, (_, c) => r * cols + c));
    blocks.push(normalize(canon.rowClues[r]));
  }
  for (let c = 0; c < cols; c++) {
    lineCells.push(Array.from({ length: rows }, (_, r) => r * cols + c));
    blocks.push(normalize(canon.colClues[c]));
  }
  return { rows, cols, lineCells, blocks };
}

// Scratch buffers for solveLine, grown on demand and reused across calls: the solver runs
// thousands of times per search node (probing), so per-call allocation dominated its cost.
let suffixBuf = new Uint8Array(0);
let reachBuf = new Uint8Array(0);
let emptyBeforeBuf = new Int32Array(0);
let fillDiffBuf = new Int32Array(0);
let seenEmptyBuf = new Uint8Array(0);

/**
 * The line solver: exact consistency for one line. Given the line's current cells
 * (UNKNOWN / EMPTY / FILLED) and its clue blocks, returns the line's cells with every
 * deduction applied — a cell becomes FILLED (EMPTY) when it is filled (empty) in *every*
 * placement of the blocks that agrees with the known cells. Returns null when no
 * placement agrees (the line is contradictory).
 *
 * Dynamic programming over states (block j, position i) = "blocks 0..j-1 are placed and
 * the next block may start at i", O(n * k):
 * - `suffix[j][i]`: cells i..n-1 can hold blocks j..k-1.
 * - a forward sweep over states reachable from (0, 0) whose suffix is feasible marks, per
 *   cell, whether some valid placement leaves it empty and whether some fills it.
 * Placing block j at i consumes its L cells plus one separator cell (unless it ends the
 * line). State (j, i) can only matter for minStart[j] <= i <= maxStart[j] (blocks before
 * j fit before i, blocks from j on fit after it), so both passes visit only that band.
 */
export function solveLine(cells: ArrayLike<number>, blocks: number[]): number[] | null {
  const n = cells.length;
  const k = blocks.length;
  const W = n + 1;
  const size = (k + 1) * W;
  if (suffixBuf.length < size) {
    suffixBuf = new Uint8Array(size * 2);
    reachBuf = new Uint8Array(size * 2);
  }
  if (emptyBeforeBuf.length < W) {
    emptyBeforeBuf = new Int32Array(W * 2);
    fillDiffBuf = new Int32Array(W * 2);
    seenEmptyBuf = new Uint8Array(W * 2);
  }
  const suffix = suffixBuf;
  const reach = reachBuf;
  const emptyBefore = emptyBeforeBuf;
  const fillDiff = fillDiffBuf;
  const seenEmpty = seenEmptyBuf;
  suffix.fill(0, 0, size);
  reach.fill(0, 0, size);
  fillDiff.fill(0, 0, W);
  seenEmpty.fill(0, 0, n);

  // emptyBefore[i] = number of known-EMPTY cells in 0..i-1, so "cells i..i+L-1 can all
  // be filled" is an O(1) range check.
  emptyBefore[0] = 0;
  for (let i = 0; i < n; i++) emptyBefore[i + 1] = emptyBefore[i] + (cells[i] === EMPTY ? 1 : 0);

  // The band of positions where state (j, i) can occur.
  const minStart = new Int32Array(k + 1);
  const maxStart = new Int32Array(k + 1);
  for (let j = 0; j < k; j++) minStart[j + 1] = minStart[j] + blocks[j] + 1;
  maxStart[k] = n;
  for (let j = k - 1; j >= 0; j--) maxStart[j] = (j === k - 1 ? n : maxStart[j + 1] - 1) - blocks[j];
  if (maxStart[0] < 0) return null; // the blocks don't fit in the line at all

  for (let j = k; j >= 0; j--) {
    const row = j * W;
    const lo = minStart[j];
    const hi = maxStart[j];
    if (j === k) {
      suffix[row + n] = 1;
      for (let i = n - 1; i >= lo; i--) suffix[row + i] = cells[i] !== FILLED && suffix[row + i + 1] ? 1 : 0;
      continue;
    }
    const len = blocks[j];
    const next = row + W;
    for (let i = hi; i >= lo; i--) {
      if (cells[i] !== FILLED && suffix[row + i + 1]) {
        suffix[row + i] = 1;
        continue;
      }
      const end = i + len;
      if (emptyBefore[end] - emptyBefore[i] !== 0) continue; // a known-empty cell in the way
      const ok = end === n ? j + 1 === k : cells[end] !== FILLED && suffix[next + end + 1] === 1;
      if (ok) suffix[row + i] = 1;
    }
  }
  if (!suffix[0]) return null;

  // Forward sweep: only states reachable from (0, 0) along feasible transitions count.
  // fillDiff is a difference array: +1 at a block's start, -1 past its end.
  reach[0] = 1;
  let jLo = 0;
  let jHi = 0;
  for (let i = 0; i < n; i++) {
    while (jLo <= k && maxStart[jLo] < i) jLo++;
    while (jHi < k && minStart[jHi + 1] <= i) jHi++;
    for (let j = jLo; j <= jHi; j++) {
      const row = j * W;
      if (!reach[row + i]) continue;
      if (cells[i] !== FILLED && suffix[row + i + 1]) {
        seenEmpty[i] = 1;
        reach[row + i + 1] = 1;
      }
      if (j === k) continue;
      const end = i + blocks[j];
      if (end > n || emptyBefore[end] - emptyBefore[i] !== 0) continue;
      if (end === n) {
        if (j + 1 === k) {
          fillDiff[i]++;
          fillDiff[end]--;
        }
      } else if (cells[end] !== FILLED && suffix[row + W + end + 1]) {
        fillDiff[i]++;
        fillDiff[end]--;
        seenEmpty[end] = 1;
        reach[row + W + end + 1] = 1;
      }
    }
  }

  const out = new Array<number>(n);
  let filledRun = 0;
  for (let i = 0; i < n; i++) {
    filledRun += fillDiff[i];
    const mayFill = filledRun > 0;
    const mayEmpty = seenEmpty[i] === 1;
    if (mayFill && mayEmpty) out[i] = UNKNOWN;
    else if (mayFill) out[i] = FILLED;
    else if (mayEmpty) out[i] = EMPTY;
    else return null; // unreachable when suffix[0] holds, kept as a safety net
  }
  return out;
}

/**
 * Run the line solver over the queued lines to a fixed point, in place. A cell the
 * solver settles re-queues its crossing line, so deductions ripple across the grid.
 * Returns false on contradiction.
 */
function propagate(state: Int8Array, spec: Spec, queue: number[]): boolean {
  const { rows, cols, lineCells, blocks } = spec;
  const queued = new Uint8Array(rows + cols);
  for (const l of queue) queued[l] = 1;
  while (queue.length > 0) {
    const l = queue.pop()!;
    queued[l] = 0;
    const ids = lineCells[l];
    const solved = solveLine(
      ids.map((id) => state[id]),
      blocks[l]
    );
    if (!solved) return false;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (solved[i] === UNKNOWN || state[id] !== UNKNOWN) continue;
      state[id] = solved[i];
      // The crossing line: a row's cell sits in column c, a column's cell in row r.
      const cross = l < rows ? rows + (id % cols) : Math.floor(id / cols);
      if (!queued[cross]) {
        queued[cross] = 1;
        queue.push(cross);
      }
    }
  }
  return true;
}

/**
 * Probing (one-cell lookahead), in place, after line propagation has settled: for each
 * unknown cell, tentatively try both values and line-propagate each.
 * - A value that leads to a contradiction is impossible, so the cell takes the other one.
 * - Both values contradicting means the whole state is dead.
 * - Any other cell that both trials settle the same way takes that value either way.
 * New values are propagated before probing continues, and sweeps repeat until one
 * settles nothing.
 *
 * Line solving alone stalls on puzzles whose deductions need two lines at once; probing
 * finds those, which keeps the search tree (and so the gate's time) small on hard boards.
 * Returns false on contradiction. `scores` receives, per cell still unknown, how many
 * cells its weaker trial settled, for branch selection.
 */
function probe(state: Int8Array, spec: Spec, scores: Int32Array): boolean {
  const { rows, cols } = spec;
  const trial = (id: number, v: number): Int8Array | null => {
    const t = state.slice();
    t[id] = v;
    return propagate(t, spec, [Math.floor(id / cols), rows + (id % cols)]) ? t : null;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let id = 0; id < state.length; id++) {
      if (state[id] !== UNKNOWN) continue;
      const filled = trial(id, FILLED);
      const empty = trial(id, EMPTY);
      if (!filled && !empty) return false;
      if (!filled || !empty) {
        // One value is impossible; its trial state is exactly the other value propagated.
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
          queue.add(Math.floor(i / cols));
          queue.add(rows + (i % cols));
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

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Settle a state as far as deduction goes: line propagation from the queued lines, then
 * probing. Returns the probe scores, or null on contradiction.
 */
function settle(state: Int8Array, spec: Spec, queue: number[]): Int32Array | null {
  if (!propagate(state, spec, queue)) return null;
  const scores = new Int32Array(state.length);
  return probe(state, spec, scores) ? scores : null;
}

export class NonogramModel implements ConstraintModel {
  private constructor(
    private readonly spec: Spec,
    private readonly state: Int8Array,
    /** Per-cell probe scores from settling this state; null when the state is dead. */
    private readonly scores: Int32Array | null
  ) {}

  static fromCanon(canon: NonogramCanon): NonogramModel {
    const spec = buildSpec(canon);
    const state = new Int8Array(spec.rows * spec.cols).fill(UNKNOWN);
    // Every filled cell is counted once by its row and once by its column, so mismatched
    // totals (typically a mis-read clue) are unsolvable before any search.
    const rowTotal = sum(spec.blocks.slice(0, spec.rows).map(sum));
    const colTotal = sum(spec.blocks.slice(spec.rows).map(sum));
    if (rowTotal !== colTotal) return new NonogramModel(spec, state, null);
    const all = Array.from({ length: spec.rows + spec.cols }, (_, l) => l);
    return new NonogramModel(spec, state, settle(state, spec, all));
  }

  isDead(): boolean {
    return this.scores === null;
  }

  isSolved(): boolean {
    return this.scores !== null && this.state.every((v) => v !== UNKNOWN);
  }

  /**
   * Branch on the unknown cell whose weaker probe settled the most cells: whichever value
   * the search tries, that branch starts with the most deduced, so the tree stays shallow.
   */
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

  assign(id: number, value: number): NonogramModel {
    const state = this.state.slice();
    state[id] = value;
    const { rows, cols } = this.spec;
    return new NonogramModel(this.spec, state, settle(state, this.spec, [Math.floor(id / cols), rows + (id % cols)]));
  }

  /** The filled grid: rows x cols of 0 (empty) / 1 (filled). */
  solution(): number[][] {
    const { rows, cols } = this.spec;
    return Array.from({ length: rows }, (_, r) =>
      Array.from(this.state.subarray(r * cols, (r + 1) * cols))
    );
  }
}
