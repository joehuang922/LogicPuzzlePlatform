import { Branch, ConstraintModel } from "../../types";

/**
 * Canonical Akari representation, mirroring the frontend `AkariCanon`: rows x cols, -1 an
 * open (white) cell, 0-4 a wall numbered with its bulb count, 5 a wall without a number.
 */
export interface AkariCanon {
  cells: number[][];
}

const OPEN = -1;
const PLAIN_WALL = 5;

const UNDECIDED = -1;
const EMPTY = 0;
const BULB = 1;

interface Spec {
  rows: number;
  cols: number;
  cellCount: number;
  isOpen: Uint8Array;
  /** Open cell -> the other open cells it sees (its row and column stretches). */
  sees: number[][];
  /** Open cell -> the cells that can light it: itself and every cell it sees. */
  lighters: number[][];
  /** Numbered walls: their count and open neighbours. */
  walls: { count: number; cells: number[] }[];
  /** Open cell -> the numbered walls beside it. */
  wallsOf: number[][];
}

function buildSpec(canon: AkariCanon): Spec {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  const cellCount = rows * cols;
  const isOpen = new Uint8Array(cellCount);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (canon.cells[r][c] === OPEN) isOpen[r * cols + c] = 1;

  const sees: number[][] = Array.from({ length: cellCount }, () => []);
  for (let x = 0; x < cellCount; x++) {
    if (!isOpen[x]) continue;
    const r = Math.floor(x / cols);
    const c = x % cols;
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      for (let rr = r + dr, cc = c + dc; rr >= 0 && cc >= 0 && rr < rows && cc < cols && isOpen[rr * cols + cc]; rr += dr, cc += dc) {
        sees[x].push(rr * cols + cc);
      }
    }
  }
  const lighters = sees.map((s, x) => (isOpen[x] ? [x, ...s] : []));

  const walls: { count: number; cells: number[] }[] = [];
  const wallsOf: number[][] = Array.from({ length: cellCount }, () => []);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = canon.cells[r][c];
      if (n < 0 || n >= PLAIN_WALL) continue;
      const cells: number[] = [];
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (rr >= 0 && cc >= 0 && rr < rows && cc < cols && isOpen[rr * cols + cc]) cells.push(rr * cols + cc);
      }
      for (const x of cells) wallsOf[x].push(walls.length);
      walls.push({ count: n, cells });
    }
  }
  return { rows, cols, cellCount, isOpen, sees, lighters, walls, wallsOf };
}

/**
 * Native CSP solver for Akari (puzzle type 18). One variable per open cell: bulb or empty.
 * Propagated to a fixpoint on every assignment:
 *
 *  - Bulbs don't see each other: a bulb empties every cell in its row and column stretch.
 *  - Every open cell is lit: some cell among it and the cells it sees holds a bulb, so an
 *    unlit cell with one candidate left takes the bulb, and none left is a dead end.
 *  - Numbered walls: exactly that many bulbs beside them (all-or-nothing when tight).
 *
 * All are exact on a full board, so `isSolved` only needs every cell decided.
 * Failed-literal probing over every cell runs at construction and after every search
 * assignment.
 */
export class AkariModel implements ConstraintModel<number[][]> {
  private constructor(
    private readonly spec: Spec,
    private readonly state: Int8Array,
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: AkariCanon): AkariModel {
    const spec = buildSpec(canon);
    const state = new Int8Array(spec.cellCount).fill(UNDECIDED);
    for (let x = 0; x < spec.cellCount; x++) if (!spec.isOpen[x]) state[x] = EMPTY; // walls hold no bulb
    const model = new AkariModel(spec, state, false);
    return model.propagate([], true).probe();
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
    // The unlit cell with the fewest candidate bulbs; branch on its first candidate,
    // bulb first.
    const { spec, state } = this;
    let best = -1;
    let bestCount = Infinity;
    for (let x = 0; x < spec.cellCount; x++) {
      if (!spec.isOpen[x]) continue;
      let lit = false;
      let first = -1;
      let count = 0;
      for (const y of spec.lighters[x]) {
        if (state[y] === BULB) {
          lit = true;
          break;
        }
        if (state[y] === UNDECIDED) {
          count++;
          if (first < 0) first = y;
        }
      }
      if (!lit && count > 0 && count < bestCount) {
        bestCount = count;
        best = first;
      }
    }
    if (best < 0) for (let x = 0; x < spec.cellCount && best < 0; x++) if (state[x] === UNDECIDED) best = x;
    return best < 0 ? null : { id: best, candidates: [BULB, EMPTY] };
  }

  assign(id: number, value: number): ConstraintModel<number[][]> {
    const m = this.assignRaw(id, value);
    return m.dead ? m : m.probe();
  }

  private assignRaw(x: number, value: number): AkariModel {
    if (this.state[x] !== UNDECIDED) return this.state[x] === value ? this : this.toDead();
    const state = Int8Array.from(this.state);
    state[x] = value;
    return new AkariModel(this.spec, state, false).propagate([x], false);
  }

  solution(): number[][] {
    const { rows, cols } = this.spec;
    return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (this.state[r * cols + c] === BULB ? 1 : 0)));
  }

  /** Failed-literal probing over every cell, to a fixpoint. */
  private probe(): AkariModel {
    let m: AkariModel = this;
    for (let changed = true; changed && !m.dead; ) {
      changed = false;
      for (let x = 0; x < m.spec.cellCount && !m.dead; x++) {
        if (m.state[x] !== UNDECIDED) continue;
        const bulb = m.assignRaw(x, BULB);
        if (bulb.dead) {
          m = m.assignRaw(x, EMPTY);
          changed = true;
          continue;
        }
        const empty = m.assignRaw(x, EMPTY);
        if (empty.dead) {
          m = bulb;
          changed = true;
        }
      }
    }
    return m;
  }

  private toDead(): AkariModel {
    return new AkariModel(this.spec, this.state, true);
  }

  /**
   * Run every rule to a fixpoint, mutating `this.state` (the caller copied it). `all`
   * checks every wall and cell first (a 0 wall, an open cell nothing else can light).
   */
  private propagate(changed: number[], all: boolean): AkariModel {
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
      for (const w of spec.walls) if (!this.applyWall(w, force)) return this.toDead();
      for (let x = 0; x < spec.cellCount; x++) if (spec.isOpen[x] && !this.applyLit(x, force)) return this.toDead();
    }
    while (qi < queue.length) {
      const x = queue[qi++];
      if (state[x] === BULB) {
        for (const y of spec.sees[x]) if (!force(y, EMPTY)) return this.toDead();
      } else {
        // x can no longer light anything: re-check the cells it would have lit.
        for (const y of spec.lighters[x]) if (!this.applyLit(y, force)) return this.toDead();
      }
      for (const w of spec.wallsOf[x]) if (!this.applyWall(spec.walls[w], force)) return this.toDead();
    }
    return this;
  }

  /** Cell x must be lit: no candidate left is a dead end, one is forced. */
  private applyLit(x: number, force: (x: number, v: number) => boolean): boolean {
    const { state } = this;
    let open = -1;
    let opens = 0;
    for (const y of this.spec.lighters[x]) {
      if (state[y] === BULB) return true;
      if (state[y] === UNDECIDED) {
        open = y;
        opens++;
      }
    }
    if (opens === 0) return false;
    if (opens === 1 && !force(open, BULB)) return false;
    return true;
  }

  private applyWall(w: { count: number; cells: number[] }, force: (x: number, v: number) => boolean): boolean {
    const { state } = this;
    let bulbs = 0;
    let open = 0;
    for (const x of w.cells) {
      if (state[x] === BULB) bulbs++;
      else if (state[x] === UNDECIDED) open++;
    }
    if (bulbs > w.count || bulbs + open < w.count) return false;
    if (open > 0 && (bulbs === w.count || bulbs + open === w.count)) {
      const v = bulbs === w.count ? EMPTY : BULB;
      for (const x of w.cells) if (state[x] === UNDECIDED && !force(x, v)) return false;
    }
    return true;
  }
}
