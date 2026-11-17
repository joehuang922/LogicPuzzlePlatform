import { Branch, ConstraintModel } from "../../types";
import { connectivityCuts } from "../shading/connectivity";

/**
 * Canonical Heyawake representation, mirroring the frontend `HeyawakeCanon`: rectangular
 * rooms tiling a `height` x `width` grid, each with an optional number of shaded cells.
 */
export interface HeyawakeCanon {
  width: number;
  height: number;
  rooms: { r: number; c: number; w: number; h: number; clue: number | null }[];
}

const UNDECIDED = -1;
const WHITE = 0;
const SHADED = 1;

interface Room {
  cells: number[];
  clue: number | null;
}

interface Spec {
  rows: number;
  cols: number;
  cellCount: number;
  rooms: Room[];
  roomOf: Int32Array;
  neighbours: number[][];
  /**
   * The "no white run through three rooms" rule as windows that each need a shaded cell:
   * along every row and column, a room's stretch of the line together with the cell just
   * before it and the cell just after it (both in neighbouring rooms).
   */
  windows: number[][];
  windowsOf: number[][];
}

function buildSpec(canon: HeyawakeCanon): Spec {
  const rows = canon.height;
  const cols = canon.width;
  const cellCount = rows * cols;
  const roomOf = new Int32Array(cellCount).fill(-1);
  const rooms: Room[] = [];
  for (const rm of canon.rooms ?? []) {
    const room: Room = { cells: [], clue: rm.clue ?? null };
    for (let r = rm.r; r < rm.r + rm.h; r++) {
      for (let c = rm.c; c < rm.c + rm.w; c++) {
        if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
        const x = r * cols + c;
        if (roomOf[x] >= 0) continue; // overlap: a format error the API refuses; keep the first
        roomOf[x] = rooms.length;
        room.cells.push(x);
      }
    }
    rooms.push(room);
  }
  // Cells no room covers (another format error) each form a room of their own.
  for (let x = 0; x < cellCount; x++) {
    if (roomOf[x] < 0) {
      roomOf[x] = rooms.length;
      rooms.push({ cells: [x], clue: null });
    }
  }

  const neighbours: number[][] = Array.from({ length: cellCount }, () => []);
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
    }
  }

  // Each line split into room stretches; a stretch with a stretch on both sides gives a
  // window. (A run through three rooms covers some middle stretch plus one cell each side.)
  const windows: number[][] = [];
  const lines: number[][] = [];
  for (let r = 0; r < rows; r++) lines.push(Array.from({ length: cols }, (_, c) => r * cols + c));
  for (let c = 0; c < cols; c++) lines.push(Array.from({ length: rows }, (_, r) => r * cols + c));
  for (const line of lines) {
    const stretches: number[][] = [];
    for (const x of line) {
      const last = stretches[stretches.length - 1];
      if (last && roomOf[last[0]] === roomOf[x]) last.push(x);
      else stretches.push([x]);
    }
    for (let i = 1; i + 1 < stretches.length; i++) {
      const prev = stretches[i - 1];
      windows.push([prev[prev.length - 1], ...stretches[i], stretches[i + 1][0]]);
    }
  }
  const windowsOf: number[][] = Array.from({ length: cellCount }, () => []);
  windows.forEach((w, i) => w.forEach((x) => windowsOf[x].push(i)));
  return { rows, cols, cellCount, rooms, roomOf, neighbours, windows, windowsOf };
}

/**
 * Native CSP solver for Heyawake (puzzle type 21). One variable per cell, shaded or white.
 * Propagated to a fixpoint on every assignment:
 *
 *  - Shaded cells never touch: a shaded cell whitens its neighbours.
 *  - Room numbers: a numbered room holds exactly that many shaded cells (all-or-nothing
 *    when the count is tight).
 *  - No white run through three rooms: each window (see `Spec.windows`) needs a shaded
 *    cell, so a window whose other cells are all white shades its last one.
 *  - White connectivity: an undecided cell that alone links white cells is white
 *    (`connectivityCuts`).
 *
 * All are necessary conditions, so forcing is sound and the search stays complete;
 * `isSolved` re-checks every rule on the full board. Failed-literal probing over every
 * cell runs at construction and after every search assignment.
 */
export class HeyawakeModel implements ConstraintModel<number[][]> {
  private constructor(
    private readonly spec: Spec,
    private readonly state: Int8Array,
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: HeyawakeCanon): HeyawakeModel {
    const spec = buildSpec(canon);
    const model = new HeyawakeModel(spec, new Int8Array(spec.cellCount).fill(UNDECIDED), false);
    if (spec.cellCount === 0) return model.toDead();
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
    // The undecided cell in the most windows still lacking a shaded cell: shading it
    // satisfies them all, whitening it tightens them. Shaded first.
    const { spec, state } = this;
    let best = -1;
    let bestScore = -1;
    for (let x = 0; x < spec.cellCount; x++) {
      if (state[x] !== UNDECIDED) continue;
      let score = 0;
      for (const w of spec.windowsOf[x]) if (!spec.windows[w].some((y) => state[y] === SHADED)) score++;
      if (spec.rooms[spec.roomOf[x]].clue != null) score++;
      if (score > bestScore) {
        bestScore = score;
        best = x;
      }
    }
    return best < 0 ? null : { id: best, candidates: [SHADED, WHITE] };
  }

  assign(id: number, value: number): ConstraintModel<number[][]> {
    // Probe at every search node too: on the 17x17 medium sample the uniqueness proof
    // drops from 2094 nodes to 16, and runs faster, since a giant board's search grows
    // exponentially while a probe pass is only polynomial.
    const m = this.assignRaw(id, value);
    return m.dead ? m : m.probe();
  }

  private assignRaw(x: number, value: number): HeyawakeModel {
    if (this.state[x] !== UNDECIDED) return this.state[x] === value ? this : this.toDead();
    const state = Int8Array.from(this.state);
    state[x] = value;
    return new HeyawakeModel(this.spec, state, false).propagate([x], false);
  }

  solution(): number[][] {
    const { rows, cols } = this.spec;
    return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (this.state[r * cols + c] === SHADED ? 1 : 0)));
  }

  /** Failed-literal probing over every cell, to a fixpoint. */
  private probe(): HeyawakeModel {
    let m: HeyawakeModel = this;
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

  private toDead(): HeyawakeModel {
    return new HeyawakeModel(this.spec, this.state, true);
  }

  /**
   * Run every rule to a fixpoint, mutating `this.state` (the caller copied it). `all`
   * checks every room and window first (a room numbered 0, a window of one open cell).
   */
  private propagate(changed: number[], all: boolean): HeyawakeModel {
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
    if (all) {
      for (const room of spec.rooms) if (!this.applyRoom(room, force)) return this.toDead();
      for (let w = 0; w < spec.windows.length; w++) if (!this.applyWindow(w, force)) return this.toDead();
    }

    for (;;) {
      while (qi < queue.length) {
        const x = queue[qi++];
        if (state[x] === SHADED) {
          for (const y of spec.neighbours[x]) if (!force(y, WHITE)) return this.toDead();
        } else {
          for (const w of spec.windowsOf[x]) if (!this.applyWindow(w, force)) return this.toDead();
        }
        if (!this.applyRoom(spec.rooms[spec.roomOf[x]], force)) return this.toDead();
      }
      const cuts = connectivityCuts(spec.neighbours, state, WHITE);
      if (cuts === null) return this.toDead();
      for (const x of cuts) if (!force(x, WHITE)) return this.toDead();
      if (qi < queue.length) continue;
      return this;
    }
  }

  private applyRoom(room: Room, force: (x: number, v: number) => boolean): boolean {
    if (room.clue == null) return true;
    const { state } = this;
    let shaded = 0;
    let open = 0;
    for (const x of room.cells) {
      if (state[x] === SHADED) shaded++;
      else if (state[x] === UNDECIDED) open++;
    }
    if (shaded > room.clue || shaded + open < room.clue) return false;
    if (open > 0 && (shaded === room.clue || shaded + open === room.clue)) {
      const v = shaded === room.clue ? WHITE : SHADED;
      for (const x of room.cells) if (state[x] === UNDECIDED && !force(x, v)) return false;
    }
    return true;
  }

  /** A window needs a shaded cell: none possible is a dead end, one left is forced. */
  private applyWindow(w: number, force: (x: number, v: number) => boolean): boolean {
    const { state } = this;
    let open = -1;
    let opens = 0;
    for (const x of this.spec.windows[w]) {
      if (state[x] === SHADED) return true;
      if (state[x] === UNDECIDED) {
        open = x;
        opens++;
      }
    }
    if (opens === 0) return false;
    if (opens === 1 && !force(open, SHADED)) return false;
    return true;
  }

  /** Every rule on a fully decided board. */
  private checkFull(): boolean {
    const { spec, state } = this;
    for (let x = 0; x < spec.cellCount; x++) {
      if (state[x] === SHADED && spec.neighbours[x].some((y) => state[y] === SHADED)) return false;
    }
    for (const room of spec.rooms) {
      if (room.clue != null && room.cells.filter((x) => state[x] === SHADED).length !== room.clue) return false;
    }
    if (spec.windows.some((w) => !w.some((x) => state[x] === SHADED))) return false;
    return connectivityCuts(spec.neighbours, state, WHITE) !== null;
  }
}
