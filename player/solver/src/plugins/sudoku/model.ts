import { Branch, ConstraintModel } from "../../types";
import { PEERS } from "./peers";

/** Canonical Sudoku representation: 9x9 of hints, 0 = empty. */
export interface SudokuCanon {
  hints: number[][];
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
 * Remove `value` from cell `id`'s domain, cascading naked singles to peers.
 * Mutates `domains`. Returns false on contradiction (a domain wiped to empty).
 */
function eliminate(domains: number[], id: number, value: number): boolean {
  const b = bit(value);
  if ((domains[id] & b) === 0) return true; // already gone
  domains[id] &= ~b;
  if (domains[id] === 0) return false; // contradiction
  if (isSingle(domains[id])) {
    // Cell became forced -> remove its value from all peers.
    const v = onlyValue(domains[id]);
    for (const peer of PEERS[id]) {
      if (!eliminate(domains, peer, v)) return false;
    }
  }
  return true;
}

/** Assign `value` to cell `id` by eliminating every other candidate. */
function assignValue(domains: number[], id: number, value: number): boolean {
  for (const v of valuesOf(domains[id])) {
    if (v !== value && !eliminate(domains, id, v)) return false;
  }
  return true;
}

export class SudokuModel implements ConstraintModel {
  private constructor(
    private readonly domains: number[],
    private readonly dead: boolean
  ) {}

  static fromCanon(canon: SudokuCanon): SudokuModel {
    const domains = new Array<number>(81).fill(FULL);
    let alive = true;
    for (let r = 0; r < 9 && alive; r++) {
      for (let c = 0; c < 9 && alive; c++) {
        const v = canon.hints[r]?.[c] ?? 0;
        if (v !== 0 && !assignValue(domains, r * 9 + c, v)) alive = false;
      }
    }
    return new SudokuModel(domains, !alive);
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
    let bestCount = 10;
    for (let id = 0; id < 81; id++) {
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
    const ok = assignValue(next, id, value);
    return new SudokuModel(next, !ok);
  }

  solution(): number[][] {
    const grid: number[][] = [];
    for (let r = 0; r < 9; r++) {
      const row: number[] = [];
      for (let c = 0; c < 9; c++) {
        const mask = this.domains[r * 9 + c];
        row.push(isSingle(mask) ? onlyValue(mask) : 0);
      }
      grid.push(row);
    }
    return grid;
  }
}
