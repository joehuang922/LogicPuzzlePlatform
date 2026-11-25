import { Branch, ConstraintModel } from "../../types";

/**
 * Zebra Rope canon (type 36), mirroring the frontend `ZebraRopeCanon`: ropes are ordered
 * lists of [row, col] cells (8-neighbour steps), circles sit on interior grid lines in
 * doubled coordinates (cell (r, c) centre = (2r+1, 2c+1)); color 0 white, 1 black, 2 gray.
 */
export interface ZebraRopeCanon {
  width: number;
  height: number;
  ropes: number[][][];
  circles: { dr: number; dc: number; color: number }[];
}

const UNKNOWN = -1;

/**
 * Static per-puzzle metadata. Cell ids are r * width + c. A rope's cells are tied by one
 * unknown "mode": cell i+1 = cell i XOR mode (0 = all the same, 1 = alternating). A
 * circle bounds how many of its 2 or 4 cells are shaded: white below half, black above
 * half, gray exactly half.
 */
interface Spec {
  width: number;
  height: number;
  ropes: number[][];
  circles: { cells: number[]; lo: number; hi: number }[];
  /** Per cell: constraint ids touching it (ropes first: id < ropes.length, then circles). */
  cellCons: number[][];
}

function buildSpec(canon: ZebraRopeCanon): Spec {
  const { width, height } = canon;
  const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < height && c < width;
  const ropes = canon.ropes
    .map((rope) => rope.filter(([r, c]) => inside(r, c)).map(([r, c]) => r * width + c))
    .filter((ids) => ids.length >= 2);
  const circles: Spec["circles"] = [];
  for (const { dr, dc, color } of canon.circles) {
    const rows = dr % 2 === 1 ? [(dr - 1) / 2] : [dr / 2 - 1, dr / 2];
    const cols = dc % 2 === 1 ? [(dc - 1) / 2] : [dc / 2 - 1, dc / 2];
    const cells: number[] = [];
    for (const r of rows) for (const c of cols) if (inside(r, c)) cells.push(r * width + c);
    const n = cells.length;
    if (n === 0) continue;
    // White: shaded < n/2. Black: shaded > n/2. Gray: shaded = n/2 (impossible for odd n).
    if (color === 0) circles.push({ cells, lo: 0, hi: Math.ceil(n / 2) - 1 });
    else if (color === 1) circles.push({ cells, lo: Math.floor(n / 2) + 1, hi: n });
    else circles.push({ cells, lo: n / 2, hi: n / 2 });
  }
  const cellCons: number[][] = Array.from({ length: width * height }, () => []);
  ropes.forEach((ids, k) => ids.forEach((id) => cellCons[id].push(k)));
  circles.forEach((circle, k) => circle.cells.forEach((id) => cellCons[id].push(ropes.length + k)));
  return { width, height, ropes, circles, cellCons };
}

/**
 * Rope and circle propagation to a fixed point, in place. `cells` holds -1 / 0 / 1 and
 * `modes` one -1 / 0 / 1 per rope. Returns false on a contradiction.
 */
function propagate(spec: Spec, cells: Int8Array, modes: Int8Array, queue: number[]): boolean {
  const queued = new Uint8Array(spec.ropes.length + spec.circles.length);
  for (const k of queue) queued[k] = 1;
  const set = (id: number, v: number): boolean => {
    if (cells[id] === v) return true;
    if (cells[id] !== UNKNOWN) return false;
    cells[id] = v;
    for (const k of spec.cellCons[id]) {
      if (!queued[k]) {
        queued[k] = 1;
        queue.push(k);
      }
    }
    return true;
  };
  while (queue.length > 0) {
    const k = queue.pop()!;
    queued[k] = 0;
    if (k < spec.ropes.length) {
      const ids = spec.ropes[k];
      let anchor = -1;
      for (let i = 0; i < ids.length; i++) {
        if (cells[ids[i]] === UNKNOWN) continue;
        if (anchor < 0) {
          anchor = i;
          continue;
        }
        const same = cells[ids[i]] === cells[ids[anchor]];
        if ((i - anchor) % 2 === 0) {
          // Both modes put the same value at an even distance.
          if (!same) return false;
        } else {
          const mode = same ? 0 : 1;
          if (modes[k] !== UNKNOWN && modes[k] !== mode) return false;
          modes[k] = mode;
        }
      }
      if (anchor < 0 || modes[k] === UNKNOWN) continue;
      const base = cells[ids[anchor]];
      for (let i = 0; i < ids.length; i++) {
        if (!set(ids[i], base ^ (modes[k] & (Math.abs(i - anchor) % 2)))) return false;
      }
    } else {
      const { cells: ids, lo, hi } = spec.circles[k - spec.ropes.length];
      let shaded = 0;
      let open = 0;
      for (const id of ids) {
        if (cells[id] === 1) shaded++;
        else if (cells[id] === UNKNOWN) open++;
      }
      if (shaded > hi || shaded + open < lo) return false;
      if (open === 0) continue;
      const fill = shaded === hi ? 0 : shaded + open === lo ? 1 : UNKNOWN;
      if (fill === UNKNOWN) continue;
      for (const id of ids) if (cells[id] === UNKNOWN && !set(id, fill)) return false;
    }
  }
  return true;
}

/**
 * Failed-literal probing: a cell whose one value propagates to a contradiction takes the
 * other. Repeats until nothing changes. Returns false when both values fail somewhere.
 */
function probe(spec: Spec, cells: Int8Array, modes: Int8Array): boolean {
  let changed = true;
  while (changed) {
    changed = false;
    for (let id = 0; id < cells.length; id++) {
      if (cells[id] !== UNKNOWN || spec.cellCons[id].length === 0) continue;
      const ok = [0, 1].map((v) => {
        const c = cells.slice();
        const m = modes.slice();
        c[id] = v;
        return propagate(spec, c, m, [...spec.cellCons[id]]) ? { c, m } : null;
      });
      if (!ok[0] && !ok[1]) return false;
      if (!ok[0] || !ok[1]) {
        const { c, m } = (ok[0] ?? ok[1])!;
        cells.set(c);
        modes.set(m);
        changed = true;
      }
    }
  }
  return true;
}

function settle(spec: Spec, cells: Int8Array, modes: Int8Array, queue: number[]): boolean {
  return propagate(spec, cells, modes, queue) && probe(spec, cells, modes);
}

export class ZebraRopeModel implements ConstraintModel {
  private constructor(
    private readonly spec: Spec,
    private readonly cells: Int8Array,
    private readonly modes: Int8Array,
    private readonly dead: boolean
  ) {}

  static fromCanon(canon: ZebraRopeCanon): ZebraRopeModel {
    const spec = buildSpec(canon);
    const cells = new Int8Array(spec.width * spec.height).fill(UNKNOWN);
    const modes = new Int8Array(spec.ropes.length).fill(UNKNOWN);
    const all = Array.from({ length: spec.ropes.length + spec.circles.length }, (_, k) => k);
    return new ZebraRopeModel(spec, cells, modes, !settle(spec, cells, modes, all));
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    return !this.dead && this.cells.every((v) => v !== UNKNOWN);
  }

  /**
   * The unknown cell in the most ropes and circles (it settles the most when assigned).
   * A cell in none is free: branching on it proves the puzzle has several solutions.
   */
  selectBranch(): Branch | null {
    if (this.dead) return null;
    let best = -1;
    let bestScore = -1;
    for (let id = 0; id < this.cells.length; id++) {
      if (this.cells[id] !== UNKNOWN) continue;
      let score = 0;
      for (const k of this.spec.cellCons[id]) {
        score += k < this.spec.ropes.length ? this.spec.ropes[k].length : 2;
      }
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    return best < 0 ? null : { id: best, candidates: [1, 0] };
  }

  assign(id: number, value: number): ZebraRopeModel {
    const cells = this.cells.slice();
    const modes = this.modes.slice();
    if (cells[id] !== UNKNOWN) return new ZebraRopeModel(this.spec, cells, modes, cells[id] !== value);
    cells[id] = value;
    const ok = settle(this.spec, cells, modes, [...this.spec.cellCons[id]]);
    return new ZebraRopeModel(this.spec, cells, modes, !ok);
  }

  /** height x width of 0 / 1 (1 shaded): the answer's `states`. */
  solution(): number[][] {
    const { width, height } = this.spec;
    return Array.from({ length: height }, (_, r) => Array.from(this.cells.subarray(r * width, (r + 1) * width)));
  }
}
