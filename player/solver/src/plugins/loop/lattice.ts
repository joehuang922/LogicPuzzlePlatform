/**
 * Shared machinery for loop puzzles whose loop runs through cell centres (Masyu,
 * Yajilin): the edge lattice between adjacent cells, the inside/outside colouring, the
 * incrementally tracked paths of ON edges and the connectivity rule. Each model keeps its
 * edge states in the first `edgeCount` slots of its own state array (UNDECIDED / OFF /
 * ON); anything else it decides (Yajilin's shaded cells) goes after them.
 */

export const UNDECIDED = -1;
export const OFF = 0;
export const ON = 1;

/**
 * The static lattice of a rows x cols board. Nodes are cells (r * cols + c); edges join
 * orthogonally adjacent cells: horizontal (r,c)-(r,c+1) has id r * (cols-1) + c, vertical
 * (r,c)-(r+1,c) has id hCount + r * cols + c. Faces, for the colouring, are the
 * (rows-1) x (cols-1) unit squares between cell centres plus one outer region.
 */
export interface Lattice {
  rows: number;
  cols: number;
  hCount: number;
  edgeCount: number;
  nodeCount: number;
  /** Edge id -> the two cells it joins. */
  endpoints: [number, number][];
  /** Cell id -> its 2-4 incident edge ids. */
  edgesOfNode: number[][];
  /** Edge id -> the two faces it separates. */
  facesOfEdge: [number, number][];
  /** Face id -> the edges on its boundary, to re-check after its colour class grows. */
  edgesOfFace: number[][];
  faceCount: number;
  /** The edge leaving cell (r,c) in direction (dr,dc), or -1 when it would leave the grid. */
  edgeFrom(r: number, c: number, dr: number, dc: number): number;
}

export function buildLattice(rows: number, cols: number): Lattice {
  const hCount = rows * Math.max(cols - 1, 0);
  const edgeCount = hCount + Math.max(rows - 1, 0) * cols;
  const nodeCount = rows * cols;

  const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols;
  const hId = (r: number, c: number) => r * (cols - 1) + c;
  const vId = (r: number, c: number) => hCount + r * cols + c;
  const nodeId = (r: number, c: number) => r * cols + c;
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

  const faceCount = outerFace + 1;
  const edgesOfFace: number[][] = Array.from({ length: faceCount }, () => []);
  for (let e = 0; e < edgeCount; e++) {
    const [fa, fb] = facesOfEdge[e];
    edgesOfFace[fa].push(e);
    if (fb !== fa) edgesOfFace[fb].push(e);
  }

  return { rows, cols, hCount, edgeCount, nodeCount, endpoints, edgesOfNode, facesOfEdge, edgesOfFace, faceCount, edgeFrom };
}

/** The ON edges of `state` as the `{ h, v }` grids the answers use (h: rows x (cols-1)). */
export function edgeGrids(lat: Lattice, state: Int8Array): { h: number[][]; v: number[][] } {
  const { rows, cols, hCount } = lat;
  const h = Array.from({ length: rows }, () => new Array<number>(Math.max(cols - 1, 0)).fill(0));
  const v = Array.from({ length: Math.max(rows - 1, 0) }, () => new Array<number>(cols).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) if (state[r * (cols - 1) + c] === ON) h[r][c] = 1;
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) if (state[hCount + r * cols + c] === ON) v[r][c] = 1;
  }
  return { h, v };
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
export class ParityDSU {
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

  /** Root of x; afterwards x points straight at it with its parity to the root. */
  private find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
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
    return this.parity[a] ^ this.parity[b]; // a root's own parity stays 0
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
 * the answer), since every cell's degree is capped at 2. Tracked incrementally, as an edge
 * turns ON, rather than recomputed: `mate[x]` is the other end of the path x ends (-1 when
 * x is not an end), `paths` counts components, `touched` counts `mark`ed cells on them.
 */
export class Paths {
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
   * it closed a cycle or broke the degree rule (the model's node rule reports that one).
   */
  add(a: number, b: number, mark: Uint8Array): [number, number] | null {
    const { degree, mate } = this;
    if (degree[a] >= 2 || degree[b] >= 2 || this.closed) {
      // A branch, or an edge beyond a closed loop: count it as a further component so the
      // loop rule sees more than one.
      degree[a]++;
      degree[b]++;
      this.paths++;
      return null;
    }
    for (const x of [a, b]) if (degree[x] === 0 && mark[x]) this.touched++;
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
    // One end extends: the old end passes its mate to the new node.
    const [old, fresh] = da === 1 ? [a, b] : [b, a];
    const x = mate[old];
    mate[old] = -1;
    mate[x] = fresh;
    mate[fresh] = x;
    return [x, fresh];
  }
}

/**
 * Force OFF every undecided edge that would close a path into a loop, for the paths ending
 * at `ends` (or every path when `all`). Callers skip this while closing could still finish
 * the puzzle. Returns false on a contradiction.
 */
export function forbidClosing(
  lat: Lattice,
  state: Int8Array,
  loops: Paths,
  ends: number[],
  all: boolean,
  force: (e: number, v: number) => boolean,
): boolean {
  const check = (x: number): boolean => {
    const y = loops.mate[x];
    if (y < 0) return true;
    for (const e of lat.edgesOfNode[x]) {
      if (state[e] !== UNDECIDED) continue;
      const [a, b] = lat.endpoints[e];
      if ((a === y || b === y) && !force(e, OFF)) return false;
    }
    return true;
  };
  if (all) {
    for (let x = 0; x < lat.nodeCount; x++) if (!check(x)) return false;
  } else {
    for (const x of ends) if (!check(x)) return false;
  }
  return true;
}

/**
 * Connectivity: every `required` cell (one the loop must visit) must lie in one component
 * of the graph of not-OFF edges, and no single edge of it (a bridge) may separate two of
 * them, since a loop crosses every cut that splits it an even number of times, so at
 * least twice. One iterative Tarjan pass over the not-OFF graph.
 */
export function isConnectable(lat: Lattice, state: Int8Array, required: (x: number) => boolean): boolean {
  const n = lat.nodeCount;
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
    const incident = lat.edgesOfNode[x];
    if (iter[x] < incident.length) {
      const e = incident[iter[x]++];
      if (state[e] === OFF || e === parentEdge[x]) continue;
      const [a, b] = lat.endpoints[e];
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

/** True when the ON edges form exactly one connected loop (a leaf check). */
export function isSingleLoop(lat: Lattice, state: Int8Array): boolean {
  const adj: number[][] = Array.from({ length: lat.nodeCount }, () => []);
  let start = -1;
  let loopNodes = 0;
  for (let e = 0; e < lat.edgeCount; e++) {
    if (state[e] !== ON) continue;
    const [a, b] = lat.endpoints[e];
    if (adj[a].length === 0) loopNodes++;
    if (adj[b].length === 0) loopNodes++;
    adj[a].push(b);
    adj[b].push(a);
    start = a;
  }
  if (start < 0) return false;
  const seen = new Uint8Array(lat.nodeCount);
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
