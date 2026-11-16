import { Branch, ConstraintModel } from "../../types";

/**
 * Canonical Nuritwin representation, mirroring the frontend `NuritwinCanon`. `cells` is
 * rows x cols: 0 = empty, a positive integer = its room's twin size. `grids` are the room
 * walls: `h` is (rows-1) x cols (h[r][c] = 1 walls off (r,c) from (r+1,c)), `v` is
 * rows x (cols-1) (v[r][c] = 1 walls off (r,c) from (r,c+1)).
 */
export interface NuritwinCanon {
  cells: number[][];
  grids: { h: number[][]; v: number[][] };
}

const UNDECIDED = -1;
const WHITE = 0;
const SHADED = 1;

interface Room {
  cells: number[];
  /** The twin size from the room's number, or 0 when it has none (or conflicting ones). */
  clue: number;
  /** Two different numbers in one room: no answer can satisfy both. */
  conflicting: boolean;
}

interface Spec {
  rows: number;
  cols: number;
  cellCount: number;
  rooms: Room[];
  roomOf: Int32Array;
  /** Cell id -> orthogonal neighbours (any room). */
  neighbours: number[][];
  /** Cell id -> orthogonal neighbours in the same room. */
  roomNeighbours: number[][];
  /** Cell id -> top-left corners of the 2x2 blocks it lies in. */
  blocksOf: number[][];
}

function buildSpec(canon: NuritwinCanon): Spec {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  const cellCount = rows * cols;
  const wallBelow = (r: number, c: number) => canon.grids?.h?.[r]?.[c] === 1;
  const wallRight = (r: number, c: number) => canon.grids?.v?.[r]?.[c] === 1;

  const neighbours: number[][] = Array.from({ length: cellCount }, () => []);
  const roomNeighbours: number[][] = Array.from({ length: cellCount }, () => []);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = r * cols + c;
      if (c + 1 < cols) {
        neighbours[x].push(x + 1);
        neighbours[x + 1].push(x);
        if (!wallRight(r, c)) {
          roomNeighbours[x].push(x + 1);
          roomNeighbours[x + 1].push(x);
        }
      }
      if (r + 1 < rows) {
        neighbours[x].push(x + cols);
        neighbours[x + cols].push(x);
        if (!wallBelow(r, c)) {
          roomNeighbours[x].push(x + cols);
          roomNeighbours[x + cols].push(x);
        }
      }
    }
  }

  const roomOf = new Int32Array(cellCount).fill(-1);
  const rooms: Room[] = [];
  for (let start = 0; start < cellCount; start++) {
    if (roomOf[start] >= 0) continue;
    const id = rooms.length;
    const room: Room = { cells: [], clue: 0, conflicting: false };
    const stack = [start];
    roomOf[start] = id;
    while (stack.length) {
      const x = stack.pop()!;
      room.cells.push(x);
      const n = canon.cells[Math.floor(x / cols)][x % cols];
      if (n > 0) {
        if (room.clue > 0 && room.clue !== n) room.conflicting = true;
        room.clue = n;
      }
      for (const y of roomNeighbours[x]) {
        if (roomOf[y] < 0) {
          roomOf[y] = id;
          stack.push(y);
        }
      }
    }
    rooms.push(room);
  }

  const blocksOf: number[][] = Array.from({ length: cellCount }, () => []);
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const tl = r * cols + c;
      for (const x of [tl, tl + 1, tl + cols, tl + cols + 1]) blocksOf[x].push(tl);
    }
  }
  return { rows, cols, cellCount, rooms, roomOf, neighbours, roomNeighbours, blocksOf };
}

/** A connected group of cells inside one room, with the undecided cells bordering it there. */
interface Group {
  cells: number[];
  frontier: number[];
}

/**
 * Native CSP solver for Nuritwin (puzzle type 9). One variable per cell, shaded or white.
 * Rooms are reasoned about cell by cell, never by listing their shadings (which explodes
 * on a large room). Propagated to a fixpoint on every assignment:
 *
 *  - No 2x2 shaded block: three shaded cells of a 2x2 whiten the fourth.
 *  - Room rule (`applyRoom`), with the twin size N known from the room's number or from a
 *    group already closed off by white cells, or else bounded: at least the largest group,
 *    at most what the room's not-white pockets can fit twice (a 3-cell room: N = 1):
 *      - more than two closed groups, or closed groups of different sizes, is a dead end;
 *      - a group of the largest possible N is complete: its undecided room neighbours turn
 *        white, and a cell whose shading would merge groups past it stays white;
 *      - a pocket of not-white room cells smaller than the least N can hold no group;
 *      - the room holds 2N shaded cells (all-or-nothing when the count is tight);
 *      - once two complete groups exist, every other cell of the room is white;
 *      - shaded cells in more than two separate pockets is a dead end, and with exactly
 *        two, every other pocket turns white.
 *  - Connectivity (`applyConnectivity`): every shaded cell must reach every other through
 *    not-white cells; an undecided cell whose loss would split them is shaded.
 *
 * All are necessary conditions, so forcing is sound and the search stays complete;
 * `isSolved` re-checks every rule on the full board. Construction ends with failed-literal
 * probing over every cell. A small room whose shapes are forced (three cells in a row:
 * the two ends) settles through these rules plus probing, with no special case.
 */
export class NuritwinModel implements ConstraintModel<number[][]> {
  private constructor(
    private readonly spec: Spec,
    private readonly state: Int8Array,
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: NuritwinCanon): NuritwinModel {
    const spec = buildSpec(canon);
    const model = new NuritwinModel(spec, new Int8Array(spec.cellCount).fill(UNDECIDED), false);
    // Two groups that don't touch need at least three cells, and a numbered room 2N + 1.
    for (const room of spec.rooms) {
      const need = room.clue > 0 ? 2 * room.clue + 1 : 3;
      if (room.conflicting || room.cells.length < need) return model.toDead();
    }
    return model.propagate([], true).probe();
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
    // Branch next to shaded cells first: it grows or closes a group, which drives the room
    // rule hardest. Otherwise the first undecided cell.
    const { spec, state } = this;
    let fallback = -1;
    for (let x = 0; x < spec.cellCount; x++) {
      if (state[x] !== UNDECIDED) continue;
      if (fallback < 0) fallback = x;
      if (spec.roomNeighbours[x].some((y) => state[y] === SHADED)) return { id: x, candidates: [SHADED, WHITE] };
    }
    return fallback < 0 ? null : { id: fallback, candidates: [SHADED, WHITE] };
  }

  assign(id: number, value: number): ConstraintModel<number[][]> {
    return this.assignRaw(id, value);
  }

  private assignRaw(x: number, value: number): NuritwinModel {
    if (this.state[x] !== UNDECIDED) return this.state[x] === value ? this : this.toDead();
    const state = Int8Array.from(this.state);
    state[x] = value;
    return new NuritwinModel(this.spec, state, false).propagate([x], false);
  }

  solution(): number[][] {
    const { rows, cols } = this.spec;
    return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (this.state[r * cols + c] === SHADED ? 1 : 0)));
  }

  // -- propagation ------------------------------------------------------------

  /** Failed-literal probing over every cell, to a fixpoint. */
  private probe(): NuritwinModel {
    let m: NuritwinModel = this;
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

  private toDead(): NuritwinModel {
    return new NuritwinModel(this.spec, this.state, true);
  }

  /**
   * Run every rule to a fixpoint, mutating `this.state` (the caller copied it). `changed`
   * lists cells just decided; `all` checks every room first.
   */
  private propagate(changed: number[], all: boolean): NuritwinModel {
    const { spec, state } = this;
    const queue = [...changed];
    let qi = 0;
    const dirty = new Set<number>(all ? spec.rooms.map((_, i) => i) : []);
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
        dirty.add(spec.roomOf[x]);
        // A shaded cell can change what a neighbouring room's groups may do only through
        // the cell itself, so its own room is enough; 2x2 blocks span rooms.
        if (state[x] === SHADED && !this.apply2x2(x, force)) return this.toDead();
      }
      if (dirty.size > 0) {
        const rooms = [...dirty];
        dirty.clear();
        for (const id of rooms) if (!this.applyRoom(spec.rooms[id], force)) return this.toDead();
        if (qi < queue.length) continue;
      }
      if (!this.applyConnectivity(force)) return this.toDead();
      if (qi < queue.length) continue;
      return this;
    }
  }

  /** No 2x2 shaded block: three shaded cells of a block whiten the fourth. */
  private apply2x2(x: number, force: (x: number, v: number) => boolean): boolean {
    const { spec, state } = this;
    for (const tl of spec.blocksOf[x]) {
      const block = [tl, tl + 1, tl + spec.cols, tl + spec.cols + 1];
      let shaded = 0;
      let open = -1;
      let openCount = 0;
      for (const y of block) {
        if (state[y] === SHADED) shaded++;
        else if (state[y] === UNDECIDED) {
          open = y;
          openCount++;
        }
      }
      if (shaded === 4) return false;
      if (shaded === 3 && openCount === 1 && !force(open, WHITE)) return false;
    }
    return true;
  }

  /** Connected groups of room cells passing `keep`, with their undecided room frontier. */
  private groups(room: Room, keep: (x: number) => boolean): Group[] {
    const { spec, state } = this;
    const seen = new Set<number>();
    const out: Group[] = [];
    for (const start of room.cells) {
      if (seen.has(start) || !keep(start)) continue;
      const g: Group = { cells: [], frontier: [] };
      const front = new Set<number>();
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const x = stack.pop()!;
        g.cells.push(x);
        for (const y of spec.roomNeighbours[x]) {
          if (keep(y)) {
            if (!seen.has(y)) {
              seen.add(y);
              stack.push(y);
            }
          } else if (state[y] === UNDECIDED) {
            front.add(y);
          }
        }
      }
      g.frontier = [...front];
      out.push(g);
    }
    return out;
  }

  /** The room rule; see the class comment. Returns false on a contradiction. */
  private applyRoom(room: Room, force: (x: number, v: number) => boolean): boolean {
    const { spec, state } = this;
    const shadedGroups = this.groups(room, (x) => state[x] === SHADED);
    const closed = shadedGroups.filter((g) => g.frontier.length === 0);
    if (closed.length > 2) return false;

    // Pockets: connected not-white room cells. Shaded cells in more than two pockets can't
    // be just two groups.
    const pockets = this.groups(room, (x) => state[x] !== WHITE);
    const withShade = pockets.filter((p) => p.cells.some((x) => state[x] === SHADED));
    if (withShade.length > 2) return false;
    if (withShade.length === 2) {
      for (const p of pockets) if (!withShade.includes(p)) for (const x of p.cells) if (!force(x, WHITE)) return false;
    }
    if (closed.length === 2) {
      if (closed[0].cells.length !== closed[1].cells.length) return false;
      if (room.clue > 0 && closed[0].cells.length !== room.clue) return false;
      for (const x of room.cells) if (state[x] === UNDECIDED && !force(x, WHITE)) return false;
      return true;
    }

    // The twin size n lies in [lo, hi]: the room's number fixes it; otherwise a closed
    // group fixes it, the largest group bounds it from below, and the pockets bound it
    // from above (two groups need 2n + 1 cells in one pocket, or n in each of two).
    let lo: number;
    let hi: number;
    if (room.clue > 0) {
      lo = hi = room.clue;
    } else {
      lo = 1;
      for (const g of shadedGroups) lo = Math.max(lo, g.cells.length);
      const sizes = pockets.map((p) => p.cells.length).sort((a, b) => b - a);
      hi = Math.max(Math.floor(((sizes[0] ?? 0) - 1) / 2), sizes[1] ?? 0);
    }
    for (const g of closed) {
      const size = g.cells.length;
      if (size < lo || size > hi) return false;
      lo = hi = size;
    }
    if (lo > hi) return false;

    // A group of hi cells is complete, and no cell may grow a group past hi.
    const groupOf = new Map<number, Group>();
    for (const g of shadedGroups) {
      if (g.cells.length > hi) return false;
      for (const x of g.cells) groupOf.set(x, g);
      if (g.cells.length === hi) for (const y of g.frontier) if (!force(y, WHITE)) return false;
    }
    for (const x of room.cells) {
      if (state[x] !== UNDECIDED) continue;
      const joined = new Set<Group>();
      for (const y of spec.roomNeighbours[x]) {
        const g = groupOf.get(y);
        if (g) joined.add(g);
      }
      let size = 1;
      for (const g of joined) size += g.cells.length;
      if (size > hi && !force(x, WHITE)) return false;
    }
    // A pocket too small for a group of lo cells holds none.
    for (const p of pockets) {
      if (p.cells.length >= lo) continue;
      for (const x of p.cells) {
        if (state[x] === SHADED) return false;
        if (state[x] === UNDECIDED && !force(x, WHITE)) return false;
      }
    }
    // Between 2lo and 2hi shaded cells; exactly 2n once n is known.
    let shaded = 0;
    let open = 0;
    for (const x of room.cells) {
      if (state[x] === SHADED) shaded++;
      else if (state[x] === UNDECIDED) open++;
    }
    if (shaded > 2 * hi || shaded + open < 2 * lo) return false;
    if (open > 0 && shaded === 2 * hi) {
      for (const x of room.cells) if (state[x] === UNDECIDED && !force(x, WHITE)) return false;
    } else if (open > 0 && shaded + open === 2 * lo) {
      for (const x of room.cells) if (state[x] === UNDECIDED && !force(x, SHADED)) return false;
    }
    return true;
  }

  /**
   * Shaded connectivity over not-white cells: every shaded cell is reachable from every
   * other, and an undecided cell that is the only link between shaded cells (an
   * articulation point with shaded cells on both sides) is shaded. One iterative Tarjan
   * pass from a shaded root.
   */
  private applyConnectivity(force: (x: number, v: number) => boolean): boolean {
    const { spec, state } = this;
    const n = spec.cellCount;
    let total = 0;
    let root = -1;
    for (let x = 0; x < n; x++) {
      if (state[x] === SHADED) {
        total++;
        if (root < 0) root = x;
      }
    }
    if (total <= 1) return true;

    const disc = new Int32Array(n).fill(-1);
    const low = new Int32Array(n);
    const below = new Int32Array(n); // shaded cells in the DFS subtree
    const parent = new Int32Array(n).fill(-1);
    const iter = new Int32Array(n);
    const stack = new Int32Array(n);
    const cut: number[] = [];
    let sp = 0;
    let time = 0;
    disc[root] = low[root] = time++;
    below[root] = 1;
    stack[sp++] = root;
    while (sp > 0) {
      const x = stack[sp - 1];
      const nb = spec.neighbours[x];
      if (iter[x] < nb.length) {
        const y = nb[iter[x]++];
        if (state[y] === WHITE) continue;
        if (disc[y] < 0) {
          disc[y] = low[y] = time++;
          below[y] = state[y] === SHADED ? 1 : 0;
          parent[y] = x;
          stack[sp++] = y;
        } else if (y !== parent[x] && disc[y] < low[x]) {
          low[x] = disc[y];
        }
        continue;
      }
      sp--;
      if (sp > 0) {
        const p = stack[sp - 1];
        if (low[x] < low[p]) low[p] = low[x];
        below[p] += below[x];
        // x's subtree hangs off p alone: if it holds shaded cells and so does the rest of
        // the board, p must be shaded to join them.
        if (low[x] >= disc[p] && below[x] > 0 && below[x] < total && state[p] === UNDECIDED) cut.push(p);
      }
    }
    if (below[root] !== total) return false;
    for (const x of cut) if (!force(x, SHADED)) return false;
    return true;
  }

  // -- leaf check ---------------------------------------------------------------

  /** Every rule on a fully decided board. */
  private checkFull(): boolean {
    const { spec, state } = this;
    for (const room of spec.rooms) {
      const gs = this.groups(room, (x) => state[x] === SHADED);
      if (gs.length !== 2 || gs[0].cells.length !== gs[1].cells.length) return false;
      if (room.clue > 0 && gs[0].cells.length !== room.clue) return false;
    }
    for (let x = 0; x < spec.cellCount; x++) {
      for (const tl of spec.blocksOf[x]) {
        if ([tl, tl + 1, tl + spec.cols, tl + spec.cols + 1].every((y) => state[y] === SHADED)) return false;
      }
    }
    // One shaded region across the board.
    const start = state.indexOf(SHADED);
    if (start < 0) return false;
    const seen = new Uint8Array(spec.cellCount);
    seen[start] = 1;
    const stack = [start];
    let reached = 1;
    while (stack.length) {
      const x = stack.pop()!;
      for (const y of spec.neighbours[x]) {
        if (!seen[y] && state[y] === SHADED) {
          seen[y] = 1;
          reached++;
          stack.push(y);
        }
      }
    }
    let total = 0;
    for (let x = 0; x < spec.cellCount; x++) if (state[x] === SHADED) total++;
    return reached === total;
  }
}
