import { Branch, ConstraintModel } from "../../types";

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

// Edge decision states. Edges are binary variables; UNDECIDED is "domain {OFF, ON}".
const UNDECIDED = -1;
const OFF = 0;
const ON = 1;

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
 * `assign` only copies the mutable state. Nodes are cells (r * cols + c); edges join
 * orthogonally adjacent cells: horizontal (r,c)-(r,c+1) has id r * (cols-1) + c, vertical
 * (r,c)-(r+1,c) has id hCount + r * cols + c.
 */
interface Spec {
  rows: number;
  cols: number;
  hCount: number;
  edgeCount: number;
  nodeCount: number;
  /** Edge id -> the two cells it joins. */
  endpoints: [number, number][];
  /** Cell id -> its 2-4 incident edge ids. */
  edgesOfNode: number[][];
  /** Cell ids holding a circle. */
  circles: number[];
  rules: CircleRule[];
  /** Edge id -> the circle rules that read it. */
  rulesOfEdge: CircleRule[][];
  /**
   * The two faces an edge separates, for the inside/outside 2-colouring. Faces are the
   * (rows-1) x (cols-1) unit squares between cell centres, plus one outer region.
   */
  facesOfEdge: [number, number][];
  /** Face id -> the edges on its boundary, to re-check after its colour class grows. */
  edgesOfFace: number[][];
  faceCount: number;
  /** Cell id -> 1 when it holds a circle. */
  isCircle: Uint8Array;
}

function buildSpec(canon: MasyuCanon): Spec {
  const cells = canon.cells;
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const hCount = rows * Math.max(cols - 1, 0);
  const edgeCount = hCount + Math.max(rows - 1, 0) * cols;
  const nodeCount = rows * cols;

  const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols;
  const hId = (r: number, c: number) => r * (cols - 1) + c;
  const vId = (r: number, c: number) => hCount + r * cols + c;
  const nodeId = (r: number, c: number) => r * cols + c;

  // The edge leaving cell (r,c) in direction (dr,dc), or -1 when it would leave the grid.
  const edgeFrom = (r: number, c: number, dr: number, dc: number): number => {
    const r2 = r + dr;
    const c2 = c + dc;
    if (!inside(r, c) || !inside(r2, c2)) return -1;
    if (dr === 0) return hId(r, Math.min(c, c2));
    return vId(Math.min(r, r2), c);
  };

  const faceRows = rows - 1;
  const faceCols = cols - 1;
  const outerFace = Math.max(faceRows, 0) * Math.max(faceCols, 0);
  const faceId = (i: number, j: number) =>
    i < 0 || j < 0 || i >= faceRows || j >= faceCols ? outerFace : i * faceCols + j;

  const endpoints: [number, number][] = new Array(edgeCount);
  const facesOfEdge: [number, number][] = new Array(edgeCount);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      endpoints[hId(r, c)] = [nodeId(r, c), nodeId(r, c + 1)];
      facesOfEdge[hId(r, c)] = [faceId(r - 1, c), faceId(r, c)];
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      endpoints[vId(r, c)] = [nodeId(r, c), nodeId(r + 1, c)];
      facesOfEdge[vId(r, c)] = [faceId(r, c - 1), faceId(r, c)];
    }
  }

  const edgesOfNode: number[][] = Array.from({ length: nodeCount }, () => []);
  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = endpoints[e];
    edgesOfNode[a].push(e);
    edgesOfNode[b].push(e);
  }

  const circles: number[] = [];
  const rules: CircleRule[] = [];
  const rulesOfEdge: CircleRule[][] = Array.from({ length: edgeCount }, () => []);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const kind = cells[r][c];
      if (kind !== WHITE && kind !== BLACK) continue;
      circles.push(nodeId(r, c));
      const rule = circleRule(kind, r, c, edgeFrom);
      rules.push(rule);
      for (const e of rule.edges) rulesOfEdge[e].push(rule);
    }
  }

  const faceCount = outerFace + 1;
  const edgesOfFace: number[][] = Array.from({ length: faceCount }, () => []);
  for (let e = 0; e < edgeCount; e++) {
    const [fa, fb] = facesOfEdge[e];
    edgesOfFace[fa].push(e);
    if (fb !== fa) edgesOfFace[fb].push(e);
  }
  const isCircle = new Uint8Array(nodeCount);
  for (const c of circles) isCircle[c] = 1;

  return {
    rows, cols, hCount, edgeCount, nodeCount,
    endpoints, edgesOfNode, circles, rules, rulesOfEdge,
    facesOfEdge, edgesOfFace, faceCount, isCircle,
  };
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
 * Parity (relational) union-find over faces for the inside/outside 2-colouring argument,
 * as in Slitherlink. Each face is inside or outside the loop, and the loop is exactly the
 * boundary between the two, so an OFF edge joins same-coloured faces and an ON edge
 * opposite-coloured ones.
 *
 * Unlike Slitherlink's, each class also keeps its members on a circular linked list
 * (`next`), and `relate` reports the members of the smaller class it merged. Only edges
 * touching those faces can have just become decidable, so propagation re-checks those
 * instead of rescanning every edge after each merge (the rescan dominated large boards).
 * Copied at the model boundary so sibling search branches never alias.
 */
class ParityDSU {
  private constructor(
    private readonly parent: Int32Array,
    private readonly size: Int32Array,
    private readonly parity: Uint8Array, // colour relative to parent (0 same, 1 opposite)
    private readonly next: Int32Array, // circular member list of each class
  ) {}

  static create(n: number): ParityDSU {
    const parent = new Int32Array(n);
    const next = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      parent[i] = i;
      next[i] = i;
    }
    return new ParityDSU(parent, new Int32Array(n).fill(1), new Uint8Array(n), next);
  }

  clone(): ParityDSU {
    return new ParityDSU(
      Int32Array.from(this.parent),
      Int32Array.from(this.size),
      Uint8Array.from(this.parity),
      Int32Array.from(this.next),
    );
  }

  /** Root of x, compressing the path. Read x's parity to it with `parityOf` after. */
  private find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    // Second pass: point every node on the path at the root with its absolute parity.
    // Collect the parities top-down by walking once more from x.
    let p = 0;
    for (let cur = x; cur !== root; cur = this.parent[cur]) p ^= this.parity[cur];
    let cur = x;
    while (cur !== root) {
      const up = this.parent[cur];
      const par = this.parity[cur];
      this.parent[cur] = root;
      this.parity[cur] = p;
      p ^= par;
      cur = up;
    }
    return root;
  }

  /** Known parity of a vs b (0 same colour, 1 opposite), or -1 when unrelated. */
  related(a: number, b: number): number {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) return -1;
    // After find, a and b point straight at the root (or are it).
    return this.parity[a] ^ this.parity[b];
  }

  /**
   * Record that a and b differ by `diff`. Returns false on a contradiction. On a merge,
   * pushes the members of the smaller class onto `merged`.
   */
  relate(a: number, b: number, diff: number, merged: number[]): boolean {
    let ra = this.find(a);
    let rb = this.find(b);
    const pa = ra === a ? 0 : this.parity[a];
    const pb = rb === b ? 0 : this.parity[b];
    if (ra === rb) return (pa ^ pb) === diff;
    if (this.size[ra] < this.size[rb]) [ra, rb] = [rb, ra];
    // rb (smaller) goes under ra; its parity makes pa ^ p(rb) ^ pb === diff.
    this.parent[rb] = ra;
    this.parity[rb] = pa ^ pb ^ diff;
    this.size[ra] += this.size[rb];
    let m = rb;
    do {
      merged.push(m);
      m = this.next[m];
    } while (m !== rb);
    const t = this.next[ra];
    this.next[ra] = this.next[rb];
    this.next[rb] = t;
    return true;
  }
}

/**
 * The ON edges so far form simple paths (and at most one closed cycle, which must then be
 * the answer), since the node rule caps every degree at 2. Tracked incrementally, as an
 * edge turns ON, rather than recomputed: `mate[x]` is the other end of the path x ends
 * (-1 when x is not an end), `paths` counts components, `touched` counts circles on them.
 */
class Paths {
  constructor(
    readonly degree: Uint8Array,
    readonly mate: Int32Array,
    public paths: number,
    public touched: number,
    public closed: boolean,
  ) {}

  static create(n: number): Paths {
    return new Paths(new Uint8Array(n), new Int32Array(n).fill(-1), 0, 0, false);
  }

  clone(): Paths {
    return new Paths(Uint8Array.from(this.degree), Int32Array.from(this.mate), this.paths, this.touched, this.closed);
  }

  /**
   * Add the ON edge a-b. Returns the two ends of the path it now belongs to, or null when
   * it closed a cycle or broke the degree rule (the node rule reports that one).
   */
  add(a: number, b: number, isCircle: Uint8Array): [number, number] | null {
    const { degree, mate } = this;
    if (degree[a] >= 2 || degree[b] >= 2 || this.closed) {
      // A branch (the node rule kills it) or an edge beyond a closed loop: count it as a
      // further component so the loop rule sees more than one.
      degree[a]++;
      degree[b]++;
      this.paths++;
      return null;
    }
    for (const x of [a, b]) if (degree[x] === 0 && isCircle[x]) this.touched++;
    const da = degree[a]++;
    const db = degree[b]++;
    if (da === 0 && db === 0) {
      mate[a] = b;
      mate[b] = a;
      this.paths++;
      return [a, b];
    }
    if (da === 1 && db === 1) {
      if (mate[a] === b) {
        mate[a] = mate[b] = -1;
        this.closed = true;
        return null;
      }
      const x = mate[a];
      const y = mate[b];
      mate[a] = mate[b] = -1;
      mate[x] = y;
      mate[y] = x;
      this.paths--;
      return [x, y];
    }
    // One end extends: the old end (degree 1 before) passes its mate to the new node.
    const [old, fresh] = da === 1 ? [a, b] : [b, a];
    const x = mate[old];
    mate[old] = -1;
    mate[x] = fresh;
    mate[fresh] = x;
    return [x, fresh];
  }
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
    return this.isSingleLoop();
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
    const { rows, cols, hCount } = this.spec;
    const h = Array.from({ length: rows }, () => new Array<number>(Math.max(cols - 1, 0)).fill(0));
    const v = Array.from({ length: Math.max(rows - 1, 0) }, () => new Array<number>(cols).fill(0));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) if (this.state[r * (cols - 1) + c] === ON) h[r][c] = 1;
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) if (this.state[hCount + r * cols + c] === ON) v[r][c] = 1;
    }
    return { h, v };
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
      return this.isConnectable() ? this : this.toDead();
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
    const check = (x: number): boolean => {
      const y = loops.mate[x];
      if (y < 0) return true;
      for (const e of spec.edgesOfNode[x]) {
        if (state[e] !== UNDECIDED) continue;
        const [a, b] = spec.endpoints[e];
        if ((a === y || b === y) && !force(e, OFF)) return false;
      }
      return true;
    };
    if (all) {
      for (let x = 0; x < spec.nodeCount; x++) if (!check(x)) return false;
    } else {
      for (const x of ends) if (!check(x)) return false;
    }
    return true;
  }

  /**
   * Connectivity: every circle and every cell already on the loop must lie in one
   * component of the graph of not-OFF edges, and no single edge of it (a bridge) may
   * separate two of them, since a loop crosses every cut that splits it an even number of
   * times, so at least twice. One iterative Tarjan pass over the not-OFF graph.
   */
  private isConnectable(): boolean {
    const { spec, state, loops } = this;
    const n = spec.nodeCount;
    const required = (x: number) => spec.isCircle[x] === 1 || loops.degree[x] > 0;
    let total = 0;
    let root = -1;
    for (let x = 0; x < n; x++) {
      if (required(x)) {
        total++;
        if (root < 0) root = x;
      }
    }
    if (total <= 1) return true;

    const disc = new Int32Array(n).fill(-1);
    const low = new Int32Array(n);
    const below = new Int32Array(n); // required cells in the DFS subtree
    const parentEdge = new Int32Array(n).fill(-1);
    const iter = new Int32Array(n);
    const stack = new Int32Array(n);
    let sp = 0;
    let time = 0;
    disc[root] = low[root] = time++;
    below[root] = 1;
    stack[sp++] = root;
    while (sp > 0) {
      const x = stack[sp - 1];
      const incident = spec.edgesOfNode[x];
      if (iter[x] < incident.length) {
        const e = incident[iter[x]++];
        if (state[e] === OFF || e === parentEdge[x]) continue;
        const [a, b] = spec.endpoints[e];
        const y = a === x ? b : a;
        if (disc[y] < 0) {
          disc[y] = low[y] = time++;
          below[y] = required(y) ? 1 : 0;
          parentEdge[y] = e;
          stack[sp++] = y;
        } else if (disc[y] < low[x]) {
          low[x] = disc[y];
        }
        continue;
      }
      sp--;
      if (sp > 0) {
        const p = stack[sp - 1];
        if (low[x] < low[p]) low[p] = low[x];
        below[p] += below[x];
        // x's subtree hangs off p by a bridge: it must hold all or none of the required.
        if (low[x] > disc[p] && below[x] > 0 && below[x] < total) return false;
      }
    }
    return below[root] === total;
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

  // -- leaf connectivity ------------------------------------------------------

  /** True when the ON edges form exactly one connected loop. */
  private isSingleLoop(): boolean {
    const { spec, state } = this;
    const adj: number[][] = Array.from({ length: spec.nodeCount }, () => []);
    let start = -1;
    let loopNodes = 0;
    for (let e = 0; e < spec.edgeCount; e++) {
      if (state[e] !== ON) continue;
      const [a, b] = spec.endpoints[e];
      if (adj[a].length === 0) loopNodes++;
      if (adj[b].length === 0) loopNodes++;
      adj[a].push(b);
      adj[b].push(a);
      start = a;
    }
    if (start < 0) return false;
    const seen = new Uint8Array(spec.nodeCount);
    seen[start] = 1;
    const stack = [start];
    let reached = 1;
    while (stack.length) {
      const x = stack.pop()!;
      for (const y of adj[x]) {
        if (!seen[y]) {
          seen[y] = 1;
          reached++;
          stack.push(y);
        }
      }
    }
    return reached === loopNodes;
  }
}
