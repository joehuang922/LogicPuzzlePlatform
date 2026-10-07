import { Branch, ConstraintModel } from "../../types";

/**
 * Canonical Slitherlink representation, mirroring the frontend `SlitherlinkCanon`.
 * `cells` is a rows x cols grid: -1 = empty (no clue), 0-3 = a clue stating how many of
 * that cell's 4 surrounding edges are part of the loop.
 */
export interface SlitherlinkCanon {
  cells: number[][];
}

/**
 * The solver's solution shape — the two edge grids of the frontend `SlitherlinkAnswer`.
 * `h` is (rows+1) x cols (horizontal segments on each grid-line row, borders included),
 * `v` is rows x (cols+1) (vertical segments on each grid-line col). Values are 0 (no
 * loop edge) or 1 (loop edge); the solver never emits crosses (2 is a player-only aid).
 */
export interface SlitherlinkEdges {
  h: number[][];
  v: number[][];
}

// Edge decision states. Edges are binary variables; UNDECIDED is "domain {OFF, ON}".
const UNDECIDED = -1;
const OFF = 0;
const ON = 1;

/**
 * Static per-puzzle metadata, shared by reference across all models of one puzzle so
 * `assign` only copies the mutable `state` array. Edges are indexed by opaque ids:
 * horizontal edge (r, c) -> r * cols + c for r in 0..rows, c in 0..cols-1; vertical edge
 * (r, c) -> hCount + r * (cols+1) + c for r in 0..rows-1, c in 0..cols. `edgesOfCell` and
 * `edgesOfDot` list the edge ids a clue cell / an intersection dot constrains, so
 * propagation can revisit just the edges a change can affect.
 */
interface Spec {
  rows: number;
  cols: number;
  hCount: number; // number of horizontal edge ids; vertical ids start here
  edgeCount: number;
  cells: number[][];
  /** For each dot (rows+1) x (cols+1): the ids of its 2-4 incident edges. */
  edgesOfDot: number[][];
  /** For each clued cell: { clue, edges: 4 ids (top, bottom, left, right) }. */
  clueCells: ClueCell[];
  /** Edge id -> the clue cells that border it (0-2 of them), for targeted propagation. */
  cluesOfEdge: ClueCell[][];
  /** Dot (r,c) that each edge connects, as [dotA, dotB] dot-ids (r*(cols+1)+c). */
  endpoints: [number, number][];
  /**
   * The two faces an edge separates, as [faceA, faceB] face-ids, for the inside/outside
   * 2-coloring propagator. A cell (r,c) is face r*cols+c; the single outer region is face
   * `outerFace`. An edge is ON iff its two faces have opposite colors (loop = inside/outside
   * boundary), OFF iff they share a colour.
   */
  facesOfEdge: [number, number][];
  faceCount: number; // rows*cols + 1 (the outer region)
  outerFace: number; // id of the outer region = rows*cols
}

interface ClueCell {
  clue: number;
  edges: number[];
}

function buildSpec(canon: SlitherlinkCanon): Spec {
  const cells = canon.cells;
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const hCount = (rows + 1) * cols;
  const vBase = hCount;
  const edgeCount = hCount + rows * (cols + 1);

  const hId = (r: number, c: number) => r * cols + c;
  const vId = (r: number, c: number) => vBase + r * (cols + 1) + c;
  const dotId = (r: number, c: number) => r * (cols + 1) + c;

  // Faces for the 2-coloring propagator: one per cell, plus a single outer region. A cell
  // coordinate outside the grid resolves to the outer face.
  const outerFace = rows * cols;
  const faceCount = rows * cols + 1;
  const faceId = (r: number, c: number) =>
    r < 0 || c < 0 || r >= rows || c >= cols ? outerFace : r * cols + c;

  // Endpoints of every edge, as dot ids. A horizontal edge (r,c) joins dots (r,c)-(r,c+1);
  // a vertical edge (r,c) joins dots (r,c)-(r+1,c).
  const endpoints: [number, number][] = new Array(edgeCount);
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) endpoints[hId(r, c)] = [dotId(r, c), dotId(r, c + 1)];
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) endpoints[vId(r, c)] = [dotId(r, c), dotId(r + 1, c)];
  }

  // Incident edges of every dot.
  const edgesOfDot: number[][] = Array.from({ length: (rows + 1) * (cols + 1) }, () => []);
  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = endpoints[e];
    edgesOfDot[a].push(e);
    edgesOfDot[b].push(e);
  }

  // The two faces each edge separates. Horizontal edge (r,c) lies between cell (r-1,c)
  // above and (r,c) below; vertical edge (r,c) between (r,c-1) left and (r,c) right.
  const facesOfEdge: [number, number][] = new Array(edgeCount);
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) facesOfEdge[hId(r, c)] = [faceId(r - 1, c), faceId(r, c)];
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) facesOfEdge[vId(r, c)] = [faceId(r, c - 1), faceId(r, c)];
  }

  // Clue cells with their 4 surrounding edges, plus the reverse edge -> clue-cells map.
  const clueCells: ClueCell[] = [];
  const cluesOfEdge: ClueCell[][] = Array.from({ length: edgeCount }, () => []);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const clue = cells[r][c];
      if (clue < 0) continue;
      const cell: ClueCell = {
        clue,
        edges: [hId(r, c), hId(r + 1, c), vId(r, c), vId(r, c + 1)], // top, bottom, left, right
      };
      clueCells.push(cell);
      for (const e of cell.edges) cluesOfEdge[e].push(cell);
    }
  }

  return {
    rows, cols, hCount, edgeCount, cells,
    edgesOfDot, clueCells, cluesOfEdge, endpoints,
    facesOfEdge, faceCount, outerFace,
  };
}

/**
 * Parity (relational) union-find over faces for the inside/outside 2-coloring argument.
 * Each face has a boolean colour (inside / outside the loop); the loop is exactly the
 * boundary between opposite colours, so every edge imposes a *relation* between its two
 * faces: OFF => same colour, ON => opposite colour. `relate(a, b, diff)` records such a
 * relation; it returns false when it contradicts what's already known (which makes the
 * branch dead). `related(a, b)` reports whether a relation is known yet and, if so, the
 * parity. `parity[x]` is x's colour relative to its root.
 *
 * The structure is immutable-by-copy at the model boundary: a model clones the arrays
 * before mutating, mirroring the edge `state` copy, so sibling search branches never alias.
 */
class ParityDSU {
  private constructor(
    private readonly parent: Int32Array,
    private readonly rank: Int32Array,
    private readonly parity: Uint8Array, // colour relative to parent (0 same, 1 opposite)
  ) {}

  static create(n: number): ParityDSU {
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    return new ParityDSU(parent, new Int32Array(n), new Uint8Array(n));
  }

  clone(): ParityDSU {
    return new ParityDSU(Int32Array.from(this.parent), Int32Array.from(this.rank), Uint8Array.from(this.parity));
  }

  /** Returns [root, parityToRoot] (0 same colour as root, 1 opposite) with path compression. */
  private find(x: number): [number, number] {
    let p = 0;
    let cur = x;
    const path: number[] = [];
    while (this.parent[cur] !== cur) {
      path.push(cur);
      p ^= this.parity[cur];
      cur = this.parent[cur];
    }
    // Compress: point every node on the path straight at the root, storing its absolute
    // parity to the root. `acc` is the parity of path[i] to the root as we descend.
    let acc = p;
    for (const node of path) {
      const par = this.parity[node];
      this.parent[node] = cur;
      this.parity[node] = acc;
      acc ^= par;
    }
    return [cur, p];
  }

  /**
   * If a and b are already in the same component, return their known parity (0 same colour,
   * 1 opposite); otherwise null.
   */
  related(a: number, b: number): 0 | 1 | null {
    const [ra, pa] = this.find(a);
    const [rb, pb] = this.find(b);
    if (ra !== rb) return null;
    return ((pa ^ pb) as 0 | 1);
  }

  /**
   * Record that a and b differ by `diff` (0 same colour, 1 opposite). Returns false on
   * contradiction with an existing relation (caller marks the model dead).
   */
  relate(a: number, b: number, diff: 0 | 1): boolean {
    const [ra, pa] = this.find(a);
    const [rb, pb] = this.find(b);
    if (ra === rb) return (pa ^ pb) === diff;
    // Union by rank; set the new child's parity so pa ^ newChildParity ^ pb === diff.
    const want = (pa ^ pb ^ diff) as 0 | 1;
    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
      this.parity[ra] = want;
    } else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra;
      this.parity[rb] = want;
    } else {
      this.parent[rb] = ra;
      this.parity[rb] = want;
      this.rank[ra]++;
    }
    return true;
  }
}

/**
 * Native CSP solver for Slitherlink (puzzle type 5). Variables are the grid-line edges,
 * each OFF or ON; the single loop is built by deciding every edge. Two local rules are
 * propagated to a fixpoint on every assignment:
 *
 *  - Clue rule: a clued cell must end with exactly `clue` of its 4 edges ON. If the ON
 *    count already exceeds the clue, or ON + still-UNDECIDED is below it, the branch is
 *    dead; when ON == clue the rest are forced OFF, and when ON + UNDECIDED == clue the
 *    UNDECIDED ones are forced ON.
 *  - Dot rule: every intersection must have degree 0 or 2 (a loop has no endpoints or
 *    branches). ON > 2 is dead; ON == 2 forces the rest OFF; a dangling ON == 1 with no
 *    room to pair up is dead, and ON == 1 with a single UNDECIDED left forces it ON.
 *
 * Both rules are necessary conditions, so forcing is sound and the search stays complete.
 * They don't catch a configuration that satisfies all clues and degrees yet splits into
 * several disjoint loops, so single-loop connectivity is verified once at the leaf in
 * `isSolved` (the same leaf-check strategy the LITS model uses for its global rules).
 *
 * The clue/dot rules alone bog down on large sparsely-clued boards (big unclued regions
 * give them nothing to force). To cut that, a third propagator runs the inside/outside
 * 2-coloring argument via a parity union-find over faces (see [[ParityDSU]]): the loop is
 * exactly the boundary between "inside" and "outside" the loop, so a decided edge pins its
 * two faces to the same colour (OFF) or opposite colours (ON) — and conversely, once two
 * faces are known same/opposite, the edge between them is forced OFF/ON. This both detects
 * contradictions early and forces many more edges, collapsing the search on real puzzles.
 */
export class SlitherlinkModel implements ConstraintModel<SlitherlinkEdges> {
  private constructor(
    private readonly spec: Spec,
    private readonly state: Int8Array, // edge id -> UNDECIDED | OFF | ON
    private readonly dsu: ParityDSU, // face 2-coloring relations
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: SlitherlinkCanon): SlitherlinkModel {
    const spec = buildSpec(canon);
    const state = new Int8Array(spec.edgeCount).fill(UNDECIDED);
    const dsu = ParityDSU.create(spec.faceCount);
    // Propagate from the initial (all-undecided) board: 0-clues force their edges off,
    // and border dangles get resolved, before any branching.
    const model = new SlitherlinkModel(spec, state, dsu, false);
    return model.propagateAll();
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    if (this.dead) return false;
    for (let e = 0; e < this.spec.edgeCount; e++) if (this.state[e] === UNDECIDED) return false;
    // Every edge decided and all clue/dot rules already hold (enforced on assign). The one
    // remaining global rule: the ON edges form exactly one connected loop.
    return this.isSingleLoop();
  }

  selectBranch(): Branch | null {
    // Branch on the UNDECIDED edge that is most constrained — the one touching the clue
    // cell or dot with the least remaining freedom — so forcing cascades fast. We score an
    // edge by the tightest "slots left" among the structures it belongs to (lower = better)
    // and tie-break toward edges adjacent to an already-ON edge, keeping the loop local.
    let best = -1;
    let bestScore = Infinity;
    for (let e = 0; e < this.spec.edgeCount; e++) {
      if (this.state[e] !== UNDECIDED) continue;
      const score = this.edgeScore(e);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best === -1) return null;
    // Try ON before OFF: committing to a loop edge drives clue/dot forcing harder than
    // leaving a gap, so solutions tend to surface earlier.
    return { id: best, candidates: [ON, OFF] };
  }

  assign(id: number, value: number): ConstraintModel<SlitherlinkEdges> {
    if (this.state[id] !== UNDECIDED) {
      // Reassigning a settled edge to the same value is a no-op; to a different value is a
      // contradiction. Branch candidates are always UNDECIDED, so this only guards misuse.
      return this.state[id] === value ? this : this.toDead();
    }
    const state = Int8Array.from(this.state);
    state[id] = value as -1 | 0 | 1;
    return new SlitherlinkModel(this.spec, state, this.dsu.clone(), false).propagateFrom([id]);
  }

  solution(): SlitherlinkEdges {
    const { rows, cols } = this.spec;
    const h: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols).fill(0));
    const v: number[][] = Array.from({ length: rows }, () => new Array<number>(cols + 1).fill(0));
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c < cols; c++) if (this.state[r * cols + c] === ON) h[r][c] = 1;
    }
    const vBase = this.spec.hCount;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c <= cols; c++) if (this.state[vBase + r * (cols + 1) + c] === ON) v[r][c] = 1;
    }
    return { h, v };
  }

  // -- propagation ------------------------------------------------------------

  private toDead(): SlitherlinkModel {
    return new SlitherlinkModel(this.spec, this.state, this.dsu, true);
  }

  /** Fixpoint propagation seeded by every edge (used once at construction). */
  private propagateAll(): SlitherlinkModel {
    const all: number[] = [];
    for (let e = 0; e < this.spec.edgeCount; e++) all.push(e);
    return this.propagateFrom(all);
  }

  /**
   * Enforce the clue and dot rules to a fixpoint, mutating `this.state` in place (the
   * caller already copied it). `seed` lists edges whose state just changed; we revisit the
   * clue cells and dots touching them, forcing edges and enqueuing the newly-forced ones,
   * until nothing changes or a contradiction makes the model dead.
   */
  private propagateFrom(seed: number[]): SlitherlinkModel {
    const { spec, state, dsu } = this;
    const queue = [...seed];
    let qi = 0;
    // Set whenever a face relation merges two components, so the next faces->edge scan runs.
    let colorDirty = false;

    const force = (edge: number, value: number): boolean => {
      // Returns false on contradiction (caller turns the model dead).
      const cur = state[edge];
      if (cur === value) return true;
      if (cur !== UNDECIDED) return false;
      state[edge] = value as -1 | 0 | 1;
      queue.push(edge);
      return true;
    };

    // Keep draining the worklist, then rescanning edges against the colour relations, until
    // neither produces a change. Each decided edge folds into the DSU (edge -> faces); the
    // rescan reads it back out (faces -> edge). Both are monotonic, so this terminates.
    for (;;) {
      while (qi < queue.length) {
        const edge = queue[qi++];
        const [dotA, dotB] = spec.endpoints[edge];
        if (!this.applyDot(dotA, force)) return this.toDead();
        if (!this.applyDot(dotB, force)) return this.toDead();
        // Re-check the (0-2) clue cells bordering this edge, via the precomputed reverse map.
        for (const cell of spec.cluesOfEdge[edge]) {
          if (!this.applyClue(cell, force)) return this.toDead();
        }
        // 2-coloring (edge -> faces): a decided edge pins its two faces to the same colour
        // (OFF) or opposite colours (ON). A contradiction with a known relation kills the
        // branch; a fresh merge means more edges may now be forceable.
        if (state[edge] !== UNDECIDED) {
          const [fa, fb] = spec.facesOfEdge[edge];
          const diff: 0 | 1 = state[edge] === ON ? 1 : 0;
          const before = dsu.related(fa, fb);
          if (!dsu.relate(fa, fb, diff)) return this.toDead();
          if (before === null) colorDirty = true;
        }
      }
      if (!colorDirty) break;
      colorDirty = false;
      // 2-coloring (faces -> edge): any undecided edge whose two faces are now known to be
      // same/opposite colour is forced OFF/ON. Forced edges re-enter the worklist above.
      for (let e = 0; e < spec.edgeCount; e++) {
        if (state[e] !== UNDECIDED) continue;
        const [fa, fb] = spec.facesOfEdge[e];
        const rel = dsu.related(fa, fb);
        if (rel !== null && !force(e, rel === 1 ? ON : OFF)) return this.toDead();
      }
    }
    // Premature-loop prune. A closed cycle among the ON edges can never grow — all its
    // dots are locked at degree 2 — so it must BE the final loop. The branch is therefore
    // dead unless that cycle is already the whole answer: the only ON component, with every
    // clue satisfied. (We must NOT also require all edges decided: at the moment the true
    // solution's loop closes, clue-free edges elsewhere may still be undecided and will be
    // forced off later — requiring them resolved here would wrongly kill valid solutions.)
    // Any surviving undecided edges are cleaned up by the search, and a stray second loop
    // is rejected at the leaf by isSingleLoop. This is what tames the search on big boards.
    if (this.prematureLoopDead()) return this.toDead();
    return this;
  }

  /**
   * Decide whether a prematurely-closed loop makes this branch dead. ON edges form a
   * disjoint union of simple paths and cycles (every dot has ON-degree <= 2 by the dot
   * rule); for a connected component a path has dots = edges + 1, a cycle has dots = edges.
   * We union-find the ON edges once, then tally edges and dots per component.
   *
   * A closed cycle (edges === dots) can never grow — its dots are locked at degree 2 — so
   * it must be the final loop. The branch is dead UNLESS that cycle is already the entire
   * answer: the only ON component, with every clue satisfied (any still-undecided edges
   * will be forced off, so they don't block completion). Returns true to kill the branch.
   */
  private prematureLoopDead(): boolean {
    const { spec, state } = this;
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root)!;
      while (parent.get(x) !== root) {
        const nxt = parent.get(x)!;
        parent.set(x, root);
        x = nxt;
      }
      return root;
    };
    const ensure = (x: number) => {
      if (!parent.has(x)) parent.set(x, x);
    };

    const onEdges: number[] = [];
    for (let e = 0; e < spec.edgeCount; e++) {
      if (state[e] !== ON) continue;
      onEdges.push(e);
      const [a, b] = spec.endpoints[e];
      ensure(a);
      ensure(b);
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    }
    if (onEdges.length === 0) return false;

    // Final-pass tallies, keyed by current root (stable now that merging is done).
    const edgesByRoot = new Map<number, number>();
    const dotsByRoot = new Map<number, number>();
    for (const e of onEdges) {
      const r = find(spec.endpoints[e][0]);
      edgesByRoot.set(r, (edgesByRoot.get(r) ?? 0) + 1);
    }
    for (const dot of parent.keys()) {
      const r = find(dot);
      dotsByRoot.set(r, (dotsByRoot.get(r) ?? 0) + 1);
    }

    let hasCycle = false;
    for (const [root, edges] of edgesByRoot) {
      if (edges === (dotsByRoot.get(root) ?? 0)) hasCycle = true;
    }
    if (!hasCycle) return false;

    // A cycle exists. It's acceptable only as the whole, finished answer.
    const singleComponent = edgesByRoot.size === 1;
    return !(singleComponent && this.allCluesSatisfied());
  }

  private allCluesSatisfied(): boolean {
    const { state, spec } = this;
    for (const cell of spec.clueCells) {
      let on = 0;
      for (const e of cell.edges) if (state[e] === ON) on++;
      if (on !== cell.clue) return false;
    }
    return true;
  }

  /** Enforce a clue cell's exact-count rule; returns false on contradiction. */
  private applyClue(cell: { clue: number; edges: number[] }, force: (e: number, v: number) => boolean): boolean {
    const { state } = this;
    let on = 0;
    let undecided = 0;
    for (const e of cell.edges) {
      if (state[e] === ON) on++;
      else if (state[e] === UNDECIDED) undecided++;
    }
    if (on > cell.clue) return false;
    if (on + undecided < cell.clue) return false;
    if (on === cell.clue && undecided > 0) {
      for (const e of cell.edges) if (state[e] === UNDECIDED && !force(e, OFF)) return false;
    } else if (on + undecided === cell.clue && undecided > 0) {
      for (const e of cell.edges) if (state[e] === UNDECIDED && !force(e, ON)) return false;
    }
    return true;
  }

  /** Enforce a dot's degree-0-or-2 rule; returns false on contradiction. */
  private applyDot(dot: number, force: (e: number, v: number) => boolean): boolean {
    const { state, spec } = this;
    const incident = spec.edgesOfDot[dot];
    let on = 0;
    let undecided = 0;
    for (const e of incident) {
      if (state[e] === ON) on++;
      else if (state[e] === UNDECIDED) undecided++;
    }
    if (on > 2) return false;
    if (on === 2) {
      // Degree complete: all remaining incident edges are off.
      if (undecided > 0) for (const e of incident) if (state[e] === UNDECIDED && !force(e, OFF)) return false;
      return true;
    }
    if (on === 1) {
      if (undecided === 0) return false; // a dangling line with no way to continue
      if (undecided === 1) for (const e of incident) if (state[e] === UNDECIDED && !force(e, ON)) return false;
      return true;
    }
    // on === 0: a single remaining undecided edge would be forced to degree 1, impossible.
    if (undecided === 1) for (const e of incident) if (state[e] === UNDECIDED && !force(e, OFF)) return false;
    return true;
  }

  // -- branch heuristic -------------------------------------------------------

  private edgeScore(edge: number): number {
    const { spec, state } = this;
    // Prefer edges at a dot that already has one ON edge (degree 1): the loop must
    // continue through such a dot, so these are the most forcing choices.
    for (const dot of spec.endpoints[edge]) {
      let on = 0;
      for (const e of spec.edgesOfDot[dot]) if (state[e] === ON) on++;
      if (on === 1) return 0;
    }
    // Otherwise, tightness = fewest UNDECIDED edges left on a clue cell this edge borders
    // (an unclued edge falls back to its dot's incident count, always >= clue tightness).
    let score = Infinity;
    for (const cell of spec.cluesOfEdge[edge]) {
      let undecided = 0;
      for (const e of cell.edges) if (state[e] === UNDECIDED) undecided++;
      score = Math.min(score, undecided);
    }
    return score === Infinity ? spec.edgesOfDot[spec.endpoints[edge][0]].length : score;
  }

  // -- leaf connectivity ------------------------------------------------------

  /** True when the ON edges form exactly one connected closed loop (no extra components). */
  private isSingleLoop(): boolean {
    const { spec, state } = this;
    // Collect ON edges and the degree-2 dots they touch.
    const onEdges: number[] = [];
    for (let e = 0; e < spec.edgeCount; e++) if (state[e] === ON) onEdges.push(e);
    if (onEdges.length === 0) return false;

    // Dot ids that participate in the loop (degree 2 by the dot rule, already enforced).
    const loopDots = new Set<number>();
    for (const e of onEdges) {
      const [a, b] = spec.endpoints[e];
      loopDots.add(a);
      loopDots.add(b);
    }

    // Adjacency over ON edges: walk from one dot to its loop-neighbours.
    const neighbours = new Map<number, number[]>();
    for (const e of onEdges) {
      const [a, b] = spec.endpoints[e];
      (neighbours.get(a) ?? neighbours.set(a, []).get(a)!).push(b);
      (neighbours.get(b) ?? neighbours.set(b, []).get(b)!).push(a);
    }

    const start = onEdges.length ? spec.endpoints[onEdges[0]][0] : -1;
    const seen = new Set<number>([start]);
    const stack = [start];
    while (stack.length) {
      const dot = stack.pop()!;
      for (const next of neighbours.get(dot) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    // Single loop iff the walk reached every loop dot.
    return seen.size === loopDots.size;
  }
}
