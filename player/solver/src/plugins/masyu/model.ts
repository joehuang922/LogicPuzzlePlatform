import { Branch, ConstraintModel } from "../../types";
import {
  Lattice, ParityDSU, Paths, UNDECIDED, OFF, ON,
  buildLattice, edgeGrids, forbidClosing, isConnectable, isSingleLoop,
} from "../loop/lattice";

/**
 * Canonical Masyu representation, mirroring the frontend `MasyuCanon`. `cells` is a
 * rows x cols grid: 0 = empty, 1 = white circle, 2 = black circle.
 */
export interface MasyuCanon {
  cells: number[][];
}

/**
 * The solver's solution shape — the two edge grids of the frontend `MasyuAnswer`. The loop
 * runs through cell centres: `h` is rows x (cols-1) (h[r][c] joins cell (r,c) to (r,c+1)),
 * `v` is (rows-1) x cols (v[r][c] joins (r,c) to (r+1,c)). Values are 0 or 1.
 */
export interface MasyuEdges {
  h: number[][];
  v: number[][];
}

export const WHITE = 1;
export const BLACK = 2;

/**
 * A circle's rule as an explicit table: the edges it reads and every allowed ON/OFF
 * combination of them (bit i of a tuple = value of `edges[i]`). A circle reads at most 8
 * edges (its own 4 plus the 4 one cell further out), so a table holds at most 256 tuples
 * and filtering it against the current state is cheap. Keeping the rule as data means
 * propagation is plain generalized arc consistency: no hand-written case analysis to get
 * wrong, and every consequence of the circle (on its own) is forced.
 */
interface CircleRule {
  edges: number[];
  tuples: number[];
}

/**
 * Static per-puzzle metadata, shared by reference across all models of one puzzle so
 * `assign` only copies the mutable state: the cell lattice plus the circles' rules.
 */
interface Spec extends Lattice {
  /** Cell ids holding a circle. */
  circles: number[];
  rules: CircleRule[];
  /** Edge id -> the circle rules that read it. */
  rulesOfEdge: CircleRule[][];
  /** Cell id -> 1 when it holds a circle. */
  isCircle: Uint8Array;
}

function buildSpec(canon: MasyuCanon): Spec {
  const cells = canon.cells;
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const lat = buildLattice(rows, cols);
  const circles: number[] = [];
  const rules: CircleRule[] = [];
  const rulesOfEdge: CircleRule[][] = Array.from({ length: lat.edgeCount }, () => []);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const kind = cells[r][c];
      if (kind !== WHITE && kind !== BLACK) continue;
      circles.push(r * cols + c);
      const rule = circleRule(kind, r, c, lat.edgeFrom);
      rules.push(rule);
      for (const e of rule.edges) rulesOfEdge[e].push(rule);
    }
  }
  const isCircle = new Uint8Array(lat.nodeCount);
  for (const c of circles) isCircle[c] = 1;
  return { ...lat, circles, rules, rulesOfEdge, isCircle };
}

/**
 * Tabulate a circle's rule. Slots are the circle's own edges (L, R, U, D) and the edge one
 * cell further out in each direction (LL = the left neighbour's own left edge, ...). An
 * edge off the grid is a constant OFF. With every cell's degree held at 0 or 2 elsewhere,
 * a neighbour the loop enters from the circle goes straight on iff its far edge is ON, so:
 *
 *  - White: straight through (L & R & !U & !D, or U & D & !L & !R), and the loop turns in
 *    at least one of the two neighbours it passes into (not both far edges ON).
 *  - Black: turns here (exactly one of L/R and one of U/D) and goes straight through the
 *    next cell on both sides (L => LL, R => RR, U => UU, D => DD).
 */
function circleRule(
  kind: number,
  r: number,
  c: number,
  edgeFrom: (r: number, c: number, dr: number, dc: number) => number,
): CircleRule {
  const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // L, R, U, D
  const near = dirs.map(([dr, dc]) => edgeFrom(r, c, dr, dc));
  const far = dirs.map(([dr, dc], i) => (near[i] < 0 ? -1 : edgeFrom(r + dr, c + dc, dr, dc)));
  const slots = [...near, ...far]; // L R U D LL RR UU DD
  const edges = slots.filter((e) => e >= 0);
  const slotBit = slots.map((e) => (e < 0 ? -1 : edges.indexOf(e)));

  const tuples: number[] = [];
  for (let t = 0; t < 1 << edges.length; t++) {
    const val = (s: number) => slotBit[s] >= 0 && ((t >> slotBit[s]) & 1) === 1;
    const [L, R, U, D, LL, RR, UU, DD] = [0, 1, 2, 3, 4, 5, 6, 7].map(val);
    let ok: boolean;
    if (kind === WHITE) {
      ok = (L && R && !U && !D && !(LL && RR)) || (U && D && !L && !R && !(UU && DD));
    } else {
      ok = L !== R && U !== D && (!L || LL) && (!R || RR) && (!U || UU) && (!D || DD);
    }
    if (ok) tuples.push(t);
  }
  return { edges, tuples };
}


/**
 * Native CSP solver for Masyu (puzzle type 7), built like the Slitherlink model with the
 * loop moved from grid lines to cell centres. Variables are the edges between adjacent
 * cells, each OFF or ON. Propagated to a fixpoint on every assignment:
 *
 *  - Node rule: every cell has degree 0 or 2 (the loop may skip empty cells).
 *  - Circle rules: each circle's table (see `circleRule`), filtered against the decided
 *    edges; a value every surviving tuple agrees on is forced, no tuple left is dead.
 *  - Inside/outside 2-colouring over the faces between cell centres (`ParityDSU`).
 *  - Single-loop rule (`Paths`): an edge joining the two ends of one path would close a
 *    loop, so it is OFF unless that path is the only one and passes every circle; a
 *    closed loop must be the whole answer, which forces every other edge OFF.
 *  - Connectivity (`isConnectable`): circles and loop cells must stay mutually reachable
 *    over not-OFF edges, with no bridge between them. Without it probing left 770 edges
 *    of the 50x64 sample open and search found nothing in a minute; with it probing
 *    settles the whole board (about 2.5s).
 *
 * All are necessary conditions, so forcing is sound and the search stays complete; the
 * leaf check in `isSolved` confirms the ON edges form one loop. Construction ends with
 * failed-literal probing, as in Slitherlink, which settles typical boards before search.
 * Every structure is updated incrementally, since probing re-propagates once per edge.
 */
export class MasyuModel implements ConstraintModel<MasyuEdges> {
  private constructor(
    private readonly spec: Spec,
    private readonly state: Int8Array,
    private readonly dsu: ParityDSU,
    private readonly loops: Paths,
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: MasyuCanon): MasyuModel {
    const spec = buildSpec(canon);
    const state = new Int8Array(spec.edgeCount).fill(UNDECIDED);
    const model = new MasyuModel(spec, state, ParityDSU.create(spec.faceCount), Paths.create(spec.nodeCount), false);
    // A board one cell wide (or empty) has no edges, so no loop at all.
    if (spec.edgeCount === 0) return model.toDead();
    return model.propagate([], true).probe();
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    if (this.dead) return false;
    for (let e = 0; e < this.spec.edgeCount; e++) if (this.state[e] === UNDECIDED) return false;
    return isSingleLoop(this.spec, this.state);
  }

  selectBranch(): Branch | null {
    let best = -1;
    let bestScore = Infinity;
    for (let e = 0; e < this.spec.edgeCount; e++) {
      if (this.state[e] !== UNDECIDED) continue;
      const score = this.edgeScore(e);
      if (score < bestScore) {
        bestScore = score;
        best = e;
        if (score === 0) break;
      }
    }
    if (best === -1) return null;
    return { id: best, candidates: [ON, OFF] };
  }

  assign(id: number, value: number): ConstraintModel<MasyuEdges> {
    // Probing runs once, at construction (as in Slitherlink); every sample board is
    // settled there, so search nodes only propagate.
    return this.assignRaw(id, value);
  }

  private assignRaw(id: number, value: number): MasyuModel {
    if (this.state[id] !== UNDECIDED) return this.state[id] === value ? this : this.toDead();
    const state = Int8Array.from(this.state);
    state[id] = value;
    return new MasyuModel(this.spec, state, this.dsu.clone(), this.loops.clone(), false).propagate([id], false);
  }

  solution(): MasyuEdges {
    return edgeGrids(this.spec, this.state);
  }

  // -- propagation ------------------------------------------------------------

  /** Failed-literal probing to a fixpoint; see SlitherlinkModel.probe. */
  private probe(): MasyuModel {
    let m: MasyuModel = this;
    for (let changed = true; changed && !m.dead; ) {
      changed = false;
      for (let e = 0; e < m.spec.edgeCount && !m.dead; e++) {
        if (m.state[e] !== UNDECIDED) continue;
        const on = m.assignRaw(e, ON);
        if (on.dead) {
          m = m.assignRaw(e, OFF);
          changed = true;
          continue;
        }
        const off = m.assignRaw(e, OFF);
        if (off.dead) {
          m = on;
          changed = true;
        }
      }
    }
    return m;
  }

  private toDead(): MasyuModel {
    return new MasyuModel(this.spec, this.state, this.dsu, this.loops, true);
  }

  /**
   * Run every rule to a fixpoint, mutating this model's arrays in place (the caller copied
   * them). `seed` lists edges whose state just changed; `initial` first applies the node
   * and circle rules everywhere, since an all-undecided board still forces some edges (a
   * circle on the border, a corner cell).
   */
  private propagate(seed: number[], initial: boolean): MasyuModel {
    const { spec, state, dsu, loops } = this;
    const queue = [...seed];
    let qi = 0;
    const merged: number[] = [];
    // Path ends to check for a closing edge, and whether every path must be checked.
    const ends: number[] = [];
    let recheckAll = false;

    const force = (edge: number, value: number): boolean => {
      const cur = state[edge];
      if (cur === value) return true;
      if (cur !== UNDECIDED) return false;
      state[edge] = value;
      queue.push(edge);
      return true;
    };

    if (initial) {
      for (let n = 0; n < spec.nodeCount; n++) if (!this.applyNode(n, force)) return this.toDead();
      for (const rule of spec.rules) if (!this.applyRule(rule, force)) return this.toDead();
    }

    for (;;) {
      while (qi < queue.length) {
        const edge = queue[qi++];
        const [a, b] = spec.endpoints[edge];
        if (!this.applyNode(a, force)) return this.toDead();
        if (!this.applyNode(b, force)) return this.toDead();
        for (const rule of spec.rulesOfEdge[edge]) {
          if (!this.applyRule(rule, force)) return this.toDead();
        }
        const [fa, fb] = spec.facesOfEdge[edge];
        if (!dsu.relate(fa, fb, state[edge] === ON ? 1 : 0, merged)) return this.toDead();
        if (state[edge] === ON) {
          const wasOpen = loops.paths === 1 && loops.touched === spec.circles.length;
          const pathEnds = loops.add(a, b, spec.isCircle);
          if (pathEnds) ends.push(pathEnds[0]);
          // A second path appearing makes every existing path's closing edge illegal.
          if (wasOpen && loops.paths > 1) recheckAll = true;
        }
        // Faces -> edges: an edge whose two faces are now known same/opposite is forced.
        while (merged.length > 0) {
          for (const e of spec.edgesOfFace[merged.pop()!]) {
            if (state[e] !== UNDECIDED) continue;
            const [ga, gb] = spec.facesOfEdge[e];
            const rel = dsu.related(ga, gb);
            if (rel >= 0 && !force(e, rel === 1 ? ON : OFF)) return this.toDead();
          }
        }
      }
      if (!this.applyLoopRule(ends, recheckAll, force)) return this.toDead();
      ends.length = 0;
      recheckAll = false;
      if (qi < queue.length) continue;
      return isConnectable(spec, state, (x) => spec.isCircle[x] === 1 || loops.degree[x] > 0) ? this : this.toDead();
    }
  }

  /**
   * The single-loop rule. A closed cycle can never grow, so it must be the whole answer:
   * dead unless it is the only component and passes every circle, and then every other
   * edge is OFF. Otherwise an undecided edge joining the two ends of one path would close
   * it, so it is OFF unless that path is the only one and touches every circle already.
   * Checks the paths whose ends changed (`ends`), or every path when `all`.
   */
  private applyLoopRule(ends: number[], all: boolean, force: (e: number, v: number) => boolean): boolean {
    const { spec, state, loops } = this;
    if (loops.closed) {
      if (loops.paths !== 1 || loops.touched !== spec.circles.length) return false;
      for (let e = 0; e < spec.edgeCount; e++) if (state[e] === UNDECIDED && !force(e, OFF)) return false;
      return true;
    }
    if (loops.paths === 1 && loops.touched === spec.circles.length) return true;
    return forbidClosing(spec, state, loops, ends, all, force);
  }

  /** A cell's degree is 0 or 2. Returns false on contradiction. */
  private applyNode(node: number, force: (e: number, v: number) => boolean): boolean {
    const { state, spec } = this;
    const incident = spec.edgesOfNode[node];
    let on = 0;
    let undecided = 0;
    for (const e of incident) {
      if (state[e] === ON) on++;
      else if (state[e] === UNDECIDED) undecided++;
    }
    if (on > 2) return false;
    if (on === 2) {
      if (undecided > 0) for (const e of incident) if (state[e] === UNDECIDED && !force(e, OFF)) return false;
      return true;
    }
    if (on === 1) {
      if (undecided === 0) return false;
      if (undecided === 1) for (const e of incident) if (state[e] === UNDECIDED && !force(e, ON)) return false;
      return true;
    }
    if (undecided === 1) for (const e of incident) if (state[e] === UNDECIDED && !force(e, OFF)) return false;
    return true;
  }

  /** Filter a circle's table against the decided edges; force what all survivors agree on. */
  private applyRule(rule: CircleRule, force: (e: number, v: number) => boolean): boolean {
    const { state } = this;
    let fixedMask = 0;
    let fixedVal = 0;
    for (let i = 0; i < rule.edges.length; i++) {
      const s = state[rule.edges[i]];
      if (s === UNDECIDED) continue;
      fixedMask |= 1 << i;
      if (s === ON) fixedVal |= 1 << i;
    }
    let all = -1;
    let any = 0;
    let count = 0;
    for (const t of rule.tuples) {
      if ((t & fixedMask) !== fixedVal) continue;
      all &= t;
      any |= t;
      count++;
    }
    if (count === 0) return false;
    for (let i = 0; i < rule.edges.length; i++) {
      if (fixedMask & (1 << i)) continue;
      if (all & (1 << i)) {
        if (!force(rule.edges[i], ON)) return false;
      } else if (!(any & (1 << i))) {
        if (!force(rule.edges[i], OFF)) return false;
      }
    }
    return true;
  }

  // -- branch heuristic -------------------------------------------------------

  private edgeScore(edge: number): number {
    const { spec, state } = this;
    // An edge at a cell the loop already enters must be decided for the loop to go on.
    for (const node of spec.endpoints[edge]) if (this.loops.degree[node] === 1) return 0;
    let score = Infinity;
    for (const rule of spec.rulesOfEdge[edge]) {
      let undecided = 0;
      for (const e of rule.edges) if (state[e] === UNDECIDED) undecided++;
      score = Math.min(score, undecided);
    }
    return score === Infinity ? 10 : score;
  }
}
