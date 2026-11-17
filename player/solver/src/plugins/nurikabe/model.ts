import { Branch, ConstraintModel } from "../../types";
import { connectivityCuts } from "../shading/connectivity";

/**
 * Canonical Nurikabe representation, mirroring the frontend `NurikabeCanon`: a rows x cols
 * grid, 0 = empty, a positive integer = an island's size (the clue cell is part of it).
 */
export interface NurikabeCanon {
  cells: number[][];
}

const UNDECIDED = -1;
const WHITE = 0; // island
const SHADED = 1; // sea

interface Spec {
  rows: number;
  cols: number;
  cellCount: number;
  clue: Int32Array; // 0 = none
  clueCells: number[];
  neighbours: number[][];
  /** Cell id -> top-left corners of the 2x2 blocks it lies in. */
  blocksOf: number[][];
  /** Cells that end up sea: the board minus the sum of the clues. */
  seaCount: number;
}

function buildSpec(canon: NurikabeCanon): Spec {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  const cellCount = rows * cols;
  const clue = new Int32Array(cellCount);
  const clueCells: number[] = [];
  const neighbours: number[][] = Array.from({ length: cellCount }, () => []);
  const blocksOf: number[][] = Array.from({ length: cellCount }, () => []);
  let islandCells = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = r * cols + c;
      const n = canon.cells[r][c];
      if (n > 0) {
        clue[x] = n;
        clueCells.push(x);
        islandCells += n;
      }
      if (c + 1 < cols) {
        neighbours[x].push(x + 1);
        neighbours[x + 1].push(x);
      }
      if (r + 1 < rows) {
        neighbours[x].push(x + cols);
        neighbours[x + cols].push(x);
      }
      if (r + 1 < rows && c + 1 < cols) for (const y of [x, x + 1, x + cols, x + cols + 1]) blocksOf[y].push(x);
    }
  }
  return { rows, cols, cellCount, clue, clueCells, neighbours, blocksOf, seaCount: cellCount - islandCells };
}

/** A connected group of white cells, with its clue (if any) and undecided border. */
interface Island {
  cells: number[];
  /** The clue cell inside, or -1 for a white group no clue has claimed yet. */
  clueCell: number;
  frontier: number[];
}

/**
 * Native CSP solver for Nurikabe (puzzle type 24). One variable per cell, sea (shaded) or
 * island (white); clue cells are island. Propagated to a fixpoint on every assignment:
 *
 *  - No 2x2 sea: three sea cells of a 2x2 make the fourth island.
 *  - One sea: an undecided cell that alone links sea cells is sea (`connectivityCuts`).
 *  - Islands (`applyIslands`), over the connected white groups:
 *      - two clues in one group, or a group past its clue, is a dead end;
 *      - a group that has reached its clue is closed off: its border turns sea;
 *      - an undecided cell touching two clued groups would merge them: sea;
 *      - a clued group with a single undecided border cell and room to grow takes it;
 *      - reach: from each clued group, a walk of at most (clue - size) cells through cells
 *        that don't touch another clued group. A cell no clue reaches is sea (an island
 *        cell, a dead end); a clued group that can't reach its size is a dead end.
 *  - Sea count: the board minus the sum of the clues; too many sea cells, or too few left
 *    possible, is a dead end.
 *
 * All are necessary conditions, so forcing is sound and the search stays complete;
 * `isSolved` re-checks every rule on the full board. Failed-literal probing over every
 * cell runs at construction and after every search assignment.
 */
export class NurikabeModel implements ConstraintModel<number[][]> {
  private constructor(
    private readonly spec: Spec,
    private readonly state: Int8Array,
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: NurikabeCanon): NurikabeModel {
    const spec = buildSpec(canon);
    const state = new Int8Array(spec.cellCount).fill(UNDECIDED);
    const model = new NurikabeModel(spec, state, false);
    // No clue at all is not a puzzle (the API refuses it); clues bigger than the board, none.
    if (spec.cellCount === 0 || spec.clueCells.length === 0 || spec.seaCount < 0) return model.toDead();
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
    // Grow the unfinished clued island with the fewest ways out: its border cells are the
    // most constrained choices. Island first (it settles the most), then sea.
    const { spec, state } = this;
    let best = -1;
    let bestFrontier = Infinity;
    for (const isl of this.islands()) {
      if (isl.clueCell < 0 || isl.frontier.length === 0) continue;
      if (isl.cells.length >= spec.clue[isl.clueCell]) continue;
      if (isl.frontier.length < bestFrontier) {
        bestFrontier = isl.frontier.length;
        best = isl.frontier[0];
      }
    }
    if (best < 0) for (let x = 0; x < spec.cellCount && best < 0; x++) if (state[x] === UNDECIDED) best = x;
    return best < 0 ? null : { id: best, candidates: [WHITE, SHADED] };
  }

  assign(id: number, value: number): ConstraintModel<number[][]> {
    const m = this.assignRaw(id, value);
    return m.dead ? m : m.probe();
  }

  private assignRaw(x: number, value: number): NurikabeModel {
    if (this.state[x] !== UNDECIDED) return this.state[x] === value ? this : this.toDead();
    const state = Int8Array.from(this.state);
    state[x] = value;
    return new NurikabeModel(this.spec, state, false).propagate([x]);
  }

  solution(): number[][] {
    const { rows, cols } = this.spec;
    return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (this.state[r * cols + c] === SHADED ? 1 : 0)));
  }

  /** Failed-literal probing over every cell, to a fixpoint. */
  private probe(): NurikabeModel {
    let m: NurikabeModel = this;
    for (let changed = true; changed && !m.dead; ) {
      changed = false;
      for (let x = 0; x < m.spec.cellCount && !m.dead; x++) {
        if (m.state[x] !== UNDECIDED) continue;
        const sea = m.assignRaw(x, SHADED);
        if (sea.dead) {
          m = m.assignRaw(x, WHITE);
          changed = true;
          continue;
        }
        const island = m.assignRaw(x, WHITE);
        if (island.dead) {
          m = sea;
          changed = true;
        }
      }
    }
    return m;
  }

  private toDead(): NurikabeModel {
    return new NurikabeModel(this.spec, this.state, true);
  }

  /** Run every rule to a fixpoint, mutating `this.state` (the caller copied it). */
  private propagate(changed: number[]): NurikabeModel {
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
        if (state[x] === SHADED && !this.apply2x2(x, force)) return this.toDead();
      }
      if (!this.applyIslands(force)) return this.toDead();
      if (qi < queue.length) continue;
      const cuts = connectivityCuts(spec.neighbours, state, SHADED);
      if (cuts === null) return this.toDead();
      for (const x of cuts) if (!force(x, SHADED)) return this.toDead();
      if (qi < queue.length) continue;
      // Sea count.
      let sea = 0;
      let open = 0;
      for (let x = 0; x < spec.cellCount; x++) {
        if (state[x] === SHADED) sea++;
        else if (state[x] === UNDECIDED) open++;
      }
      if (sea > spec.seaCount || sea + open < spec.seaCount) return this.toDead();
      return this;
    }
  }

  /** No 2x2 sea: three sea cells of a block make the fourth island. */
  private apply2x2(x: number, force: (x: number, v: number) => boolean): boolean {
    const { spec, state } = this;
    for (const tl of spec.blocksOf[x]) {
      const block = [tl, tl + 1, tl + spec.cols, tl + spec.cols + 1];
      let sea = 0;
      let open = -1;
      let opens = 0;
      for (const y of block) {
        if (state[y] === SHADED) sea++;
        else if (state[y] === UNDECIDED) {
          open = y;
          opens++;
        }
      }
      if (sea === 4) return false;
      if (sea === 3 && opens === 1 && !force(open, WHITE)) return false;
    }
    return true;
  }

  /** The connected white groups, each with its clue cell (or -1) and undecided border. */
  private islands(): Island[] {
    const { spec, state } = this;
    const seen = new Uint8Array(spec.cellCount);
    const out: Island[] = [];
    for (let s = 0; s < spec.cellCount; s++) {
      if (seen[s] || state[s] !== WHITE) continue;
      const isl: Island = { cells: [], clueCell: -1, frontier: [] };
      const front = new Set<number>();
      const stack = [s];
      seen[s] = 1;
      while (stack.length) {
        const x = stack.pop()!;
        isl.cells.push(x);
        if (spec.clue[x] > 0) isl.clueCell = isl.clueCell === -1 ? x : -2; // -2: two or more clues
        for (const y of spec.neighbours[x]) {
          if (state[y] === WHITE && !seen[y]) {
            seen[y] = 1;
            stack.push(y);
          } else if (state[y] === UNDECIDED) {
            front.add(y);
          }
        }
      }
      isl.frontier = [...front];
      out.push(isl);
    }
    return out;
  }

  /** The island rules; see the class comment. Returns false on a contradiction. */
  private applyIslands(force: (x: number, v: number) => boolean): boolean {
    const { spec, state } = this;
    const islands = this.islands();
    const owner = new Int32Array(spec.cellCount).fill(-1); // white cell -> clued island index
    for (let i = 0; i < islands.length; i++) {
      const isl = islands[i];
      if (isl.clueCell === -2) return false; // two clues joined
      if (isl.clueCell < 0) continue;
      const size = spec.clue[isl.clueCell];
      if (isl.cells.length > size) return false;
      for (const x of isl.cells) owner[x] = i;
    }

    // Undecided cells touching two different clued islands: sea.
    for (let x = 0; x < spec.cellCount; x++) {
      if (state[x] !== UNDECIDED) continue;
      let first = -1;
      for (const y of spec.neighbours[x]) {
        const o = owner[y];
        if (o < 0) continue;
        if (first < 0) first = o;
        else if (o !== first) {
          if (!force(x, SHADED)) return false;
          break;
        }
      }
    }

    // Reach. A cell may join island i only if it touches no other clued island.
    const reached = new Uint8Array(spec.cellCount);
    for (let i = 0; i < islands.length; i++) {
      const isl = islands[i];
      if (isl.clueCell < 0) continue;
      const size = spec.clue[isl.clueCell];
      const left = size - isl.cells.length;
      if (left === 0) {
        // Complete: close it off.
        for (const y of isl.frontier) if (!force(y, SHADED)) return false;
        for (const x of isl.cells) reached[x] = 1;
        continue;
      }
      const openBorder = isl.frontier.filter((y) => state[y] === UNDECIDED);
      if (openBorder.length === 0) return false; // walled in short of its size
      if (openBorder.length === 1 && !force(openBorder[0], WHITE)) return false;

      // Bounded BFS over undecided and unclaimed white cells.
      const queue: number[] = [];
      const mark = new Map<number, number>();
      for (const x of isl.cells) {
        reached[x] = 1;
        mark.set(x, 0);
        queue.push(x);
      }
      let count = isl.cells.length;
      for (let qi = 0; qi < queue.length; qi++) {
        const x = queue[qi];
        const d = mark.get(x)!;
        if (d >= left) continue;
        for (const y of spec.neighbours[x]) {
          if (mark.has(y) || state[y] === SHADED) continue;
          if (owner[y] >= 0 && owner[y] !== i) continue;
          if (spec.neighbours[y].some((z) => owner[z] >= 0 && owner[z] !== i)) continue;
          mark.set(y, d + 1);
          reached[y] = 1;
          count++;
          queue.push(y);
        }
      }
      if (count < size) return false;
    }
    // Every white cell needs a clue that can reach it; an undecided one that none can is sea.
    for (let x = 0; x < spec.cellCount; x++) {
      if (reached[x]) continue;
      if (state[x] === WHITE) return false;
      if (state[x] === UNDECIDED && !force(x, SHADED)) return false;
    }
    return true;
  }

  /** Every rule on a fully decided board. */
  private checkFull(): boolean {
    const { spec, state } = this;
    for (const isl of this.islands()) {
      if (isl.clueCell < 0) return false;
      if (isl.cells.length !== spec.clue[isl.clueCell]) return false;
    }
    for (let x = 0; x < spec.cellCount; x++) {
      for (const tl of spec.blocksOf[x]) {
        if ([tl, tl + 1, tl + spec.cols, tl + spec.cols + 1].every((y) => state[y] === SHADED)) return false;
      }
    }
    return connectivityCuts(spec.neighbours, state, SHADED) !== null;
  }
}
