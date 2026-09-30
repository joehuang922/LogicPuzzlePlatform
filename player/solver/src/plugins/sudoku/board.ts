import { CellValues } from "../../types";
import { SudokuCanon } from "./model";
import { PEERS } from "./peers";

/**
 * A read-only candidate board for hint reasoning. Combines the puzzle's givens with the
 * player's committed entries and derives, for each empty cell, the digits still legal
 * given its peers. Reasons from committed values only — player pencil-marks are ignored
 * (plan.md prerequisite decision).
 */
export class SudokuBoard {
  /** value[id] = 1..9 for a filled cell, 0 for empty. */
  readonly values: number[];
  /** candidates[id] = sorted legal digits for an empty cell; [] for a filled cell. */
  readonly candidates: number[][];

  private constructor(values: number[], candidates: number[][]) {
    this.values = values;
    this.candidates = candidates;
  }

  static build(canon: SudokuCanon, entered: CellValues): SudokuBoard {
    const values = new Array<number>(81).fill(0);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const id = r * 9 + c;
        const hint = canon.hints[r]?.[c] ?? 0;
        // Givens win; otherwise take the player's entry keyed "col,row".
        values[id] = hint !== 0 ? hint : entered[`${c},${r}`] ?? 0;
      }
    }

    const candidates: number[][] = [];
    for (let id = 0; id < 81; id++) {
      if (values[id] !== 0) {
        candidates.push([]);
        continue;
      }
      const taken = new Set<number>();
      for (const peer of PEERS[id]) {
        if (values[peer] !== 0) taken.add(values[peer]);
      }
      const legal: number[] = [];
      for (let v = 1; v <= 9; v++) if (!taken.has(v)) legal.push(v);
      candidates.push(legal);
    }
    return new SudokuBoard(values, candidates);
  }

  isEmpty(id: number): boolean {
    return this.values[id] === 0;
  }
}

/** Row/col/box unit index helpers. Each returns the 9 cell ids of that unit. */
export const UNITS: number[][] = (() => {
  const units: number[][] = [];
  for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let br = 0; br < 9; br += 3)
    for (let bc = 0; bc < 9; bc += 3) {
      const box: number[] = [];
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++) box.push((br + dr) * 9 + (bc + dc));
      units.push(box);
    }
  return units;
})();

/** Box index (0..8) for a cell id. */
export function boxOf(id: number): number {
  const r = Math.floor(id / 9);
  const c = id % 9;
  return Math.floor(r / 3) * 3 + Math.floor(c / 3);
}

/** Human-readable cell label, e.g. id 30 -> "R4C4". */
export function cellLabel(id: number): string {
  return `R${Math.floor(id / 9) + 1}C${(id % 9) + 1}`;
}

/** Unit label for an explanation, given the unit's index in UNITS (0..26). */
export function unitLabel(unitIndex: number): string {
  if (unitIndex < 9) return `row ${unitIndex + 1}`;
  if (unitIndex < 18) return `column ${unitIndex - 9 + 1}`;
  return `box ${unitIndex - 18 + 1}`;
}
