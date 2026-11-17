import { Branch, ConstraintModel } from "../../types";
import { connectivityCuts } from "../shading/connectivity";

/**
 * Canonical Corner Chain representation, mirroring the frontend `CornerChainCanon`: a
 * rows x cols grid, 0 = empty, a positive integer = the size of the island containing it.
 */
export interface CornerChainCanon {
  cells: number[][];
}

const UNDECIDED = -1;
const WHITE = 0;
const SHADED = 1;

interface Spec {
  rows: number;
  cols: number;
  cellCount: number;
  clue: Int32Array; // 0 = none
  clueCells: number[];
  /** Orthogonal neighbours: islands are orthogonally connected white cells. */
  neighbours: number[][];
  /** Orthogonal and diagonal neighbours: the corner network joins islands diagonally. */
  neighbours8: number[][];
}

function buildSpec(canon: CornerChainCanon): Spec {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  const cellCount = rows * cols;
  const clue = new Int32Array(cellCount);
  const clueCells: number[] = [];
  const neighbours: number[][] = Array.from({ length: cellCount }, () => []);
  const neighbours8: number[][] = Array.from({ length: cellCount }, () => []);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = r * cols + c;
      if (canon.cells[r][c] > 0) {
        clue[x] = canon.cells[r][c];
        clueCells.push(x);
      }
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
          neighbours8[x].push(rr * cols + cc);
          if (!dr || !dc) neighbours[x].push(rr * cols + cc);
        }
      }
    }
  }
  return { rows, cols, cellCount, clue, clueCells, neighbours, neighbours8 };
}

/** A connected group of white cells, with its number (0 none, -1 conflicting) and border. */
interface Group {
  cells: number[];
  clue: number;
  frontier: number[];
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

/** True when `cells` exactly fill their bounding box. */
const isRectangle = (g: Group) => (g.r1 - g.r0 + 1) * (g.c1 - g.c0 + 1) === g.cells.length;

/**
 * Native CSP solver for Corner Chain (puzzle type 30). One variable per cell, shaded or
 * white; clue cells are white. Islands (orthogonally connected white cells) may hold any
 * number of clues, all equal to the island's size, or none; an even-sized island exactly
 * fills a rectangle, an odd-sized one does not (so never a single cell); islands link into
 * one network through diagonal corners. Propagated to a fixpoint on every assignment:
 *
 *  - Groups (`applyGroups`), over the connected white groups:
 *      - different numbers in one group, or a group past its number, is a dead end;
 *      - a numbered group of its full size is closed off, and must pass the shape rule;
 *      - an undecided cell that would merge groups with different numbers, or merge past
 *        their number, is shaded;
 *      - a numbered group that can't reach its size (a walk avoiding cells that touch a
 *        group with another number) is a dead end; one with a single way out takes it;
 *      - an even number: the rectangles of that area that hold the group and nothing that
 *        rules them out (shaded cells, other numbers, white cells around them). Cells in
 *        every one are white, cells bordering every one are shaded, none is a dead end;
 *      - a closed group without a number must pass the shape rule as is.
 *  - No single cells: a white cell needs a white neighbour; with one candidate, it is white.
 *  - Corner network: in an answer the white cells are connected counting diagonal steps,
 *    so an undecided cell that alone links white cells that way is white
 *    (`connectivityCuts` over the 8-neighbourhood).
 *
 * All are necessary conditions, so forcing is sound and the search stays complete;
 * `isSolved` re-checks every rule on the full board. Failed-literal probing over every
 * cell runs at construction and after every search assignment.
 */
export class CornerChainModel implements ConstraintModel<number[][]> {
  private constructor(
    private readonly spec: Spec,
    private readonly state: Int8Array,
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: CornerChainCanon): CornerChainModel {
    const spec = buildSpec(canon);
    const state = new Int8Array(spec.cellCount).fill(UNDECIDED);
    const model = new CornerChainModel(spec, state, false);
    if (spec.cellCount === 0) return model.toDead();
    for (const x of spec.clueCells) state[x] = WHITE;
    return model.propagate([...spec.clueCells]).probe();
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
    // Grow the open group with the fewest ways out, island first.
    const { spec, state } = this;
    let best = -1;
    let bestFrontier = Infinity;
    for (const g of this.groups()) {
      if (g.frontier.length > 0 && g.frontier.length < bestFrontier) {
        bestFrontier = g.frontier.length;
        best = g.frontier[0];
      }
    }
    if (best < 0) for (let x = 0; x < spec.cellCount && best < 0; x++) if (state[x] === UNDECIDED) best = x;
    return best < 0 ? null : { id: best, candidates: [WHITE, SHADED] };
  }

  assign(id: number, value: number): ConstraintModel<number[][]> {
    const m = this.assignRaw(id, value);
    return m.dead ? m : m.probe();
  }

  private assignRaw(x: number, value: number): CornerChainModel {
    if (this.state[x] !== UNDECIDED) return this.state[x] === value ? this : this.toDead();
    const state = Int8Array.from(this.state);
    state[x] = value;
    return new CornerChainModel(this.spec, state, false).propagate([x]);
  }

  solution(): number[][] {
    const { rows, cols } = this.spec;
    return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (this.state[r * cols + c] === SHADED ? 1 : 0)));
  }

  /** Failed-literal probing over every cell, to a fixpoint. */
  private probe(): CornerChainModel {
    let m: CornerChainModel = this;
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

  private toDead(): CornerChainModel {
    return new CornerChainModel(this.spec, this.state, true);
  }

  /** Run every rule to a fixpoint, mutating `this.state` (the caller copied it). */
  private propagate(changed: number[]): CornerChainModel {
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
        // No single cells: x (if white) and its white neighbours each need a white neighbour.
        if (!this.applyNeighbourNeeded(x, force)) return this.toDead();
        for (const y of spec.neighbours[x]) if (!this.applyNeighbourNeeded(y, force)) return this.toDead();
      }
      if (!this.applyGroups(force)) return this.toDead();
      if (qi < queue.length) continue;
      const cuts = connectivityCuts(spec.neighbours8, state, WHITE);
      if (cuts === null) return this.toDead();
      for (const x of cuts) if (!force(x, WHITE)) return this.toDead();
      if (qi < queue.length) continue;
      return this;
    }
  }

  /** A white cell needs a white neighbour: none possible is a dead end, one is forced. */
  private applyNeighbourNeeded(x: number, force: (x: number, v: number) => boolean): boolean {
    const { spec, state } = this;
    if (state[x] !== WHITE) return true;
    let open = -1;
    let opens = 0;
    for (const y of spec.neighbours[x]) {
      if (state[y] === WHITE) return true;
      if (state[y] === UNDECIDED) {
        open = y;
        opens++;
      }
    }
    if (opens === 0) return false;
    if (opens === 1 && !force(open, WHITE)) return false;
    return true;
  }

  /** The connected white groups with their number, border and bounding box. */
  private groups(): Group[] {
    const { spec, state } = this;
    const seen = new Uint8Array(spec.cellCount);
    const out: Group[] = [];
    for (let s = 0; s < spec.cellCount; s++) {
      if (seen[s] || state[s] !== WHITE) continue;
      const g: Group = { cells: [], clue: 0, frontier: [], r0: Infinity, r1: -1, c0: Infinity, c1: -1 };
      const front = new Set<number>();
      const stack = [s];
      seen[s] = 1;
      while (stack.length) {
        const x = stack.pop()!;
        g.cells.push(x);
        const r = Math.floor(x / spec.cols);
        const c = x % spec.cols;
        g.r0 = Math.min(g.r0, r);
        g.r1 = Math.max(g.r1, r);
        g.c0 = Math.min(g.c0, c);
        g.c1 = Math.max(g.c1, c);
        const n = spec.clue[x];
        if (n > 0) g.clue = g.clue === 0 || g.clue === n ? n : -1;
        for (const y of spec.neighbours[x]) {
          if (state[y] === WHITE && !seen[y]) {
            seen[y] = 1;
            stack.push(y);
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

  /** The island rules; see the class comment. Returns false on a contradiction. */
  private applyGroups(force: (x: number, v: number) => boolean): boolean {
    const { spec, state } = this;
    const groups = this.groups();
    const groupOf = new Int32Array(spec.cellCount).fill(-1);
    groups.forEach((g, i) => g.cells.forEach((x) => (groupOf[x] = i)));

    for (const g of groups) {
      if (g.clue < 0) return false;
      if (g.clue > 0 && g.cells.length > g.clue) return false;
      if (g.frontier.length === 0) {
        // Closed: its size is final.
        if (g.clue > 0 && g.cells.length !== g.clue) return false;
        if ((g.cells.length % 2 === 0) !== isRectangle(g)) return false;
      } else if (g.clue > 0 && g.cells.length === g.clue) {
        for (const y of g.frontier) if (!force(y, SHADED)) return false;
      }
    }

    // A cell joining its neighbouring groups must not mix numbers or pass the number.
    for (let x = 0; x < spec.cellCount; x++) {
      if (state[x] !== UNDECIDED) continue;
      const joined = new Set<number>();
      for (const y of spec.neighbours[x]) if (groupOf[y] >= 0) joined.add(groupOf[y]);
      if (joined.size === 0) continue;
      let n = spec.clue[x];
      let size = 1;
      let clash = false;
      for (const i of joined) {
        const g = groups[i];
        size += g.cells.length;
        if (g.clue > 0) {
          if (n > 0 && n !== g.clue) clash = true;
          n = g.clue;
        }
      }
      if ((clash || (n > 0 && size > n)) && !force(x, SHADED)) return false;
    }

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.clue <= 0 || g.frontier.length === 0 || g.cells.length >= g.clue) continue;
      if (!this.applyReach(g, i, groups, groupOf, force)) return false;
      if (g.clue % 2 === 0 && !this.applyRectangles(g, i, groups, groupOf, force)) return false;
    }
    return true;
  }

  /**
   * A numbered group must reach its size: a walk of at most (clue - size) cells through
   * cells that aren't shaded, don't belong to or touch a group with another number. Too
   * few cells is a dead end; a single way out is taken.
   */
  private applyReach(g: Group, i: number, groups: Group[], groupOf: Int32Array, force: (x: number, v: number) => boolean): boolean {
    const { spec, state } = this;
    const foreign = (y: number) => {
      const o = groupOf[y];
      if (o >= 0 && o !== i && groups[o].clue > 0 && groups[o].clue !== g.clue) return true;
      return spec.clue[y] > 0 && spec.clue[y] !== g.clue;
    };
    const usable = (y: number) => state[y] !== SHADED && !foreign(y) && !spec.neighbours[y].some(foreign);
    const exits = g.frontier.filter(usable);
    if (exits.length === 0) return false;
    if (exits.length === 1 && !force(exits[0], WHITE)) return false;
    const left = g.clue - g.cells.length;
    const dist = new Map<number, number>();
    const queue: number[] = [];
    for (const x of g.cells) {
      dist.set(x, 0);
      queue.push(x);
    }
    for (let qi = 0; qi < queue.length && dist.size < g.clue; qi++) {
      const x = queue[qi];
      const d = dist.get(x)!;
      if (d >= left) continue;
      for (const y of spec.neighbours[x]) {
        if (dist.has(y) || !usable(y)) continue;
        dist.set(y, d + 1);
        queue.push(y);
      }
    }
    return dist.size >= g.clue;
  }

  /**
   * An even number: the island is one of the rectangles of that area holding the group.
   * A rectangle is out if it holds a shaded cell, another number, or part of a group with
   * another number, or if a cell around it is white (the island would spread past it).
   * Cells in every remaining rectangle are white, cells around every one are shaded.
   */
  private applyRectangles(g: Group, i: number, groups: Group[], groupOf: Int32Array, force: (x: number, v: number) => boolean): boolean {
    const { spec, state } = this;
    const n = g.clue;
    // Cells inside / around every rectangle still possible (undefined until the first).
    const acc: { inAll?: Set<number>; ringAll?: Set<number> } = {};
    let count = 0;
    for (let h = 1; h <= n; h++) {
      if (n % h) continue;
      const w = n / h;
      if (h > spec.rows || w > spec.cols) continue;
      if (h < g.r1 - g.r0 + 1 || w < g.c1 - g.c0 + 1) continue;
      for (let r0 = Math.max(0, g.r1 - h + 1); r0 <= Math.min(g.r0, spec.rows - h); r0++) {
        for (let c0 = Math.max(0, g.c1 - w + 1); c0 <= Math.min(g.c0, spec.cols - w); c0++) {
          const inside = new Set<number>();
          let ok = true;
          for (let r = r0; r < r0 + h && ok; r++) {
            for (let c = c0; c < c0 + w; c++) {
              const x = r * spec.cols + c;
              const o = groupOf[x];
              if (state[x] === SHADED || (spec.clue[x] > 0 && spec.clue[x] !== n) || (o >= 0 && o !== i && groups[o].clue > 0 && groups[o].clue !== n)) {
                ok = false;
                break;
              }
              inside.add(x);
            }
          }
          if (!ok) continue;
          const ring = new Set<number>();
          for (const x of inside) for (const y of spec.neighbours[x]) if (!inside.has(y)) ring.add(y);
          if ([...ring].some((y) => state[y] === WHITE)) continue;
          count++;
          acc.inAll = acc.inAll ? new Set([...acc.inAll].filter((x) => inside.has(x))) : inside;
          acc.ringAll = acc.ringAll ? new Set([...acc.ringAll].filter((x) => ring.has(x))) : ring;
        }
      }
    }
    if (count === 0) return false;
    for (const x of acc.inAll!) if (!force(x, WHITE)) return false;
    for (const x of acc.ringAll!) if (!force(x, SHADED)) return false;
    return true;
  }

  /** Every rule on a fully decided board. */
  private checkFull(): boolean {
    const { spec, state } = this;
    const groups = this.groups();
    for (const g of groups) {
      if (g.clue < 0 || (g.clue > 0 && g.cells.length !== g.clue)) return false;
      if ((g.cells.length % 2 === 0) !== isRectangle(g)) return false;
    }
    // At least one island (as the completion check requires), all in one corner network:
    // white cells connected through white cells, diagonals included.
    if (groups.length === 0) return false;
    return groups.length === 1 || connectivityCuts(spec.neighbours8, state, WHITE) !== null;
  }
}
