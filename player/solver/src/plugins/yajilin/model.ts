import { Branch, ConstraintModel } from "../../types";
import {
  Lattice, ParityDSU, Paths, UNDECIDED, OFF, ON,
  buildLattice, edgeGrids, forbidClosing, isConnectable, isSingleLoop,
} from "../loop/lattice";

/**
 * Canonical Yajilin representation, mirroring the frontend `YajilinCanon`: a rows x cols
 * grid of `null` (an empty cell) or a clue `{ dir, num }` — exactly `num` shaded cells lie
 * in direction `dir` from it, up to the edge of the grid.
 */
export interface YajilinCanon {
  cells: ({ dir: "up" | "down" | "left" | "right"; num: number } | null)[][];
}

/**
 * The solver's solution, in the frontend `YajilinAnswer` shape: `blacks` is rows x cols
 * (1 shaded, clue cells 0), `edges` the loop between cell centres (h: rows x (cols-1),
 * v: (rows-1) x cols).
 */
export interface YajilinSolution {
  blacks: number[][];
  edges: { h: number[][]; v: number[][] };
}

const DIRS: Record<string, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

/**
 * A clue's line: the empty cells in its direction, in order, and for each whether it
 * touches the previous one (a clue cell in between breaks the adjacency).
 */
interface ClueLine {
  num: number;
  cells: number[];
  touchesPrev: boolean[];
}

/**
 * Static per-puzzle metadata. Variables live in one state array: the lattice's edges
 * first, then one "shaded" variable per cell at `edgeCount + cell` (fixed OFF on clues).
 */
interface Spec extends Lattice {
  varCount: number;
  isClue: Uint8Array;
  clues: ClueLine[];
  /** Cell id -> the clue lines it lies on. */
  cluesOfCell: ClueLine[][];
  /** Cell id -> its orthogonal neighbours that are empty cells. */
  neighbours: number[][];
  /** All zero: Paths' touched-cell count is unused here. */
  noMark: Uint8Array;
}

function buildSpec(canon: YajilinCanon): Spec {
  const cells = canon.cells;
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const lat = buildLattice(rows, cols);
  const isClue = new Uint8Array(lat.nodeCount);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (cells[r][c]) isClue[r * cols + c] = 1;

  const clues: ClueLine[] = [];
  const cluesOfCell: ClueLine[][] = Array.from({ length: lat.nodeCount }, () => []);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const clue = cells[r][c];
      if (!clue) continue;
      const [dr, dc] = DIRS[clue.dir];
      const line: ClueLine = { num: clue.num, cells: [], touchesPrev: [] };
      let prevEmpty = false;
      for (let rr = r + dr, cc = c + dc; rr >= 0 && cc >= 0 && rr < rows && cc < cols; rr += dr, cc += dc) {
        const x = rr * cols + cc;
        if (isClue[x]) {
          prevEmpty = false;
          continue;
        }
        line.cells.push(x);
        line.touchesPrev.push(prevEmpty);
        prevEmpty = true;
      }
      clues.push(line);
      for (const x of line.cells) cluesOfCell[x].push(line);
    }
  }

  const neighbours: number[][] = Array.from({ length: lat.nodeCount }, () => []);
  for (let e = 0; e < lat.edgeCount; e++) {
    const [a, b] = lat.endpoints[e];
    if (isClue[a] || isClue[b]) continue;
    neighbours[a].push(b);
    neighbours[b].push(a);
  }

  return {
    ...lat, varCount: lat.edgeCount + lat.nodeCount, isClue, clues, cluesOfCell, neighbours,
    noMark: new Uint8Array(lat.nodeCount),
  };
}

/**
 * Native CSP solver for Yajilin (puzzle type 13). Variables are the edges between
 * adjacent cells (on the loop or not) and each empty cell's "shaded" flag. Propagated to
 * a fixpoint on every assignment:
 *
 *  - Cell rule: a shaded cell has no lines; an unshaded empty cell is on the loop, so has
 *    exactly two; a clue cell has neither.
 *  - Shaded cells never touch: a shaded cell unshades its empty neighbours.
 *  - Clue rule: each clue's line is filtered against every shading of it with exactly
 *    `num` shaded cells, none touching (a forward/backward reachability pass), so a cell
 *    shaded in every remaining shading is forced shaded, and vice versa.
 *  - Inside/outside colouring, single-loop rule and connectivity, shared with Masyu
 *    (`../loop/lattice`): every unshaded empty cell is a cell the loop must visit.
 *
 * All are necessary conditions, so forcing is sound and the search stays complete; the
 * leaf check in `isSolved` confirms the ON edges form one loop. Construction ends with
 * failed-literal probing over every variable, as in Masyu and Slitherlink.
 */
export class YajilinModel implements ConstraintModel<YajilinSolution> {
  private constructor(
    private readonly spec: Spec,
    private readonly state: Int8Array,
    private readonly dsu: ParityDSU,
    private readonly loops: Paths,
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: YajilinCanon): YajilinModel {
    const spec = buildSpec(canon);
    const state = new Int8Array(spec.varCount).fill(UNDECIDED);
    const model = new YajilinModel(spec, state, ParityDSU.create(spec.faceCount), Paths.create(spec.nodeCount), false);
    if (spec.edgeCount === 0) return model.toDead();
    return model.propagate([], true).probe();
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    if (this.dead) return false;
    for (let v = 0; v < this.spec.varCount; v++) if (this.state[v] === UNDECIDED) return false;
    return isSingleLoop(this.spec, this.state);
  }

  selectBranch(): Branch | null {
    const { spec, state, loops } = this;
    let best = -1;
    let bestScore = Infinity;
    for (let v = 0; v < spec.varCount && bestScore > 0; v++) {
      if (state[v] !== UNDECIDED) continue;
      let score: number;
      if (v < spec.edgeCount) {
        // An edge at a cell the loop already enters must be decided for the loop to go on.
        const [a, b] = spec.endpoints[v];
        score = loops.degree[a] === 1 || loops.degree[b] === 1 ? 0 : 3;
      } else {
        score = spec.cluesOfCell[v - spec.edgeCount].length > 0 ? 1 : 2;
      }
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    }
    if (best === -1) return null;
    return { id: best, candidates: [ON, OFF] };
  }

  assign(id: number, value: number): ConstraintModel<YajilinSolution> {
    return this.assignRaw(id, value);
  }

  private assignRaw(id: number, value: number): YajilinModel {
    if (this.state[id] !== UNDECIDED) return this.state[id] === value ? this : this.toDead();
    const state = Int8Array.from(this.state);
    state[id] = value;
    return new YajilinModel(this.spec, state, this.dsu.clone(), this.loops.clone(), false).propagate([id], false);
  }

  solution(): YajilinSolution {
    const { rows, cols, edgeCount } = this.spec;
    const blacks = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => (this.state[edgeCount + r * cols + c] === ON ? 1 : 0)),
    );
    return { blacks, edges: edgeGrids(this.spec, this.state) };
  }

  // -- propagation ------------------------------------------------------------

  /** Failed-literal probing over every variable, to a fixpoint. */
  private probe(): YajilinModel {
    let m: YajilinModel = this;
    for (let changed = true; changed && !m.dead; ) {
      changed = false;
      for (let v = 0; v < m.spec.varCount && !m.dead; v++) {
        if (m.state[v] !== UNDECIDED) continue;
        const on = m.assignRaw(v, ON);
        if (on.dead) {
          m = m.assignRaw(v, OFF);
          changed = true;
          continue;
        }
        const off = m.assignRaw(v, OFF);
        if (off.dead) {
          m = on;
          changed = true;
        }
      }
    }
    return m;
  }

  private toDead(): YajilinModel {
    return new YajilinModel(this.spec, this.state, this.dsu, this.loops, true);
  }

  /**
   * Run every rule to a fixpoint, mutating this model's arrays in place (the caller copied
   * them). `seed` lists variables that just changed; `initial` first settles the clue
   * cells and applies every cell and clue rule once.
   */
  private propagate(seed: number[], initial: boolean): YajilinModel {
    const { spec, state, dsu, loops } = this;
    const E = spec.edgeCount;
    const queue = [...seed];
    let qi = 0;
    const merged: number[] = [];

    const force = (v: number, value: number): boolean => {
      const cur = state[v];
      if (cur === value) return true;
      if (cur !== UNDECIDED) return false;
      state[v] = value;
      queue.push(v);
      return true;
    };

    if (initial) {
      for (let x = 0; x < spec.nodeCount; x++) {
        if (spec.isClue[x]) {
          if (!force(E + x, OFF)) return this.toDead();
          for (const e of spec.edgesOfNode[x]) if (!force(e, OFF)) return this.toDead();
        }
      }
      for (let x = 0; x < spec.nodeCount; x++) if (!this.applyCell(x, force)) return this.toDead();
      for (const line of spec.clues) if (!this.applyClue(line, force)) return this.toDead();
    }

    for (;;) {
      while (qi < queue.length) {
        const v = queue[qi++];
        if (v < E) {
          const [a, b] = spec.endpoints[v];
          if (!this.applyCell(a, force) || !this.applyCell(b, force)) return this.toDead();
          const [fa, fb] = spec.facesOfEdge[v];
          if (!dsu.relate(fa, fb, state[v] === ON ? 1 : 0, merged)) return this.toDead();
          if (state[v] === ON) loops.add(a, b, spec.noMark);
          while (merged.length > 0) {
            for (const e of spec.edgesOfFace[merged.pop()!]) {
              if (state[e] !== UNDECIDED) continue;
              const [ga, gb] = spec.facesOfEdge[e];
              const rel = dsu.related(ga, gb);
              if (rel >= 0 && !force(e, rel === 1 ? ON : OFF)) return this.toDead();
            }
          }
        } else {
          const x = v - E;
          if (spec.isClue[x]) continue;
          if (!this.applyCell(x, force)) return this.toDead();
          if (state[v] === ON) {
            for (const y of spec.neighbours[x]) if (!force(E + y, OFF)) return this.toDead();
          }
          for (const line of spec.cluesOfCell[x]) if (!this.applyClue(line, force)) return this.toDead();
        }
      }
      if (!this.applyLoopRule(force)) return this.toDead();
      if (qi < queue.length) continue;
      const required = (x: number) => !spec.isClue[x] && state[E + x] === OFF;
      return isConnectable(spec, state, required) ? this : this.toDead();
    }
  }

  /**
   * The single-loop rule. A closed cycle must be the whole answer: dead unless it is the
   * only path and no unshaded empty cell is left off it, and then every other edge is OFF.
   * Otherwise an edge closing a path is OFF unless that could finish the puzzle — the path
   * is the only one and every cell not on it may still be shaded.
   */
  private applyLoopRule(force: (v: number, value: number) => boolean): boolean {
    const { spec, state, loops } = this;
    const E = spec.edgeCount;
    let stranded = false; // an unshaded empty cell the loop doesn't reach yet
    for (let x = 0; x < spec.nodeCount && !stranded; x++) {
      if (!spec.isClue[x] && state[E + x] === OFF && loops.degree[x] === 0) stranded = true;
    }
    if (loops.closed) {
      if (loops.paths !== 1 || stranded) return false;
      for (let e = 0; e < E; e++) if (state[e] === UNDECIDED && !force(e, OFF)) return false;
      return true;
    }
    if (loops.paths === 1 && !stranded) return true;
    // Whether closing is legal can change both ways here (a stranded cell can join the
    // path), so check every path, not just the ones whose ends just moved.
    return forbidClosing(spec, state, loops, [], true, force);
  }

  /** An empty cell is shaded with no lines, or unshaded with exactly two. */
  private applyCell(x: number, force: (v: number, value: number) => boolean): boolean {
    const { spec, state } = this;
    if (spec.isClue[x]) return true;
    const incident = spec.edgesOfNode[x];
    let on = 0;
    let undecided = 0;
    for (const e of incident) {
      if (state[e] === ON) on++;
      else if (state[e] === UNDECIDED) undecided++;
    }
    if (on > 2) return false;
    const shade = spec.edgeCount + x;
    if (on > 0 && !force(shade, OFF)) return false;
    if (on + undecided < 2 && !force(shade, ON)) return false;
    if (state[shade] === ON) {
      for (const e of incident) if (state[e] === UNDECIDED && !force(e, OFF)) return false;
      return true;
    }
    if (state[shade] === OFF) {
      if (on === 2) {
        for (const e of incident) if (state[e] === UNDECIDED && !force(e, OFF)) return false;
      } else if (on + undecided === 2) {
        for (const e of incident) if (state[e] === UNDECIDED && !force(e, ON)) return false;
      }
    }
    return true;
  }

  /**
   * Exact filtering of one clue line: which cells are shaded in some shading of the line
   * with exactly `num` shaded cells, no two touching, consistent with what is decided.
   * Forward and backward reachability over (position, count, previous shaded) states.
   */
  private applyClue(line: ClueLine, force: (v: number, value: number) => boolean): boolean {
    const { spec, state } = this;
    const E = spec.edgeCount;
    const n = line.cells.length;
    const k = line.num;
    if (k > n) return false;
    const W = k + 1;
    // fwd[(i * W + c) * 2 + p]: the first i cells can hold c shaded, the i-th shaded iff p.
    const fwd = new Uint8Array((n + 1) * W * 2);
    const bwd = new Uint8Array((n + 1) * W * 2);
    const allowed = (i: number, s: number) => {
      const st = state[E + line.cells[i]];
      return st === UNDECIDED || st === s;
    };
    const idx = (i: number, c: number, p: number) => (i * W + c) * 2 + p;
    fwd[idx(0, 0, 0)] = 1;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c <= k; c++) {
        for (let p = 0; p < 2; p++) {
          if (!fwd[idx(i, c, p)]) continue;
          if (allowed(i, 0)) fwd[idx(i + 1, c, 0)] = 1;
          if (c < k && allowed(i, 1) && !(p && line.touchesPrev[i])) fwd[idx(i + 1, c + 1, 1)] = 1;
        }
      }
    }
    if (!fwd[idx(n, k, 0)] && !fwd[idx(n, k, 1)]) return false;
    // bwd[i, c, p]: from state (i cells done, c shaded, last shaded p) the rest can finish.
    bwd[idx(n, k, 0)] = bwd[idx(n, k, 1)] = 1;
    const canBe = [new Uint8Array(n), new Uint8Array(n)];
    for (let i = n - 1; i >= 0; i--) {
      for (let c = 0; c <= k; c++) {
        for (let p = 0; p < 2; p++) {
          let ok = 0;
          if (allowed(i, 0) && bwd[idx(i + 1, c, 0)]) {
            ok = 1;
            if (fwd[idx(i, c, p)]) canBe[0][i] = 1;
          }
          if (c < k && allowed(i, 1) && !(p && line.touchesPrev[i]) && bwd[idx(i + 1, c + 1, 1)]) {
            ok = 1;
            if (fwd[idx(i, c, p)]) canBe[1][i] = 1;
          }
          bwd[idx(i, c, p)] = ok;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const v = E + line.cells[i];
      if (state[v] !== UNDECIDED) continue;
      if (!canBe[1][i] && !force(v, OFF)) return false;
      if (!canBe[0][i] && !force(v, ON)) return false;
    }
    return true;
  }
}
