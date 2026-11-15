import { Branch, ConstraintModel } from "../../types";

/**
 * Canonical Ripple Effect representation, mirroring the frontend `RippleEffectCanon`.
 * `cells` is rows x cols: 0 = empty, a positive integer = a given number. `edges` are the
 * room walls between cells: `h` is (rows-1) x cols (h[r][c] = 1 walls off (r,c) from
 * (r+1,c)), `v` is rows x (cols-1) (v[r][c] = 1 walls off (r,c) from (r,c+1)).
 */
export interface RippleEffectCanon {
  cells: number[][];
  edges: { h: number[][]; v: number[][] };
}

/** Values are bits of a domain mask (bit k-1 = value k), so a room holds at most 31 cells. */
const MAX_ROOM = 31;

interface Spec {
  rows: number;
  cols: number;
  cellCount: number;
  /** Room id -> its cells. */
  rooms: number[][];
  roomOf: Int32Array;
  givens: number[][];
}

function buildSpec(canon: RippleEffectCanon): Spec {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  const cellCount = rows * cols;
  const wallBelow = (r: number, c: number) => canon.edges?.h?.[r]?.[c] === 1;
  const wallRight = (r: number, c: number) => canon.edges?.v?.[r]?.[c] === 1;

  // Rooms are the connected components with the walls as barriers.
  const roomOf = new Int32Array(cellCount).fill(-1);
  const rooms: number[][] = [];
  for (let start = 0; start < cellCount; start++) {
    if (roomOf[start] >= 0) continue;
    const id = rooms.length;
    const room: number[] = [];
    const stack = [start];
    roomOf[start] = id;
    while (stack.length) {
      const x = stack.pop()!;
      room.push(x);
      const r = Math.floor(x / cols);
      const c = x % cols;
      const next: number[] = [];
      if (c + 1 < cols && !wallRight(r, c)) next.push(x + 1);
      if (c > 0 && !wallRight(r, c - 1)) next.push(x - 1);
      if (r + 1 < rows && !wallBelow(r, c)) next.push(x + cols);
      if (r > 0 && !wallBelow(r - 1, c)) next.push(x - cols);
      for (const y of next) {
        if (roomOf[y] < 0) {
          roomOf[y] = id;
          stack.push(y);
        }
      }
    }
    rooms.push(room);
  }
  return { rows, cols, cellCount, rooms, roomOf, givens: canon.cells };
}

const bit = (k: number) => 1 << (k - 1);
const popcount = (m: number) => {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
};
/** The single value of a one-bit mask. */
const valueOf = (m: number) => 31 - Math.clz32(m) + 1;

/**
 * Native CSP solver for Ripple Effect (puzzle type 25). Each cell's domain is 1..(its
 * room's size), as a bit mask. Propagated to a fixpoint on every assignment:
 *
 *  - Room rule: a room of N cells holds 1..N once each, so a placed value leaves the
 *    room's other cells, and a value with one possible cell left in the room goes there.
 *  - Ripple rule: a placed K removes K from every cell within K steps of it in its row
 *    and column (two equal K's need at least K cells between them).
 *
 * Construction ends with failed-literal probing over every (cell, candidate) pair, as in
 * the loop solvers, so deductions that need a step of lookahead (a value whose room
 * positions all ripple onto the same outside cell) are made before search.
 */
export class RippleEffectModel implements ConstraintModel<number[][]> {
  private constructor(
    private readonly spec: Spec,
    private readonly dom: Int32Array,
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: RippleEffectCanon): RippleEffectModel {
    const spec = buildSpec(canon);
    const dom = new Int32Array(spec.cellCount);
    const model = new RippleEffectModel(spec, dom, false);
    if (spec.cellCount === 0 || spec.rooms.some((room) => room.length > MAX_ROOM)) return model.toDead();
    for (const room of spec.rooms) for (const x of room) dom[x] = (1 << room.length) - 1;
    const seed: number[] = [];
    for (let x = 0; x < spec.cellCount; x++) {
      const g = spec.givens[Math.floor(x / spec.cols)][x % spec.cols];
      if (g > 0) {
        if (!(dom[x] & bit(g))) return model.toDead(); // a given larger than its room
        dom[x] = bit(g);
      }
      // Every cell already settled spreads its ripple: givens, and one-cell rooms (a 1).
      if (popcount(dom[x]) === 1) seed.push(x);
    }
    return model.propagate(seed, true).probe();
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    if (this.dead) return false;
    for (let x = 0; x < this.spec.cellCount; x++) if (popcount(this.dom[x]) !== 1) return false;
    return true; // every rule is enforced on each placement, so a full board is valid
  }

  selectBranch(): Branch | null {
    let best = -1;
    let bestSize = Infinity;
    for (let x = 0; x < this.spec.cellCount; x++) {
      const n = popcount(this.dom[x]);
      if (n > 1 && n < bestSize) {
        bestSize = n;
        best = x;
        if (n === 2) break;
      }
    }
    if (best === -1) return null;
    const candidates: number[] = [];
    for (let m = this.dom[best]; m; m &= m - 1) candidates.push(valueOf(m & -m));
    return { id: best, candidates };
  }

  assign(id: number, value: number): ConstraintModel<number[][]> {
    return this.assignRaw(id, value);
  }

  private assignRaw(x: number, value: number): RippleEffectModel {
    if (!(this.dom[x] & bit(value))) return this.toDead();
    if (this.dom[x] === bit(value)) return this;
    const dom = Int32Array.from(this.dom);
    dom[x] = bit(value);
    return new RippleEffectModel(this.spec, dom, false).propagate([x], false);
  }

  solution(): number[][] {
    const { rows, cols } = this.spec;
    return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => valueOf(this.dom[r * cols + c])));
  }

  // -- propagation ------------------------------------------------------------

  /** Failed-literal probing over every (cell, candidate), to a fixpoint. */
  private probe(): RippleEffectModel {
    let m: RippleEffectModel = this;
    for (let changed = true; changed && !m.dead; ) {
      changed = false;
      for (let x = 0; x < m.spec.cellCount && !m.dead; x++) {
        if (popcount(m.dom[x]) < 2) continue;
        for (let rest = m.dom[x]; rest && !m.dead; rest &= rest - 1) {
          const k = valueOf(rest & -rest);
          if (!(m.dom[x] & bit(k)) || !m.assignRaw(x, k).dead) continue;
          m = m.without(x, k);
          changed = true;
        }
      }
    }
    return m;
  }

  /** A copy with value k removed from cell x, propagated. */
  private without(x: number, k: number): RippleEffectModel {
    const dom = Int32Array.from(this.dom);
    dom[x] &= ~bit(k);
    if (dom[x] === 0) return new RippleEffectModel(this.spec, dom, true);
    const m = new RippleEffectModel(this.spec, dom, false);
    return m.propagate(popcount(dom[x]) === 1 ? [x] : [], false, [this.spec.roomOf[x]]);
  }

  private toDead(): RippleEffectModel {
    return new RippleEffectModel(this.spec, this.dom, true);
  }

  /**
   * Propagate placements to a fixpoint, mutating `this.dom` (the caller copied it).
   * `placed` lists cells that just became single-valued; `rooms` lists rooms to check for
   * hidden singles even without a placement (after a plain elimination); `all` checks
   * every room once first.
   */
  private propagate(placed: number[], all: boolean, rooms: number[] = []): RippleEffectModel {
    const { spec, dom } = this;
    const { cols, rows } = spec;
    const queue = [...placed];
    const dirtyRooms = new Set<number>(all ? spec.rooms.map((_, i) => i) : rooms);
    let qi = 0;

    // Remove k from cell y; a cell left with one value joins the queue.
    const remove = (y: number, k: number): boolean => {
      if (!(dom[y] & bit(k))) return true;
      dom[y] &= ~bit(k);
      if (dom[y] === 0) return false;
      dirtyRooms.add(spec.roomOf[y]);
      if (popcount(dom[y]) === 1) queue.push(y);
      return true;
    };

    for (;;) {
      while (qi < queue.length) {
        const x = queue[qi++];
        const k = valueOf(dom[x]);
        dirtyRooms.add(spec.roomOf[x]);
        for (const y of spec.rooms[spec.roomOf[x]]) if (y !== x && !remove(y, k)) return this.toDead();
        const r = Math.floor(x / cols);
        const c = x % cols;
        for (let d = 1; d <= k; d++) {
          if (c - d >= 0 && !remove(x - d, k)) return this.toDead();
          if (c + d < cols && !remove(x + d, k)) return this.toDead();
          if (r - d >= 0 && !remove(x - d * cols, k)) return this.toDead();
          if (r + d < rows && !remove(x + d * cols, k)) return this.toDead();
        }
      }
      // Hidden singles: each value 1..N has a cell in its room.
      const roomsNow = [...dirtyRooms];
      dirtyRooms.clear();
      for (const id of roomsNow) {
        const room = spec.rooms[id];
        for (let k = 1; k <= room.length; k++) {
          let where = -1;
          let count = 0;
          for (const y of room) {
            if (dom[y] & bit(k)) {
              where = y;
              if (++count > 1) break;
            }
          }
          if (count === 0) return this.toDead();
          if (count === 1 && dom[where] !== bit(k)) {
            dom[where] = bit(k);
            queue.push(where);
          }
        }
      }
      if (qi === queue.length && dirtyRooms.size === 0) return this;
    }
  }
}
