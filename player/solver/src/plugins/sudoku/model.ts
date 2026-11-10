import { Branch, ConstraintModel } from "../../types";
import { sudokuDims } from "./dims";
import { sudokuGeometry } from "./board";

/**
 * Canonical Sudoku representation: N x N of hints, 0 = empty. A room is `room_width`
 * columns by `room_height` rows (both default 3, giving the standard 9x9), and
 * N = room_width * room_height.
 */
export interface SudokuCanon {
  room_width?: number;
  room_height?: number;
  hints: number[][];
}

const bit = (v: number) => 1 << v;
/** Bits 1..n set (bit v = value v). n <= 30 keeps it a positive 32-bit int. */
const fullMask = (n: number) => 2 ** (n + 1) - 2;
const isSingle = (mask: number) => mask !== 0 && (mask & (mask - 1)) === 0;

function onlyValue(mask: number): number {
  // mask is a single bit; return its value.
  return 31 - Math.clz32(mask);
}

function valuesOf(mask: number): number[] {
  const out: number[] = [];
  for (let m = mask; m !== 0; m &= m - 1) out.push(31 - Math.clz32(m & -m));
  return out;
}

/** A board's shape: per cell its peers and the units (rows, columns, boxes) holding it. */
interface Shape {
  peers: number[][];
  units: number[][];
  cellUnits: number[][];
}

/**
 * Remove `value` from cell `id`'s domain and propagate (Norvig): a cell left with one
 * digit removes it from its peers (naked single), and a digit left with one place in a
 * unit goes there (hidden single). Hidden singles keep the search small on 25x25 and
 * 30x30 boards, where naked singles alone leave it branching for seconds.
 * Mutates `domains`. Returns false on contradiction (a domain wiped to empty, or a
 * digit with no place left in a unit).
 */
function eliminate(shape: Shape, domains: number[], id: number, value: number): boolean {
  const b = bit(value);
  if ((domains[id] & b) === 0) return true; // already gone
  domains[id] &= ~b;
  if (domains[id] === 0) return false; // contradiction
  if (isSingle(domains[id])) {
    // Cell became forced -> remove its value from all peers.
    const v = onlyValue(domains[id]);
    for (const peer of shape.peers[id]) {
      if (!eliminate(shape, domains, peer, v)) return false;
    }
  }
  for (const u of shape.cellUnits[id]) {
    let place = -1;
    let count = 0;
    for (const other of shape.units[u]) {
      if (domains[other] & b) {
        place = other;
        if (++count > 1) break;
      }
    }
    if (count === 0) return false;
    if (count === 1 && domains[place] !== b && !assignValue(shape, domains, place, value)) return false;
  }
  return true;
}

/** Assign `value` to cell `id` by eliminating every other candidate. */
function assignValue(shape: Shape, domains: number[], id: number, value: number): boolean {
  for (const v of valuesOf(domains[id])) {
    if (v !== value && !eliminate(shape, domains, id, v)) return false;
  }
  return true;
}

export class SudokuModel implements ConstraintModel {
  private constructor(
    private readonly n: number,
    private readonly shape: Shape,
    private readonly domains: number[],
    private readonly dead: boolean
  ) {}

  static fromCanon(canon: SudokuCanon): SudokuModel {
    const dims = sudokuDims(canon);
    const n = dims.size;
    const shape = sudokuGeometry(dims);
    const domains = new Array<number>(n * n).fill(fullMask(n));
    let alive = true;
    for (let r = 0; r < n && alive; r++) {
      for (let c = 0; c < n && alive; c++) {
        const v = canon.hints[r]?.[c] ?? 0;
        if (v < 0 || v > n) alive = false;
        else if (v !== 0 && !assignValue(shape, domains, r * n + c, v)) alive = false;
      }
    }
    return new SudokuModel(n, shape, domains, !alive);
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    if (this.dead) return false;
    return this.domains.every(isSingle);
  }

  selectBranch(): Branch | null {
    // Min-remaining-values: branch on the most-constrained unsolved cell.
    let bestId = -1;
    let bestCount = Infinity;
    for (let id = 0; id < this.domains.length; id++) {
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
    const ok = assignValue(this.shape, next, id, value);
    return new SudokuModel(this.n, this.shape, next, !ok);
  }

  solution(): number[][] {
    const n = this.n;
    const grid: number[][] = [];
    for (let r = 0; r < n; r++) {
      const row: number[] = [];
      for (let c = 0; c < n; c++) {
        const mask = this.domains[r * n + c];
        row.push(isSingle(mask) ? onlyValue(mask) : 0);
      }
      grid.push(row);
    }
    return grid;
  }
}
