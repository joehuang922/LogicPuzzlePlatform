import { Branch, ConstraintModel } from "../../types";

/** Canonical Kakuro representation, mirroring the frontend `KakuroCanon`. */
export type KakuroCell =
  | { type: "clue"; right?: number | null; down?: number | null }
  | { type: "empty" };

export interface KakuroCanon {
  cells: KakuroCell[][];
}

/**
 * A run is a clue's maximal strip of empty cells (right or down). `cells` holds the
 * opaque variable ids (row * cols + col) in order, and `sum` is the clue total. Each
 * run constrains its cells to distinct digits 1..9 summing to `sum` — the two Kakuro
 * rules. Runs are static per puzzle, so a model shares them by reference and only
 * copies `domains` on assign.
 */
interface RunMeta {
  cells: number[];
  sum: number;
}

/** A puzzle's static run structure, shared by every model: `cellRuns[id]` indexes `runs`. */
interface Shape {
  runs: RunMeta[];
  cellRuns: number[][];
}

const FULL = 0b1111111110; // bits 1..9 set (bit v = value v)
const bit = (v: number) => 1 << v;
const isSingle = (mask: number) => mask !== 0 && (mask & (mask - 1)) === 0;

function onlyValue(mask: number): number {
  // mask is a single bit; return its value (1..9).
  return 31 - Math.clz32(mask);
}

function valuesOf(mask: number): number[] {
  const out: number[] = [];
  for (let v = 1; v <= 9; v++) if (mask & bit(v)) out.push(v);
  return out;
}

/**
 * The addition table: COMBOS[n][sum] lists, as digit masks, every set of `n` distinct
 * digits 1..9 adding to `sum` — the "formulas" a solver memorises (2 cells: 3 = {1,2},
 * 17 = {8,9}; 9 cells: 45 = {1..9}). Built once at load (512 subsets). A run can only
 * use the digits of one of its combos, so runs with few combos collapse immediately.
 */
export const COMBOS: number[][][] = (() => {
  const table: number[][][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 46 }, () => [] as number[])
  );
  for (let mask = FULL; mask > 0; mask = (mask - 1) & FULL) {
    let n = 0;
    let sum = 0;
    for (let v = 1; v <= 9; v++) {
      if (mask & bit(v)) {
        n++;
        sum += v;
      }
    }
    table[n][sum].push(mask);
  }
  return table;
})();

/** Memo for runSupports' completion search: one byte per (cell index, used digits). */
const memo = new Int8Array(10 * 512);

/**
 * Arc-consistency for one run: for each cell, the digits that participate in *some*
 * assignment of distinct digits (one per cell, within each cell's current domain)
 * summing to `sum`. A returned mask of 0 for any cell means the run is unsatisfiable
 * given these domains. Exact (not a heuristic).
 *
 * Works per combo from {@link COMBOS} rather than per ordering: within a combo, the
 * search state is just (cell index, digits used so far), so memoising it bounds the
 * work at k * 2^k states instead of k! orderings — a 9-cell 45 run is 9 * 512 states,
 * not 362,880 permutations.
 */
function runSupports(domainList: number[], sum: number): number[] {
  const k = domainList.length;
  const supported = new Array<number>(k).fill(0);
  const combos = k <= 9 && sum <= 45 ? COMBOS[k][sum] : [];

  let union = 0;
  for (const d of domainList) union |= d;

  for (const combo of combos) {
    // Every combo digit needs a cell that can hold it, and every cell a combo digit.
    if ((combo & union) !== combo) continue;
    if (domainList.some((d) => (d & combo) === 0)) continue;

    memo.fill(0, 0, k * 512); // 0 = unvisited, 1 = completes, 2 = dead end
    // Explores every branch (no short-circuit) so each completable (i, used) state marks
    // all of its digits as supported the first time it is visited.
    const complete = (i: number, used: number): boolean => {
      if (i === k) return true; // k distinct combo digits placed: used === combo
      const key = i * 512 + (used >> 1);
      if (memo[key] !== 0) return memo[key] === 1;
      let ok = false;
      let free = domainList[i] & combo & ~used;
      while (free) {
        const b = free & -free;
        free ^= b;
        if (complete(i + 1, used | b)) {
          supported[i] |= b;
          ok = true;
        }
      }
      memo[key] = ok ? 1 : 2;
      return ok;
    };
    complete(0, 0);
  }
  return supported;
}

/**
 * Propagate run constraints over `domains` to a fixed point, in place. Returns false
 * on contradiction (a cell's domain wiped out). Runs share cells, so a reduction in
 * one run can unlock another; only the runs crossing a changed cell are re-checked.
 * `seed` lists the runs to start from (all of them at load, the assigned cell's after
 * an assign).
 */
function propagate(domains: number[], shape: Shape, seed: number[]): boolean {
  const { runs, cellRuns } = shape;
  const queued = new Uint8Array(runs.length);
  const queue: number[] = [];
  for (const r of seed) {
    if (!queued[r]) {
      queued[r] = 1;
      queue.push(r);
    }
  }
  while (queue.length > 0) {
    const r = queue.pop()!;
    queued[r] = 0;
    const run = runs[r];
    const supports = runSupports(
      run.cells.map((id) => domains[id]),
      run.sum
    );
    for (let i = 0; i < run.cells.length; i++) {
      const id = run.cells[i];
      const nd = domains[id] & supports[i];
      if (nd === 0) return false; // no digit survives -> dead
      if (nd !== domains[id]) {
        domains[id] = nd;
        for (const other of cellRuns[id]) {
          if (other !== r && !queued[other]) {
            queued[other] = 1;
            queue.push(other);
          }
        }
      }
    }
  }
  return true;
}

/** Collect the runs owned by every clue cell in the canon. */
function buildRuns(cells: KakuroCell[][]): RunMeta[] {
  const rows = cells.length;
  const cols = cells[0].length;
  const runs: RunMeta[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      if (cell.type !== "clue") continue;
      if (cell.right != null) {
        const ids: number[] = [];
        for (let cc = c + 1; cc < cols && cells[r][cc].type === "empty"; cc++) {
          ids.push(r * cols + cc);
        }
        if (ids.length > 0) runs.push({ cells: ids, sum: cell.right });
      }
      if (cell.down != null) {
        const ids: number[] = [];
        for (let rr = r + 1; rr < rows && cells[rr][c].type === "empty"; rr++) {
          ids.push(rr * cols + c);
        }
        if (ids.length > 0) runs.push({ cells: ids, sum: cell.down });
      }
    }
  }
  return runs;
}

export class KakuroModel implements ConstraintModel {
  private constructor(
    private readonly domains: number[],
    private readonly rows: number,
    private readonly cols: number,
    private readonly shape: Shape,
    private readonly emptyIds: number[],
    private readonly dead: boolean
  ) {}

  static fromCanon(canon: KakuroCanon): KakuroModel {
    const cells = canon.cells;
    const rows = cells.length;
    const cols = cells[0].length;
    const domains = new Array<number>(rows * cols).fill(0);
    const emptyIds: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r][c].type === "empty") {
          const id = r * cols + c;
          domains[id] = FULL;
          emptyIds.push(id);
        }
      }
    }
    const runs = buildRuns(cells);
    const cellRuns: number[][] = Array.from({ length: rows * cols }, () => []);
    runs.forEach((run, r) => run.cells.forEach((id) => cellRuns[id].push(r)));
    const shape = { runs, cellRuns };
    const alive = propagate(domains, shape, runs.map((_, r) => r));
    return new KakuroModel(domains, rows, cols, shape, emptyIds, !alive);
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    if (this.dead) return false;
    for (const id of this.emptyIds) {
      if (!isSingle(this.domains[id])) return false;
    }
    // Every cell is a single digit; verify the two rules per run directly rather than
    // trusting propagation invariants.
    for (const run of this.shape.runs) {
      let total = 0;
      let seen = 0;
      for (const id of run.cells) {
        const v = onlyValue(this.domains[id]);
        if (seen & bit(v)) return false; // repeated digit in the run
        seen |= bit(v);
        total += v;
      }
      if (total !== run.sum) return false;
    }
    return true;
  }

  selectBranch(): Branch | null {
    // Min-remaining-values: branch on the most-constrained unsolved cell.
    let bestId = -1;
    let bestCount = 10;
    for (const id of this.emptyIds) {
      const mask = this.domains[id];
      if (isSingle(mask)) continue;
      const count = valuesOf(mask).length;
      if (count < bestCount) {
        bestCount = count;
        bestId = id;
        if (count === 2) break; // can't do better than 2 for an unsolved cell
      }
    }
    if (bestId === -1) return null; // fully assigned
    return { id: bestId, candidates: valuesOf(this.domains[bestId]) };
  }

  assign(id: number, value: number): ConstraintModel {
    const next = this.domains.slice();
    next[id] = bit(value);
    const ok = propagate(next, this.shape, this.shape.cellRuns[id]);
    return new KakuroModel(next, this.rows, this.cols, this.shape, this.emptyIds, !ok);
  }

  solution(): number[][] {
    const grid: number[][] = [];
    for (let r = 0; r < this.rows; r++) {
      const row = new Array<number>(this.cols).fill(0);
      grid.push(row);
    }
    for (const id of this.emptyIds) {
      const mask = this.domains[id];
      grid[Math.floor(id / this.cols)][id % this.cols] = isSingle(mask) ? onlyValue(mask) : 0;
    }
    return grid;
  }
}
