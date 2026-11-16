import { Branch, ConstraintModel } from "../../types";

/**
 * Canonical Norinori representation, mirroring the frontend `NorinoriCanon`: only the room
 * walls. `h` is (rows-1) x cols (h[r][c] = 1 walls off (r,c) from (r+1,c)), `v` is
 * rows x (cols-1) (v[r][c] = 1 walls off (r,c) from (r,c+1)).
 */
export interface NorinoriCanon {
  grids: { h: number[][]; v: number[][] };
}

const UNDECIDED = -1;
const WHITE = 0;
const SHADED = 1;

interface Spec {
  rows: number;
  cols: number;
  cellCount: number;
  rooms: number[][];
  roomOf: Int32Array;
  /** Cell id -> orthogonal neighbours (dominoes may cross walls). */
  neighbours: number[][];
}

function buildSpec(canon: NorinoriCanon): Spec {
  const h = canon.grids?.h ?? [];
  const v = canon.grids?.v ?? [];
  const rows = v.length || h.length + 1;
  const cols = (v[0]?.length ?? (h[0]?.length ?? 1) - 1) + 1;
  const cellCount = rows * cols;
  const neighbours: number[][] = Array.from({ length: cellCount }, () => []);
  const roomLinks: number[][] = Array.from({ length: cellCount }, () => []);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = r * cols + c;
      if (c + 1 < cols) {
        neighbours[x].push(x + 1);
        neighbours[x + 1].push(x);
        if (v[r]?.[c] !== 1) {
          roomLinks[x].push(x + 1);
          roomLinks[x + 1].push(x);
        }
      }
      if (r + 1 < rows) {
        neighbours[x].push(x + cols);
        neighbours[x + cols].push(x);
        if (h[r]?.[c] !== 1) {
          roomLinks[x].push(x + cols);
          roomLinks[x + cols].push(x);
        }
      }
    }
  }
  const roomOf = new Int32Array(cellCount).fill(-1);
  const rooms: number[][] = [];
  for (let s = 0; s < cellCount; s++) {
    if (roomOf[s] >= 0) continue;
    const id = rooms.length;
    const room: number[] = [];
    const stack = [s];
    roomOf[s] = id;
    while (stack.length) {
      const x = stack.pop()!;
      room.push(x);
      for (const y of roomLinks[x]) {
        if (roomOf[y] < 0) {
          roomOf[y] = id;
          stack.push(y);
        }
      }
    }
    rooms.push(room);
  }
  return { rows, cols, cellCount, rooms, roomOf, neighbours };
}

/**
 * Native CSP solver for Norinori (puzzle type 23). One variable per cell, shaded or white.
 * Propagated to a fixpoint on every assignment:
 *
 *  - Room rule: exactly two shaded cells per room (all-or-nothing when the count is tight).
 *  - Domino rule: a shaded cell has exactly one shaded neighbour, so once it has one its
 *    other neighbours turn white, and with a single candidate left that one is shaded; an
 *    undecided cell that would touch two shaded cells, or whose neighbours are all white,
 *    stays white.
 *
 * Both rules are local and exact on a full board, so `isSolved` only needs every cell
 * decided. Construction ends with failed-literal probing over every cell.
 */
export class NorinoriModel implements ConstraintModel<number[][]> {
  private constructor(
    private readonly spec: Spec,
    private readonly state: Int8Array,
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: NorinoriCanon): NorinoriModel {
    const spec = buildSpec(canon);
    const model = new NorinoriModel(spec, new Int8Array(spec.cellCount).fill(UNDECIDED), false);
    if (spec.cellCount === 0 || spec.rooms.some((room) => room.length < 2)) return model.toDead();
    const all: number[] = [];
    for (let x = 0; x < spec.cellCount; x++) all.push(x);
    return model.propagate(all, true).probe();
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    if (this.dead) return false;
    for (let x = 0; x < this.spec.cellCount; x++) if (this.state[x] === UNDECIDED) return false;
    return true;
  }

  selectBranch(): Branch | null {
    // The cell in the room with the fewest undecided cells left.
    const { spec, state } = this;
    let best = -1;
    let bestOpen = Infinity;
    for (const room of spec.rooms) {
      let open = 0;
      let first = -1;
      for (const x of room) {
        if (state[x] === UNDECIDED) {
          open++;
          if (first < 0) first = x;
        }
      }
      if (open > 0 && open < bestOpen) {
        bestOpen = open;
        best = first;
      }
    }
    return best < 0 ? null : { id: best, candidates: [SHADED, WHITE] };
  }

  assign(id: number, value: number): ConstraintModel<number[][]> {
    return this.assignRaw(id, value);
  }

  private assignRaw(x: number, value: number): NorinoriModel {
    if (this.state[x] !== UNDECIDED) return this.state[x] === value ? this : this.toDead();
    const state = Int8Array.from(this.state);
    state[x] = value;
    return new NorinoriModel(this.spec, state, false).propagate([x], false);
  }

  solution(): number[][] {
    const { rows, cols } = this.spec;
    return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (this.state[r * cols + c] === SHADED ? 1 : 0)));
  }

  /** Failed-literal probing over every cell, to a fixpoint. */
  private probe(): NorinoriModel {
    let m: NorinoriModel = this;
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

  private toDead(): NorinoriModel {
    return new NorinoriModel(this.spec, this.state, true);
  }

  /**
   * Run both rules to a fixpoint, mutating `this.state` (the caller copied it). `changed`
   * lists cells just decided; each one re-checks its room and its neighbourhood.
   */
  private propagate(changed: number[], all: boolean): NorinoriModel {
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
    if (all) for (const room of spec.rooms) if (!this.applyRoom(room, force)) return this.toDead();
    while (qi < queue.length) {
      const x = queue[qi++];
      if (!this.applyRoom(spec.rooms[spec.roomOf[x]], force)) return this.toDead();
      // The cell itself and its neighbours may now be settled by the domino rule.
      if (!this.applyCell(x, force)) return this.toDead();
      for (const y of spec.neighbours[x]) if (!this.applyCell(y, force)) return this.toDead();
    }
    return this;
  }

  private applyRoom(room: number[], force: (x: number, v: number) => boolean): boolean {
    const { state } = this;
    let shaded = 0;
    let open = 0;
    for (const x of room) {
      if (state[x] === SHADED) shaded++;
      else if (state[x] === UNDECIDED) open++;
    }
    if (shaded > 2 || shaded + open < 2) return false;
    if (open > 0 && (shaded === 2 || shaded + open === 2)) {
      const v = shaded === 2 ? WHITE : SHADED;
      for (const x of room) if (state[x] === UNDECIDED && !force(x, v)) return false;
    }
    return true;
  }

  /** The domino rule at cell x. */
  private applyCell(x: number, force: (x: number, v: number) => boolean): boolean {
    const { spec, state } = this;
    let shaded = 0;
    let open = 0;
    for (const y of spec.neighbours[x]) {
      if (state[y] === SHADED) shaded++;
      else if (state[y] === UNDECIDED) open++;
    }
    if (state[x] === SHADED) {
      if (shaded > 1 || shaded + open === 0) return false;
      if (shaded === 1) {
        for (const y of spec.neighbours[x]) if (state[y] === UNDECIDED && !force(y, WHITE)) return false;
      } else if (open === 1) {
        for (const y of spec.neighbours[x]) if (state[y] === UNDECIDED && !force(y, SHADED)) return false;
      }
    } else if (state[x] === UNDECIDED) {
      // Shading x would give it two shaded neighbours, or none possible.
      if ((shaded > 1 || shaded + open === 0) && !force(x, WHITE)) return false;
      // Shading x next to a shaded cell that already has its partner breaks that domino.
      for (const y of spec.neighbours[x]) {
        if (state[y] !== SHADED || state[x] !== UNDECIDED) continue;
        if (spec.neighbours[y].some((z) => z !== x && state[z] === SHADED) && !force(x, WHITE)) return false;
      }
    }
    return true;
  }
}
