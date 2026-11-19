import { Branch, ConstraintModel } from "../../types";

/** Canonical Fillomino representation, mirroring the frontend `FillominoCanon`. */
export interface FillominoCanon {
  /** rows x cols: 0 = empty, a positive integer = a clue (its region's size). */
  cells: number[][];
}

/** The answer shape (FillominoAnswer): the number grid and the walls between rooms. */
export interface FillominoSolution {
  numbers: number[][];
  edges: { h: number[][]; v: number[][] };
}

/**
 * Values are tracked as bit sets over 1..MAX_VALUE in two 31-bit words per cell (`lo` for
 * 1..31, `hi` for 32..62). An answer with a region of more than 62 cells is outside the
 * model; no real puzzle comes close.
 */
const MAX_VALUE = 62;

interface Spec {
  rows: number;
  cols: number;
  cellCount: number;
  clue: Int32Array;
  neighbours: number[][];
  maxValue: number;
  /**
   * Reusable marks for the room rule's area counts: a cell is "known big" for the current
   * count when big[x] === the count's stamp. Saves a board-sized array per count.
   */
  scratch: { big: Int32Array; stamp: number; area: Int32Array; inArea: Int32Array; areaStamp: number };
  /** Reusable arrays for `applyGroups` (never reentered: it doesn't call propagate). */
  groupScratch: {
    groupOf: Int32Array;
    cellsFlat: Int32Array;
    start: Int32Array;
    value: Int32Array;
    dist: Int32Array;
    mark: Int32Array;
    queue: Int32Array;
    /** Extra stamp-marked sets for `applyGroupsLocal` (open cells to check, exits). */
    openMark: Int32Array;
    exitMark: Int32Array;
    stamp: number;
  };
}

function buildSpec(canon: FillominoCanon): Spec {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  const cellCount = rows * cols;
  const clue = new Int32Array(cellCount);
  const neighbours: number[][] = Array.from({ length: cellCount }, () => []);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = r * cols + c;
      clue[x] = Math.max(0, canon.cells[r][c] | 0);
      if (c + 1 < cols) {
        neighbours[x].push(x + 1);
        neighbours[x + 1].push(x);
      }
      if (r + 1 < rows) {
        neighbours[x].push(x + cols);
        neighbours[x + cols].push(x);
      }
    }
  }
  return {
    rows, cols, cellCount, clue, neighbours,
    maxValue: Math.min(MAX_VALUE, cellCount),
    scratch: { big: new Int32Array(cellCount), stamp: 0, area: new Int32Array(cellCount), inArea: new Int32Array(cellCount), areaStamp: 0 },
    groupScratch: {
      groupOf: new Int32Array(cellCount),
      cellsFlat: new Int32Array(cellCount),
      start: new Int32Array(cellCount + 1),
      value: new Int32Array(cellCount),
      dist: new Int32Array(cellCount),
      mark: new Int32Array(cellCount),
      queue: new Int32Array(cellCount),
      openMark: new Int32Array(cellCount),
      exitMark: new Int32Array(cellCount),
      stamp: 0,
    },
  };
}

// -- domain helpers (two words per cell) ---------------------------------------

const word = (v: number) => (v <= 31 ? 0 : 1);
const bitOf = (v: number) => 1 << ((v <= 31 ? v : v - 31) - 1);
const popcount = (m: number) => {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
};
const lowValue = (m: number, base: number) => 31 - Math.clz32(m & -m) + 1 + base;

/**
 * Native CSP solver for Fillomino (puzzle type 14), working on the numbers alone: the
 * walls only mark where the numbers change. A filling is an answer exactly when every
 * connected group of equal numbers has as many cells as its number (two rooms of the same
 * number can't touch, so equal neighbours always share a room) and the board is more than
 * one room (the completion check wants at least one wall).
 *
 * Each cell keeps the set of values it can still take. Propagated to a fixpoint:
 *
 *  - Fixed groups: a group of equal fixed numbers past its number is a dead end; a group
 *    of its full size removes its number from every cell around it.
 *  - Merging: a cell can't take a number that would join groups of it past their size.
 *  - Growth: a group short of its number must reach its size through cells that can take
 *    the number (within the cells it still needs), and takes its only way out.
 *  - Room: a cell keeps a number only if the cells that can take it, connected to it,
 *    number at least that many.
 *
 * All are necessary conditions, so the search stays complete; `isSolved` re-checks the
 * rule on the full board. Failed-literal probing over every (cell, value) pair runs at
 * construction and after every search assignment.
 */
export class FillominoModel implements ConstraintModel<FillominoSolution> {
  private constructor(
    private readonly spec: Spec,
    /** lo/hi value words per cell: dom[2x] values 1..31, dom[2x+1] values 32..62. */
    private readonly dom: Int32Array,
    private readonly dead: boolean,
  ) {}

  /**
   * (cell, value) pairs removed during the current propagation and not yet re-checked by
   * the room rule: [x0, v0, x1, v1, ...]. Only lives while `propagate` runs.
   */
  private removed: number[] = [];
  /** Cells whose values changed in the current pass (for the local group rules). */
  private touched: number[] = [];
  /** Set by any domain change in the current propagation pass. */
  private changed = false;

  static fromCanon(canon: FillominoCanon): FillominoModel {
    const spec = buildSpec(canon);
    const dom = new Int32Array(spec.cellCount * 2);
    const model = new FillominoModel(spec, dom, false);
    if (spec.cellCount === 0) return model.toDead();
    const all = [0, 0];
    for (let v = 1; v <= spec.maxValue; v++) all[word(v)] |= bitOf(v);
    for (let x = 0; x < spec.cellCount; x++) {
      const n = spec.clue[x];
      if (n > 0) {
        if (n > spec.maxValue) return model.toDead();
        dom[2 * x + word(n)] = bitOf(n);
      } else {
        dom[2 * x] = all[0];
        dom[2 * x + 1] = all[1];
      }
    }
    // The room rule over every value once; afterwards it only re-checks around removals.
    if (!model.applyRoomAll()) return model.toDead();
    return model.propagate().probe();
  }

  // -- domain access --

  private has(x: number, v: number): boolean {
    return (this.dom[2 * x + word(v)] & bitOf(v)) !== 0;
  }

  private size(x: number): number {
    return popcount(this.dom[2 * x]) + popcount(this.dom[2 * x + 1]);
  }

  /** The value of a fixed cell (domain of one), else 0. */
  private fixed(x: number): number {
    const lo = this.dom[2 * x];
    const hi = this.dom[2 * x + 1];
    if (lo && !hi && (lo & (lo - 1)) === 0) return lowValue(lo, 0);
    if (hi && !lo && (hi & (hi - 1)) === 0) return lowValue(hi, 31);
    return 0;
  }

  private values(x: number): number[] {
    const out: number[] = [];
    for (let m = this.dom[2 * x]; m; m &= m - 1) out.push(lowValue(m, 0));
    for (let m = this.dom[2 * x + 1]; m; m &= m - 1) out.push(lowValue(m, 31));
    return out;
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    if (this.dead) return false;
    for (let x = 0; x < this.spec.cellCount; x++) if (!this.fixed(x)) return false;
    return this.checkFull();
  }

  /**
   * A cell down to two values is a plain binary choice. Otherwise grow a group short of
   * its number: at its way out with the fewest options, the exit either joins it (v) or
   * doesn't (-v, "remove v"). Branching on an open cell's value instead tries every size
   * a free area allows, dozens of values that each fail the same way. Once every group is
   * complete, the undecided cell with the fewest values left, smallest value first.
   */
  selectBranch(): Branch | null {
    let best = -1;
    let bestSize = Infinity;
    for (let x = 0; x < this.spec.cellCount; x++) {
      const n = this.size(x);
      if (n > 1 && n < bestSize) {
        bestSize = n;
        best = x;
        if (n === 2) break;
      }
    }
    if (best < 0) return null;
    if (bestSize > 2) {
      const grow = this.growthBranch();
      if (grow) return grow;
    }
    return { id: best, candidates: this.values(best) };
  }

  /** The exit of a short group with the fewest exits, as a join / don't-join branch. */
  private growthBranch(): Branch | null {
    const { spec } = this;
    const n = spec.cellCount;
    const seen = new Uint8Array(n);
    const exitSeen = new Int32Array(n).fill(-1);
    let bestExit = -1;
    let bestValue = 0;
    let bestExits = Infinity;
    for (let s = 0; s < n; s++) {
      const v = this.fixed(s);
      if (!v || seen[s]) continue;
      const cells = [s];
      seen[s] = 1;
      let exits = 0;
      let exit = -1;
      for (let i = 0; i < cells.length; i++) {
        for (const y of spec.neighbours[cells[i]]) {
          if (seen[y] && this.fixed(y) === v) continue;
          if (this.fixed(y) === v) {
            seen[y] = 1;
            cells.push(y);
          } else if (exitSeen[y] !== s && this.has(y, v)) {
            exitSeen[y] = s;
            exits++;
            exit = y;
          }
        }
      }
      if (cells.length < v && exits > 0 && exits < bestExits) {
        bestExits = exits;
        bestExit = exit;
        bestValue = v;
      }
    }
    return bestExit < 0 ? null : { id: bestExit, candidates: [bestValue, -bestValue] };
  }

  /** `value` fixes the cell; a negative value removes `-value` from it instead. */
  assign(id: number, value: number): ConstraintModel<FillominoSolution> {
    const m = value > 0 ? this.with(id, value) : this.has(id, -value) ? this.without(id, -value) : this.toDead();
    return m.dead ? m : m.probe();
  }

  /**
   * A copy with cell x fixed to v, propagated. `local` (probe trials) re-checks only the
   * groups near what changed; weaker, never wrong, and far cheaper on a big board.
   */
  private with(x: number, v: number, local = false): FillominoModel {
    if (!this.has(x, v)) return this.toDead();
    const m = new FillominoModel(this.spec, Int32Array.from(this.dom), false);
    m.set(x, v);
    return m.propagate(local);
  }

  /** A copy with value v removed from cell x, propagated. */
  private without(x: number, v: number): FillominoModel {
    const m = new FillominoModel(this.spec, Int32Array.from(this.dom), false);
    m.remove(x, v);
    if (!m.dom[2 * x] && !m.dom[2 * x + 1]) return m.toDead();
    return m.propagate();
  }

  solution(): FillominoSolution {
    const { rows, cols } = this.spec;
    const numbers = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => this.fixed(r * cols + c)));
    const h = Array.from({ length: rows - 1 }, (_, r) => Array.from({ length: cols }, (_, c) => (numbers[r][c] !== numbers[r + 1][c] ? 1 : 0)));
    const v = Array.from({ length: rows }, (_, r) => Array.from({ length: cols - 1 }, (_, c) => (numbers[r][c] !== numbers[r][c + 1] ? 1 : 0)));
    return { numbers, edges: { h, v } };
  }

  // -- propagation ------------------------------------------------------------

  /** Failed-literal probing over every (cell, value), to a fixpoint. */
  private probe(): FillominoModel {
    let m: FillominoModel = this;
    for (let changed = true; changed && !m.dead; ) {
      changed = false;
      for (let x = 0; x < m.spec.cellCount && !m.dead; x++) {
        if (m.fixed(x) || !m.spec.neighbours[x].some((y) => m.fixed(y))) continue;
        for (const v of m.values(x)) {
          if (m.dead || !m.has(x, v)) continue;
          if (m.with(x, v, true).dead) {
            m = m.without(x, v);
            changed = true;
          }
        }
      }
    }
    return m;
  }

  private toDead(): FillominoModel {
    return new FillominoModel(this.spec, this.dom, true);
  }

  /**
   * Run every rule to a fixpoint, mutating `this.dom` (the caller copied it). The group
   * rules scan the board each pass, or with `local` only near the cells that changed (see
   * `applyGroupsLocal`); the room rule only re-checks around removed values.
   */
  private propagate(local = false): FillominoModel {
    for (;;) {
      this.changed = false;
      const touched = this.touched;
      this.touched = [];
      const ok = local ? this.applyGroupsLocal(touched) : this.applyGroups();
      if (!ok || !this.applyRoomLocal()) return this.toDead();
      for (let x = 0; x < this.spec.cellCount; x++) if (!this.dom[2 * x] && !this.dom[2 * x + 1]) return this.toDead();
      if (!this.changed) return this;
    }
  }

  private remove(x: number, v: number): void {
    const i = 2 * x + word(v);
    const b = bitOf(v);
    if (!(this.dom[i] & b)) return;
    this.dom[i] &= ~b;
    this.removed.push(x, v);
    this.touched.push(x);
    this.changed = true;
  }

  private set(x: number, v: number): boolean {
    if (!this.has(x, v)) return false;
    for (const u of this.values(x)) if (u !== v) this.remove(x, u);
    return true;
  }

  /**
   * Fixed groups: overfull, complete, merging and growth. Runs on every propagation pass
   * of every probe, so it allocates nothing per pass: groups live in the reusable typed
   * arrays of `spec.groupScratch` (cells listed group by group), and walks use stamps.
   */
  private applyGroups(): boolean {
    const { spec } = this;
    const n = spec.cellCount;
    const gsx = spec.groupScratch;
    const { groupOf, cellsFlat, start, value, dist, mark } = gsx;
    groupOf.fill(-1);
    let groupCount = 0;
    let filled = 0;
    for (let s = 0; s < n; s++) {
      const v = this.fixed(s);
      if (!v || groupOf[s] >= 0) continue;
      const gi = groupCount++;
      start[gi] = filled;
      value[gi] = v;
      groupOf[s] = gi;
      cellsFlat[filled++] = s;
      for (let i = start[gi]; i < filled; i++) {
        for (const y of spec.neighbours[cellsFlat[i]]) {
          if (groupOf[y] < 0 && this.fixed(y) === v) {
            groupOf[y] = gi;
            cellsFlat[filled++] = y;
          }
        }
      }
    }
    start[groupCount] = filled;
    const sizeOf = (gi: number) => start[gi + 1] - start[gi];

    for (let gi = 0; gi < groupCount; gi++) {
      const size = sizeOf(gi);
      if (size > value[gi]) return false;
      if (size === value[gi]) {
        for (let i = start[gi]; i < start[gi + 1]; i++) {
          for (const y of spec.neighbours[cellsFlat[i]]) if (groupOf[y] < 0) this.remove(y, value[gi]);
        }
      }
    }

    // Merging: an open cell taking v joins every neighbouring v-group (at most four).
    const gs = [0, 0, 0, 0];
    for (let x = 0; x < n; x++) {
      if (this.fixed(x)) continue;
      let k = 0;
      for (const y of spec.neighbours[x]) {
        const gi = groupOf[y];
        if (gi < 0) continue;
        let dup = false;
        for (let j = 0; j < k; j++) if (gs[j] === gi) dup = true;
        if (!dup) gs[k++] = gi;
      }
      for (let i = 0; i < k; i++) {
        const v = value[gs[i]];
        let size = 1;
        let first = true;
        for (let j = 0; j < k; j++) {
          if (value[gs[j]] !== v) continue;
          if (j < i) first = false; // value already handled at its first group
          size += sizeOf(gs[j]);
        }
        if (first && size > v) this.remove(x, v);
      }
    }

    // Growth of groups short of their number: a way out, and enough cells within reach.
    for (let gi = 0; gi < groupCount; gi++) {
      const v = value[gi];
      const size = sizeOf(gi);
      if (size >= v) continue;
      const left = v - size;
      const stamp = ++gsx.stamp;
      let exit = -1;
      let exits = 0;
      for (let i = start[gi]; i < start[gi + 1]; i++) {
        for (const y of spec.neighbours[cellsFlat[i]]) {
          if (groupOf[y] === gi || mark[y] === stamp || !this.has(y, v)) continue;
          mark[y] = stamp;
          exit = y;
          exits++;
        }
      }
      if (exits === 0) return false;
      if (exits === 1 && !this.fixed(exit) && !this.set(exit, v)) return false;
      // Reach: cells within `left` steps that can take v (merged v-groups count fully).
      const walk = ++gsx.stamp;
      const queue = gsx.queue;
      let qn = 0;
      for (let i = start[gi]; i < start[gi + 1]; i++) {
        const x = cellsFlat[i];
        mark[x] = walk;
        dist[x] = 0;
        queue[qn++] = x;
      }
      for (let qi = 0; qi < qn && qn < v; qi++) {
        const x = queue[qi];
        if (dist[x] >= left) continue;
        for (const y of spec.neighbours[x]) {
          if (mark[y] === walk || !this.has(y, v)) continue;
          mark[y] = walk;
          dist[y] = dist[x] + 1;
          queue[qn++] = y;
        }
      }
      if (qn < v) return false;
    }
    return true;
  }

  /**
   * The group rules restricted to what a change can affect: the groups within two cells
   * of a touched cell, and the open cells beside touched cells and those groups. Used by
   * probe trials, where one cell changes per trial; anything farther keeps the deductions
   * it already had (the model was at a fixpoint before the trial).
   */
  private applyGroupsLocal(touched: number[]): boolean {
    const { spec } = this;
    const gsx = spec.groupScratch;
    const { groupOf, cellsFlat, start, value, dist, mark } = gsx;
    const inGroup = ++gsx.stamp; // mark[x] === inGroup: x belongs to a collected group
    let groupCount = 0;
    let filled = 0;
    const collect = (s: number): number => {
      if (mark[s] === inGroup) return groupOf[s];
      const v = this.fixed(s);
      if (!v) return -1;
      const gi = groupCount++;
      start[gi] = filled;
      value[gi] = v;
      mark[s] = inGroup;
      groupOf[s] = gi;
      cellsFlat[filled++] = s;
      for (let i = start[gi]; i < filled; i++) {
        for (const y of spec.neighbours[cellsFlat[i]]) {
          if (mark[y] !== inGroup && this.fixed(y) === v) {
            mark[y] = inGroup;
            groupOf[y] = gi;
            cellsFlat[filled++] = y;
          }
        }
      }
      start[gi + 1] = filled;
      return gi;
    };
    // Groups within two cells of a change.
    for (const t of touched) {
      collect(t);
      for (const y of spec.neighbours[t]) {
        collect(y);
        for (const z of spec.neighbours[y]) collect(z);
      }
    }
    const groupsNear = groupCount;
    const sizeOf = (gi: number) => start[gi + 1] - start[gi];
    const groupAt = (y: number) => (mark[y] === inGroup ? groupOf[y] : collect(y));

    // Open cells to check for merging: touched cells, their neighbours, and the cells
    // around the collected groups.
    const openStamp = ++gsx.stamp;
    const opens: number[] = [];
    const addOpen = (x: number) => {
      if (gsx.openMark[x] === openStamp || this.fixed(x)) return;
      gsx.openMark[x] = openStamp;
      opens.push(x);
    };
    for (const t of touched) {
      addOpen(t);
      for (const y of spec.neighbours[t]) addOpen(y);
    }
    for (let gi = 0; gi < groupsNear; gi++) {
      for (let i = start[gi]; i < start[gi + 1]; i++) for (const y of spec.neighbours[cellsFlat[i]]) addOpen(y);
    }

    for (let gi = 0; gi < groupsNear; gi++) {
      const size = sizeOf(gi);
      if (size > value[gi]) return false;
      if (size === value[gi]) {
        for (let i = start[gi]; i < start[gi + 1]; i++) {
          for (const y of spec.neighbours[cellsFlat[i]]) if (!this.fixed(y)) this.remove(y, value[gi]);
        }
      }
    }

    const gs = [0, 0, 0, 0];
    for (const x of opens) {
      if (this.fixed(x)) continue;
      let k = 0;
      for (const y of spec.neighbours[x]) {
        const gi = groupAt(y);
        if (gi < 0) continue;
        let dup = false;
        for (let j = 0; j < k; j++) if (gs[j] === gi) dup = true;
        if (!dup) gs[k++] = gi;
      }
      for (let i = 0; i < k; i++) {
        const v = value[gs[i]];
        let size = 1;
        let first = true;
        for (let j = 0; j < k; j++) {
          if (value[gs[j]] !== v) continue;
          if (j < i) first = false;
          size += sizeOf(gs[j]);
        }
        if (first && size > v) this.remove(x, v);
      }
    }

    for (let gi = 0; gi < groupsNear; gi++) {
      const v = value[gi];
      const size = sizeOf(gi);
      if (size >= v) continue;
      const left = v - size;
      const exitStamp = ++gsx.stamp;
      let exit = -1;
      let exits = 0;
      for (let i = start[gi]; i < start[gi + 1]; i++) {
        for (const y of spec.neighbours[cellsFlat[i]]) {
          if ((mark[y] === inGroup && groupOf[y] === gi) || gsx.exitMark[y] === exitStamp || !this.has(y, v)) continue;
          gsx.exitMark[y] = exitStamp;
          exit = y;
          exits++;
        }
      }
      if (exits === 0) return false;
      if (exits === 1 && !this.fixed(exit) && !this.set(exit, v)) return false;
      // Reach, as in applyGroups (exitMark is free again: its stamp moves on).
      const walk = ++gsx.stamp;
      const queue = gsx.queue;
      let qn = 0;
      for (let i = start[gi]; i < start[gi + 1]; i++) {
        const x = cellsFlat[i];
        gsx.exitMark[x] = walk;
        dist[x] = 0;
        queue[qn++] = x;
      }
      for (let qi = 0; qi < qn && qn < v; qi++) {
        const x = queue[qi];
        if (dist[x] >= left) continue;
        for (const y of spec.neighbours[x]) {
          if (gsx.exitMark[y] === walk || !this.has(y, v)) continue;
          gsx.exitMark[y] = walk;
          dist[y] = dist[x] + 1;
          queue[qn++] = y;
        }
      }
      if (qn < v) return false;
    }
    return true;
  }

  /** Room: a cell keeps v only if its connected v-capable area holds at least v cells. */
  private applyRoomAll(): boolean {
    const { scratch } = this.spec;
    for (let v = 1; v <= this.spec.maxValue; v++) {
      const stamp = ++scratch.stamp;
      for (let x = 0; x < this.spec.cellCount; x++) {
        if (scratch.big[x] !== stamp && this.has(x, v)) this.checkArea(x, v, stamp);
      }
    }
    return true;
  }

  /**
   * The room rule after removals: removing v from a cell can only shrink the v-capable
   * areas next to it, so only those are re-counted (and only until they reach v cells).
   * Every value is re-checked: in a wide open area the big values (an unclued room of
   * 20, 40 cells) are what's left to rule out, and only their areas shrinking does it.
   */
  private applyRoomLocal(): boolean {
    const { scratch } = this.spec;
    while (this.removed.length > 0) {
      const batch = this.removed;
      this.removed = [];
      // One stamp per value in this batch marks its known-big cells in the shared scratch.
      const stampOf = new Map<number, number>();
      for (let i = 0; i < batch.length; i += 2) {
        const x = batch[i];
        const v = batch[i + 1];
        let stamp = stampOf.get(v);
        if (stamp === undefined) stampOf.set(v, (stamp = ++scratch.stamp));
        for (const y of this.spec.neighbours[x]) if (scratch.big[y] !== stamp && this.has(y, v)) this.checkArea(y, v, stamp);
      }
    }
    return true;
  }

  /**
   * Count the v-capable area around `start` until it reaches v cells; if it is smaller,
   * no cell of it can take v. `big` marks cells already known to lie in an area of at
   * least v: reaching one means this area is that area, so big too. (A count stops at v
   * cells, so the rest of a big area stays unmarked and is recognised this way, never
   * mistaken for a separate small area. Small areas lose v, so they're never reached.)
   */
  private checkArea(start: number, v: number, stamp: number): void {
    const scratch = this.spec.scratch;
    const { big, area, inArea } = scratch;
    const mark = ++scratch.areaStamp;
    const w = word(v);
    const b = bitOf(v);
    const dom = this.dom;
    let n = 0;
    area[n++] = start;
    inArea[start] = mark;
    let isBig = false;
    for (let i = 0; i < n && n < v && !isBig; i++) {
      for (const y of this.spec.neighbours[area[i]]) {
        if (inArea[y] === mark || !(dom[2 * y + w] & b)) continue;
        if (big[y] === stamp) {
          isBig = true;
          break;
        }
        inArea[y] = mark;
        area[n++] = y;
      }
    }
    if (isBig || n >= v) {
      for (let i = 0; i < n; i++) big[area[i]] = stamp;
    } else {
      for (let i = 0; i < n; i++) this.remove(area[i], v);
    }
  }

  /** The rule on a full board: every equal-number group is its number's size; >1 room. */
  private checkFull(): boolean {
    const { spec } = this;
    const seen = new Uint8Array(spec.cellCount);
    let rooms = 0;
    for (let s = 0; s < spec.cellCount; s++) {
      if (seen[s]) continue;
      rooms++;
      const v = this.fixed(s);
      let size = 0;
      const stack = [s];
      seen[s] = 1;
      while (stack.length) {
        const x = stack.pop()!;
        size++;
        for (const y of spec.neighbours[x]) {
          if (!seen[y] && this.fixed(y) === v) {
            seen[y] = 1;
            stack.push(y);
          }
        }
      }
      if (size !== v) return false;
    }
    return rooms > 1;
  }
}
