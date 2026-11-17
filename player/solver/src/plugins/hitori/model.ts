import { Branch, ConstraintModel } from "../../types";
import { connectivityCuts } from "../shading/connectivity";

/** Canonical Hitori representation, mirroring the frontend `HitoriCanon`: a number grid. */
export interface HitoriCanon {
  cells: number[][];
}

const UNDECIDED = -1;
const WHITE = 0;
const SHADED = 1;

interface Spec {
  rows: number;
  cols: number;
  cellCount: number;
  /** Cell id -> orthogonal neighbours. */
  neighbours: number[][];
  /** Cell id -> the other cells with the same number in its row and in its column. */
  twins: number[][];
}

function buildSpec(canon: HitoriCanon): Spec {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  const cellCount = rows * cols;
  const value = (x: number) => canon.cells[Math.floor(x / cols)][x % cols];
  const neighbours: number[][] = Array.from({ length: cellCount }, () => []);
  const twins: number[][] = Array.from({ length: cellCount }, () => []);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = r * cols + c;
      if (c + 1 < cols) {
        neighbours[x].push(x + 1);
        neighbours[x + 1].push(x);
      }
      if (r + 1 < rows) {
        neighbours[x].push(x + cols);
        neighbours[x + cols].push(x);
      }
      for (let k = 0; k < cols; k++) if (k !== c && value(r * cols + k) === value(x)) twins[x].push(r * cols + k);
      for (let k = 0; k < rows; k++) if (k !== r && value(k * cols + c) === value(x)) twins[x].push(k * cols + c);
    }
  }
  return { rows, cols, cellCount, neighbours, twins };
}

/**
 * Native CSP solver for Hitori (puzzle type 26). One variable per cell, shaded or white,
 * under exactly the rules the player's completion check applies (web HitoriBoard,
 * Android HitoriEngine): no repeated number among a row's or column's white cells, no two
 * shaded cells touching, white cells connected. In particular a number that repeats
 * nothing may be shaded if those hold, so the gate calls a board unique only when the
 * completion check would accept exactly one answer.
 *
 * Propagated to a fixpoint on every assignment:
 *  - Repeats: a white cell shades every other cell with its number in its row and column.
 *  - Shaded cells never touch: a shaded cell whitens its neighbours.
 *  - Connectivity: white cells stay connected; an undecided cell that is their only link
 *    is white (`connectivityCuts`).
 *
 * All are necessary conditions, so forcing is sound and the search stays complete;
 * `isSolved` re-checks every rule on the full board. Construction ends with failed-literal
 * probing over every cell.
 */
export class HitoriModel implements ConstraintModel<number[][]> {
  private constructor(
    private readonly spec: Spec,
    private readonly state: Int8Array,
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: HitoriCanon): HitoriModel {
    const spec = buildSpec(canon);
    const model = new HitoriModel(spec, new Int8Array(spec.cellCount).fill(UNDECIDED), false);
    if (spec.cellCount === 0) return model.toDead();
    return model.propagate([]).probe();
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    if (this.dead) return false;
    for (let x = 0; x < this.spec.cellCount; x++) if (this.state[x] === UNDECIDED) return false;
    return this.checkFull();
  }

  selectBranch(): Branch | null {
    // The undecided cell with the most undecided twins, white first: a white cell shades
    // all of them, so that branch settles the most and dead ends show up early. (Fewest
    // twins, shaded first, took 6.4s on the 17x17 sample; this takes ~65ms.)
    const { spec, state } = this;
    let best = -1;
    let bestOpen = -1;
    for (let x = 0; x < spec.cellCount; x++) {
      if (state[x] !== UNDECIDED) continue;
      let open = 0;
      for (const y of spec.twins[x]) if (state[y] === UNDECIDED) open++;
      if (open > bestOpen) {
        bestOpen = open;
        best = x;
      }
    }
    return best < 0 ? null : { id: best, candidates: [WHITE, SHADED] };
  }

  assign(id: number, value: number): ConstraintModel<number[][]> {
    return this.assignRaw(id, value);
  }

  private assignRaw(x: number, value: number): HitoriModel {
    if (this.state[x] !== UNDECIDED) return this.state[x] === value ? this : this.toDead();
    const state = Int8Array.from(this.state);
    state[x] = value;
    return new HitoriModel(this.spec, state, false).propagate([x]);
  }

  solution(): number[][] {
    const { rows, cols } = this.spec;
    return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (this.state[r * cols + c] === SHADED ? 1 : 0)));
  }

  /** Failed-literal probing over every cell, to a fixpoint. */
  private probe(): HitoriModel {
    let m: HitoriModel = this;
    for (let changed = true; changed && !m.dead; ) {
      changed = false;
      for (let x = 0; x < m.spec.cellCount && !m.dead; x++) {
        if (m.state[x] !== UNDECIDED) continue;
        const shaded = m.assignRaw(x, SHADED);
        if (shaded.dead) {
          m = m.assignRaw(x, WHITE);
          changed = true;
          continue;
        }
        const white = m.assignRaw(x, WHITE);
        if (white.dead) {
          m = shaded;
          changed = true;
        }
      }
    }
    return m;
  }

  private toDead(): HitoriModel {
    return new HitoriModel(this.spec, this.state, true);
  }

  /** Run every rule to a fixpoint, mutating `this.state` (the caller copied it). */
  private propagate(changed: number[]): HitoriModel {
    const { spec, state } = this;
    const queue = [...changed];
    let qi = 0;
    const force = (x: number, v: number): boolean => {
      if (state[x] === v) return true;
      if (state[x] !== UNDECIDED) return false;
      state[x] = v;
      queue.push(x);
      return true;
    };

    for (;;) {
      while (qi < queue.length) {
        const x = queue[qi++];
        if (state[x] === WHITE) {
          for (const y of spec.twins[x]) if (!force(y, SHADED)) return this.toDead();
        } else {
          for (const y of spec.neighbours[x]) if (!force(y, WHITE)) return this.toDead();
        }
      }
      const cuts = connectivityCuts(spec.neighbours, state, WHITE);
      if (cuts === null) return this.toDead();
      for (const x of cuts) if (!force(x, WHITE)) return this.toDead();
      if (qi < queue.length) continue;
      return this;
    }
  }

  /** Every rule on a fully decided board. */
  private checkFull(): boolean {
    const { spec, state } = this;
    for (let x = 0; x < spec.cellCount; x++) {
      if (state[x] === WHITE) {
        if (spec.twins[x].some((y) => state[y] === WHITE)) return false;
      } else {
        if (spec.neighbours[x].some((y) => state[y] === SHADED)) return false;
      }
    }
    return connectivityCuts(spec.neighbours, state, WHITE) !== null;
  }
}
