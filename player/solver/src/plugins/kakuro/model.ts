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
 * Min and max sum obtainable from `n` distinct digits in 1..9 that are not in
 * `usedMask`, or null when fewer than `n` such digits remain. Used to prune the
 * per-run search: a partial assignment whose remaining target falls outside
 * [min, max] can never complete.
 */
function boundSum(usedMask: number, n: number): { min: number; max: number } | null {
  const avail: number[] = [];
  for (let v = 1; v <= 9; v++) if (!(usedMask & bit(v))) avail.push(v);
  if (avail.length < n) return null;
  let min = 0;
  let max = 0;
  for (let i = 0; i < n; i++) {
    min += avail[i];
    max += avail[avail.length - 1 - i];
  }
  return { min, max };
}

/**
 * Arc-consistency for one run: for each cell, the digits that participate in *some*
 * assignment of distinct digits (one per cell, within each cell's current domain)
 * summing to `sum`. A returned mask of 0 for any cell means the run is unsatisfiable
 * given these domains. Exact (not a heuristic), with sum-bound pruning so the search
 * stays cheap on long runs.
 */
function runSupports(domainList: number[], sum: number): number[] {
  const k = domainList.length;
  const supported = new Array<number>(k).fill(0);
  const path = new Array<number>(k);

  function rec(i: number, usedMask: number, remaining: number): void {
    if (i === k) {
      if (remaining === 0) {
        for (let j = 0; j < k; j++) supported[j] |= bit(path[j]);
      }
      return;
    }
    // Still need `left` distinct digits (this cell included) summing to `remaining`.
    const left = k - i;
    const b = boundSum(usedMask, left);
    if (!b || remaining < b.min || remaining > b.max) return;
    for (const v of valuesOf(domainList[i])) {
      if (usedMask & bit(v)) continue; // distinctness within the run
      const nr = remaining - v;
      if (nr < 0) continue;
      path[i] = v;
      rec(i + 1, usedMask | bit(v), nr);
    }
  }

  rec(0, 0, sum);
  return supported;
}

/**
 * Propagate run constraints over `domains` to a fixed point, in place. Returns false
 * on contradiction (a cell's domain wiped out). Runs share cells, so a reduction in
 * one run can unlock another — hence the iterate-until-stable loop.
 */
function propagate(domains: number[], runs: RunMeta[]): boolean {
  let changed = true;
  while (changed) {
    changed = false;
    for (const run of runs) {
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
          changed = true;
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
    private readonly runs: RunMeta[],
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
    const alive = propagate(domains, runs);
    return new KakuroModel(domains, rows, cols, runs, emptyIds, !alive);
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
    for (const run of this.runs) {
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
    const ok = propagate(next, this.runs);
    return new KakuroModel(next, this.rows, this.cols, this.runs, this.emptyIds, !ok);
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
