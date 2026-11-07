import { Branch, ConstraintModel } from "../../types";

/**
 * Canonical Nurimaze (docs/nurimaze): cells 0 empty, 1 circle, 2 triangle, 3 S, 4 G;
 * thick walls split the grid into rooms. Each room is painted black or left white
 * (a room with a symbol is always white). Rules: no 2x2 of one colour; the white cells
 * are connected and form no loop (a tree, so the S -> G route is unique); that route
 * passes every circle and no triangle.
 *
 * The path checks are written for "every shortest path" (with no loops there is only
 * one path, so this is the same rule; it also keeps the bounds on partial boards sound).
 */
export interface NurimazeCanon {
  cells: number[][];
  grids: { h: number[][]; v: number[][] };
}

const UNKNOWN = -1;
const BLACK = 0;
const WHITE = 1;

const CIRCLE = 1;
const TRIANGLE = 2;
const START = 3;
const GOAL = 4;

/** Where propagation found the board impossible, for the diagnosis report. */
export interface Contradiction {
  rule: "2x2" | "connectivity" | "loop" | "path";
  /** Cells (row, col) the contradiction is about. */
  cells: [number, number][];
  detail: string;
}

/** The static structure shared by every model in a search. */
export class Layout {
  readonly rows: number;
  readonly cols: number;
  /** Room id per cell (row * cols + col). */
  readonly roomOf: Int32Array;
  readonly roomCells: number[][];
  /** Each 2x2 window: its top-left cell and the distinct rooms it touches. */
  readonly windows: { cell: number; rooms: number[] }[];
  /** Per room, the windows touching it. */
  readonly roomWindows: number[][];
  /** Rooms whose own cells hold a loop (a 2x2 or a ring): never white. */
  readonly roomCyclic: boolean[];
  /** Rooms holding a symbol: always white. */
  readonly forcedWhite: Set<number>;
  /** Per cell, its orthogonal neighbours. */
  readonly adj: number[][];
  /** Per room, the rooms sharing an edge with it. */
  readonly roomAdj: number[][];
  /** Neighbour of cell x in direction d (0 up, 1 down, 2 left, 3 right; d ^ 1 is the
   * opposite), or -1 off the board: nbr[x * 4 + d]. */
  readonly nbr: Int32Array;
  readonly flow: FlowScratch;
  readonly start: number;
  readonly goal: number;
  readonly circles: number[];
  readonly triangles: number[];

  constructor(canon: NurimazeCanon) {
    const rows = (this.rows = canon.cells.length);
    const cols = (this.cols = canon.cells[0]?.length ?? 0);
    const { h, v } = canon.grids;
    const n = rows * cols;
    this.adj = Array.from({ length: n }, () => []);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = r * cols + c;
        if (r + 1 < rows) this.adj[id].push(id + cols), this.adj[id + cols].push(id);
        if (c + 1 < cols) this.adj[id].push(id + 1), this.adj[id + 1].push(id);
      }
    }
    // Rooms: flood fill across thin borders.
    const roomOf = (this.roomOf = new Int32Array(n).fill(-1));
    this.roomCells = [];
    for (let start = 0; start < n; start++) {
      if (roomOf[start] >= 0) continue;
      const room = this.roomCells.length;
      const cells = [start];
      roomOf[start] = room;
      for (let i = 0; i < cells.length; i++) {
        const id = cells[i];
        const r = Math.floor(id / cols);
        const c = id % cols;
        const open: [boolean, number][] = [
          [r > 0 && !h[r - 1]?.[c], id - cols],
          [r + 1 < rows && !h[r]?.[c], id + cols],
          [c > 0 && !v[r]?.[c - 1], id - 1],
          [c + 1 < cols && !v[r]?.[c], id + 1],
        ];
        for (const [ok, next] of open) {
          if (ok && roomOf[next] < 0) {
            roomOf[next] = room;
            cells.push(next);
          }
        }
      }
      this.roomCells.push(cells);
    }
    // A connected room is loop-free exactly when it has one edge fewer than cells.
    this.roomCyclic = this.roomCells.map((cells) => {
      let edges = 0;
      for (const id of cells) for (const nb of this.adj[id]) if (nb > id && roomOf[nb] === roomOf[id]) edges++;
      return edges >= cells.length;
    });
    this.windows = [];
    this.roomWindows = this.roomCells.map(() => []);
    for (let r = 0; r + 1 < rows; r++) {
      for (let c = 0; c + 1 < cols; c++) {
        const id = r * cols + c;
        const rooms = [...new Set([id, id + 1, id + cols, id + cols + 1].map((x) => roomOf[x]))];
        for (const room of rooms) this.roomWindows[room].push(this.windows.length);
        this.windows.push({ cell: id, rooms });
      }
    }
    this.forcedWhite = new Set();
    this.circles = [];
    this.triangles = [];
    let s = -1;
    let g = -1;
    for (let id = 0; id < n; id++) {
      const sym = canon.cells[Math.floor(id / cols)][id % cols];
      if (!sym) continue;
      this.forcedWhite.add(roomOf[id]);
      if (sym === CIRCLE) this.circles.push(id);
      else if (sym === TRIANGLE) this.triangles.push(id);
      else if (sym === START) s = id;
      else if (sym === GOAL) g = id;
    }
    this.nbr = new Int32Array(n * 4).fill(-1);
    for (let id = 0; id < n; id++) {
      const r = Math.floor(id / cols);
      const c = id % cols;
      if (r > 0) this.nbr[id * 4] = id - cols;
      if (r + 1 < rows) this.nbr[id * 4 + 1] = id + cols;
      if (c > 0) this.nbr[id * 4 + 2] = id - 1;
      if (c + 1 < cols) this.nbr[id * 4 + 3] = id + 1;
    }
    this.flow = new FlowScratch(n);
    this.roomAdj = this.roomCells.map((cells, room) => {
      const set = new Set<number>();
      for (const id of cells) for (const nb of this.adj[id]) if (roomOf[nb] !== room) set.add(roomOf[nb]);
      return [...set];
    });
    this.start = s;
    this.goal = g;
  }

  /** The direction d with nbr[x * 4 + d] === y. */
  dirTo(x: number, y: number): number {
    for (let d = 0; d < 4; d++) if (this.nbr[x * 4 + d] === y) return d;
    return -1;
  }

  rc(id: number): [number, number] {
    return [Math.floor(id / this.cols), id % this.cols];
  }
}

/**
 * BFS distances from `from` over cells passing `open`, skipping `blocked` (-1 = none).
 */
function bfs(layout: Layout, from: number, open: (id: number) => boolean, blocked = -1): Int32Array {
  const dist = new Int32Array(layout.rows * layout.cols).fill(-1);
  if (from < 0 || !open(from) || from === blocked) return dist;
  dist[from] = 0;
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const nb of layout.adj[id]) {
      if (dist[nb] < 0 && nb !== blocked && open(nb)) {
        dist[nb] = dist[id] + 1;
        queue.push(nb);
      }
    }
  }
  return dist;
}

/**
 * Reusable buffers for [twoDisjointPaths], one set per layout (cells up to a few
 * thousand; reset by a generation stamp instead of reallocating per call).
 */
class FlowScratch {
  readonly through: Uint8Array;
  readonly edge: Uint8Array; // flow on out(x) -> in(nbr(x, d)), index x * 4 + d
  readonly seen: Int32Array;
  readonly prev: Int32Array;
  readonly queue: Int32Array;
  stamp = 0;
  constructor(n: number) {
    this.through = new Uint8Array(n);
    this.edge = new Uint8Array(n * 4);
    this.seen = new Int32Array(2 * n);
    this.prev = new Int32Array(2 * n);
    this.queue = new Int32Array(2 * n);
  }
}

/**
 * Whether `c` has two paths through `open` cells, one ending at `s` and one at `g`,
 * sharing no cell but `c`: a vertex-capacity max-flow of 2, by two BFS augmentations
 * on the split graph (each cell in -> out with capacity 1; cell edges out -> in).
 */
function twoDisjointPaths(layout: Layout, c: number, s: number, g: number, open: Uint8Array): boolean {
  if (c === s || c === g) return true;
  const { nbr } = layout;
  const f = layout.flow;
  f.through.fill(0);
  f.edge.fill(0);
  let sUsed = false;
  let gUsed = false;
  for (let round = 0; round < 2; round++) {
    const stamp = ++f.stamp;
    let head = 0;
    let tail = 0;
    const start = 2 * c + 1;
    f.queue[tail++] = start;
    f.seen[start] = stamp;
    f.prev[start] = -1;
    let end = -1;
    while (head < tail && end < 0) {
      const node = f.queue[head++];
      const x = node >> 1;
      if (node & 1) {
        if (x !== c && ((x === s && !sUsed) || (x === g && !gUsed))) {
          end = node;
          break;
        }
        for (let d = 0; d < 4; d++) {
          const y = nbr[x * 4 + d];
          if (y < 0 || y === c || !open[y] || f.edge[x * 4 + d]) continue;
          const nn = 2 * y;
          if (f.seen[nn] !== stamp) {
            f.seen[nn] = stamp;
            f.prev[nn] = node;
            f.queue[tail++] = nn;
          }
        }
        if (x !== c && f.through[x]) {
          const nn = 2 * x;
          if (f.seen[nn] !== stamp) {
            f.seen[nn] = stamp;
            f.prev[nn] = node;
            f.queue[tail++] = nn;
          }
        }
      } else {
        if (!f.through[x]) {
          const nn = 2 * x + 1;
          if (f.seen[nn] !== stamp) {
            f.seen[nn] = stamp;
            f.prev[nn] = node;
            f.queue[tail++] = nn;
          }
        }
        // Cancel an edge y -> x that carries flow: go back to out(y).
        for (let d = 0; d < 4; d++) {
          const y = nbr[x * 4 + d];
          if (y < 0 || !f.edge[y * 4 + (d ^ 1)]) continue;
          const nn = 2 * y + 1;
          if (f.seen[nn] !== stamp) {
            f.seen[nn] = stamp;
            f.prev[nn] = node;
            f.queue[tail++] = nn;
          }
        }
      }
    }
    if (end < 0) return false;
    if ((end >> 1) === s && !sUsed) sUsed = true;
    else gUsed = true;
    for (let node = end; f.prev[node] >= 0; node = f.prev[node]) {
      const a = f.prev[node];
      const ax = a >> 1;
      const bx = node >> 1;
      if (ax === bx) {
        f.through[ax] = a & 1 ? 0 : 1; // in -> out adds flow; out -> in cancels it
      } else if (a & 1) {
        f.edge[ax * 4 + layout.dirTo(ax, bx)] = 1; // out(a) -> in(b)
      } else {
        f.edge[bx * 4 + layout.dirTo(bx, ax)] = 0; // in(a) -> out(b) cancels b -> a
      }
    }
  }
  return true;
}

export class NurimazeModel implements ConstraintModel<number[][]> {
  /** The first contradiction propagation hit, when dead (for diagnosis). */
  contradiction: Contradiction | null = null;

  private constructor(
    readonly layout: Layout,
    private readonly state: Int8Array,
    private dead: boolean
  ) {}

  static fromCanon(canon: NurimazeCanon): NurimazeModel {
    const layout = new Layout(canon);
    const model = new NurimazeModel(layout, new Int8Array(layout.roomCells.length).fill(UNKNOWN), false);
    if (layout.start < 0 || layout.goal < 0) {
      model.fail({ rule: "path", cells: [], detail: "the board has no S or no G" });
      return model;
    }
    if (model.propagate([...layout.forcedWhite].map((room) => [room, WHITE] as [number, number]))) model.probe();
    return model;
  }

  /**
   * Failed-literal probing: for each undecided room, assume white, then black, with full
   * propagation; a colour that dies forces the other. Repeats to a fixpoint. This is
   * what keeps the search small: most of a well-made board falls to "if this room were
   * black, X breaks". Mutates this model; false when it dies.
   */
  private probe(): boolean {
    let changed = true;
    while (changed && !this.dead) {
      changed = false;
      for (let room = 0; room < this.state.length; room++) {
        if (this.state[room] !== UNKNOWN) continue;
        for (const colour of [WHITE, BLACK]) {
          const trial = new NurimazeModel(this.layout, this.state.slice(), false);
          if (trial.propagate([[room, colour]])) continue;
          // `colour` is impossible here: take the other one.
          if (!this.propagate([[room, 1 - colour]])) {
            // Both colours die: the board itself is contradictory. Report the trial's
            // contradiction when this one has none of its own.
            this.contradiction ??= trial.contradiction;
            return false;
          }
          changed = true;
          break;
        }
      }
    }
    return !this.dead;
  }

  private fail(c: Contradiction): false {
    this.dead = true;
    this.contradiction ??= c;
    return false;
  }

  private white(id: number): boolean {
    return this.state[this.layout.roomOf[id]] === WHITE;
  }

  private notBlack(id: number): boolean {
    return this.state[this.layout.roomOf[id]] !== BLACK;
  }

  /**
   * Set rooms and propagate to a fixpoint:
   *  - 2x2: a window whose rooms are all one colour is dead; if all but one are
   *    decided and agree, the last takes the other colour (a window inside one room is
   *    dead outright);
   *  - connectivity: the white cells must all lie in one component of the non-black
   *    cells, and an undecided room whose removal would split them must be white;
   *  - path: checked once every room is decided.
   */
  private propagate(assignments: [number, number][]): boolean {
    const { layout } = this;
    const queue = assignments.slice();
    for (;;) {
      while (queue.length > 0) {
        const [room, s] = queue.pop()!;
        if (this.state[room] === s) continue;
        if (this.state[room] !== UNKNOWN) {
          return this.fail({
            rule: "2x2",
            cells: layout.roomCells[room].map((id) => layout.rc(id)),
            detail: "this room is forced both black and white",
          });
        }
        if (s === BLACK && layout.forcedWhite.has(room)) {
          return this.fail({
            rule: "2x2",
            cells: layout.roomCells[room].map((id) => layout.rc(id)),
            detail: "a room with a symbol is forced black",
          });
        }
        this.state[room] = s;
        for (const w of layout.roomWindows[room]) {
          const { cell, rooms } = layout.windows[w];
          let unknown = -1;
          let unknowns = 0;
          let colour = -2;
          let mixed = false;
          for (const x of rooms) {
            const st = this.state[x];
            if (st === UNKNOWN) {
              unknown = x;
              unknowns++;
            } else if (colour === -2) colour = st;
            else if (colour !== st) mixed = true;
          }
          if (mixed) continue;
          const [r, c] = layout.rc(cell);
          if (unknowns === 0) {
            return this.fail({
              rule: "2x2",
              cells: [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]],
              detail: `a 2x2 block is all ${colour === BLACK ? "black" : "white"}`,
            });
          }
          if (unknowns === 1) queue.push([unknown, 1 - colour]);
        }
      }
      // No loops: a room whose white cells would close one goes black.
      const blacks = this.loops();
      if (blacks === false) return false;
      if (blacks.length > 0) {
        for (const room of blacks) queue.push([room, BLACK]);
        continue;
      }
      // Connectivity, with bridge forcing.
      const forced = this.connectivity();
      if (forced === false) return false;
      if (forced.length === 0) break;
      for (const room of forced) queue.push([room, WHITE]);
    }
    if (this.state.every((s) => s !== UNKNOWN)) return this.pathOk();
    return this.treePaths() && this.routeFlow() && this.pathBounds();
  }

  /**
   * The route rule as reachability, which holds on any partial board (the final white
   * cells are a tree inside today's non-black cells, with no triangle on its S -> G
   * route and every circle on it):
   *  - S still reaches G through non-black cells avoiding every triangle;
   *  - each circle still has two non-black, triangle-free paths, one to S and one to
   *    G, sharing no cell but the circle (the route's two halves), found as a unit
   *    vertex-capacity flow of 2 from the circle to {S, G}.
   * Probing turns these into forcing: a room whose colour breaks them is the other.
   */
  private routeFlow(): boolean {
    const { layout } = this;
    const triangles = new Set(layout.triangles);
    const open = (id: number) => this.notBlack(id) && !triangles.has(id);
    const openMask = new Uint8Array(layout.rows * layout.cols);
    for (let id = 0; id < openMask.length; id++) openMask[id] = open(id) ? 1 : 0;
    const fromS = bfs(layout, layout.start, open);
    if (fromS[layout.goal] < 0) {
      return this.fail({
        rule: "path",
        cells: [layout.rc(layout.start), layout.rc(layout.goal)],
        detail: "S can't reach G without passing a triangle",
      });
    }
    for (const c of layout.circles) {
      if (!twoDisjointPaths(layout, c, layout.start, layout.goal, openMask)) {
        return this.fail({ rule: "path", cells: [layout.rc(c)], detail: "no route from S to G can pass this circle" });
      }
    }
    return true;
  }

  /**
   * With no loops, the route between two cells already joined by white cells is fixed
   * for good (whites stay, and a tree has one route). S, G and every circle lie on the
   * final S -> G route, so the fixed route between any two of them already joined is
   * part of it: a triangle on that route is a contradiction now. Once S and G are
   * joined, the whole route is fixed: every circle must be on it.
   */
  private treePaths(): boolean {
    const { layout } = this;
    const white = (id: number) => this.white(id);
    const anchors = [layout.start, layout.goal, ...layout.circles];
    const triangles = new Set(layout.triangles);
    for (let i = 0; i < anchors.length; i++) {
      const from = anchors[i];
      // BFS parents through white cells: the unique tree route back to `from`.
      const n = layout.rows * layout.cols;
      const parent = new Int32Array(n).fill(-2);
      parent[from] = -1;
      const queue = [from];
      for (let q = 0; q < queue.length; q++) {
        for (const nb of layout.adj[queue[q]]) {
          if (parent[nb] === -2 && white(nb)) {
            parent[nb] = queue[q];
            queue.push(nb);
          }
        }
      }
      for (let j = i + 1; j < anchors.length; j++) {
        const to = anchors[j];
        if (parent[to] === -2) continue; // not joined yet
        const route = new Set<number>();
        for (let x = to; x !== -1; x = parent[x]) route.add(x);
        for (const t of route) {
          if (triangles.has(t)) {
            return this.fail({ rule: "path", cells: [layout.rc(t)], detail: "the route through this triangle is already fixed" });
          }
        }
        if (i === 0 && to === layout.goal) {
          for (const c of layout.circles) {
            if (!route.has(c)) {
              return this.fail({ rule: "path", cells: [layout.rc(c)], detail: "the S to G route is fixed and misses this circle" });
            }
          }
        }
      }
    }
    return true;
  }

  /**
   * The path rule on a partial board, from bounds that only tighten as rooms are
   * decided: distances through white cells only can only shrink (whites stay), and
   * distances through non-black cells can only grow (blacks stay). So with dLo the
   * non-black S -> G distance and dHi the white-only one, the final distance d has
   * dLo <= d <= dHi. Then:
   *  - a circle whose best non-black detour S -> c -> G is longer than dHi can't be on
   *    a shortest path;
   *  - a triangle on a white-only S -> t -> G route no longer than dLo will be on one;
   *  - a circle G can be reached around (white only) within dLo will be skipped by one.
   */
  private pathBounds(): boolean {
    const { layout } = this;
    const nonBlack = (id: number) => this.notBlack(id);
    const white = (id: number) => this.white(id);
    const sLo = bfs(layout, layout.start, nonBlack);
    const gLo = bfs(layout, layout.goal, nonBlack);
    const dLo = sLo[layout.goal];
    if (dLo < 0) return this.fail({ rule: "path", cells: [layout.rc(layout.goal)], detail: "G can't be reached from S" });
    const sHi = bfs(layout, layout.start, white);
    const gHi = bfs(layout, layout.goal, white);
    const dHi = sHi[layout.goal] < 0 ? Infinity : sHi[layout.goal];
    for (const c of layout.circles) {
      if (sLo[c] < 0 || gLo[c] < 0 || sLo[c] + gLo[c] > dHi) {
        return this.fail({ rule: "path", cells: [layout.rc(c)], detail: "no short enough path can pass this circle" });
      }
    }
    for (const t of layout.triangles) {
      if (sHi[t] >= 0 && gHi[t] >= 0 && sHi[t] + gHi[t] <= dLo) {
        return this.fail({ rule: "path", cells: [layout.rc(t)], detail: "a shortest path is bound to pass this triangle" });
      }
    }
    if (dHi <= dLo) {
      // The final distance is settled (= dLo): a white-only route of that length that
      // skips a circle stays a shortest path.
      for (const c of layout.circles) {
        const without = bfs(layout, layout.start, white, c);
        if (without[layout.goal] >= 0 && without[layout.goal] <= dLo) {
          return this.fail({ rule: "path", cells: [layout.rc(c)], detail: "a shortest path is bound to miss this circle" });
        }
      }
    }
    return true;
  }

  /**
   * The no-loop rule. False (dead) when the white cells already hold a loop; otherwise
   * the undecided rooms that would close one if white, which must be black. A room is
   * internally loop-free or it could never be white (`roomCyclic`), so whitening it
   * closes a loop exactly when it has more edges to white cells than white components
   * it touches.
   */
  private loops(): number[] | false {
    const { layout } = this;
    const n = layout.rows * layout.cols;
    const parent = new Int32Array(n).map((_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]];
      return x;
    };
    for (let id = 0; id < n; id++) {
      if (!this.white(id)) continue;
      for (const nb of layout.adj[id]) {
        if (nb < id || !this.white(nb)) continue; // each edge once
        const a = find(id);
        const b = find(nb);
        if (a === b) {
          const cells = [layout.rc(id), layout.rc(nb)];
          return this.fail({ rule: "loop", cells, detail: "the white cells form a loop here" });
        }
        parent[a] = b;
      }
    }
    const forced: number[] = [];
    for (let room = 0; room < this.state.length; room++) {
      if (this.state[room] !== UNKNOWN) continue;
      if (layout.roomCyclic[room]) {
        forced.push(room);
        continue;
      }
      const touched = new Set<number>();
      let edges = 0;
      for (const id of layout.roomCells[room]) {
        for (const nb of layout.adj[id]) {
          if (layout.roomOf[nb] !== room && this.white(nb)) {
            edges++;
            touched.add(find(nb));
          }
        }
      }
      if (edges > touched.size) forced.push(room);
    }
    return forced;
  }

  /**
   * False (dead) when the white cells can't all connect through non-black cells;
   * otherwise the undecided rooms that are bridges between white cells (removing one
   * splits them), which must be white.
   */
  private connectivity(): number[] | false {
    const { layout } = this;
    const n = layout.rows * layout.cols;
    let seed = -1;
    let whites = 0;
    for (let id = 0; id < n; id++) {
      if (this.white(id)) {
        whites++;
        if (seed < 0) seed = id;
      }
    }
    if (whites === 0) return [];
    const reach = bfs(layout, seed, (id) => this.notBlack(id));
    let reached = 0;
    for (let id = 0; id < n; id++) if (this.white(id) && reach[id] >= 0) reached++;
    if (reached < whites) {
      const cut: [number, number][] = [];
      for (let id = 0; id < n && cut.length < 12; id++) {
        if (this.white(id) && reach[id] < 0) cut.push(layout.rc(id));
      }
      return this.fail({ rule: "connectivity", cells: cut, detail: "these white cells are walled off from the rest" });
    }
    return this.whiteArticulations();
  }

  /**
   * Undecided rooms whose removal would cut the white rooms apart (they must be white):
   * articulation points of the room graph over non-black rooms, found in one iterative
   * Tarjan pass from a white room. A cut room separates whites when a DFS child's
   * subtree holding a white room can't reach above it.
   */
  private whiteArticulations(): number[] {
    const { layout } = this;
    const nRooms = this.state.length;
    let root = -1;
    for (let r = 0; r < nRooms; r++) if (this.state[r] === WHITE) { root = r; break; }
    if (root < 0) return [];
    const disc = new Int32Array(nRooms).fill(-1);
    const low = new Int32Array(nRooms);
    const whiteBelow = new Uint8Array(nRooms);
    const parent = new Int32Array(nRooms).fill(-1);
    const next = new Int32Array(nRooms); // index into roomAdj during the DFS
    const forced = new Set<number>();
    let time = 0;
    const stack = [root];
    disc[root] = low[root] = time++;
    whiteBelow[root] = 1;
    while (stack.length > 0) {
      const u = stack[stack.length - 1];
      const nbs = layout.roomAdj[u];
      if (next[u] < nbs.length) {
        const v = nbs[next[u]++];
        if (this.state[v] === BLACK) continue;
        if (disc[v] < 0) {
          parent[v] = u;
          disc[v] = low[v] = time++;
          whiteBelow[v] = this.state[v] === WHITE ? 1 : 0;
          stack.push(v);
        } else if (v !== parent[u]) {
          low[u] = Math.min(low[u], disc[v]);
        }
        continue;
      }
      stack.pop();
      const p = parent[u];
      if (p < 0) continue;
      low[p] = Math.min(low[p], low[u]);
      if (whiteBelow[u]) {
        whiteBelow[p] = 1;
        if (low[u] >= disc[p] && this.state[p] === UNKNOWN) forced.add(p);
      }
    }
    return [...forced];
  }


  /**
   * The path rule on a fully decided board: S reaches G, no shortest path touches a
   * triangle, and every shortest path passes every circle (removing a circle makes
   * G farther or unreachable).
   */
  private pathOk(): boolean {
    const { layout } = this;
    const open = (id: number) => this.white(id);
    const fromS = bfs(layout, layout.start, open);
    const d = fromS[layout.goal];
    if (d < 0) return this.fail({ rule: "path", cells: [layout.rc(layout.goal)], detail: "G can't be reached from S" });
    const fromG = bfs(layout, layout.goal, open);
    for (const t of layout.triangles) {
      if (fromS[t] >= 0 && fromG[t] >= 0 && fromS[t] + fromG[t] === d) {
        return this.fail({ rule: "path", cells: [layout.rc(t)], detail: "a shortest path passes this triangle" });
      }
    }
    for (const c of layout.circles) {
      const without = bfs(layout, layout.start, open, c);
      if (without[layout.goal] >= 0 && without[layout.goal] <= d) {
        return this.fail({ rule: "path", cells: [layout.rc(c)], detail: "a shortest path misses this circle" });
      }
    }
    return true;
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    return !this.dead && this.state.every((s) => s !== UNKNOWN);
  }

  /**
   * Branch on an undecided room next to the white region (growing the maze keeps the
   * connectivity reasoning sharp), largest first; white first.
   */
  selectBranch(): Branch | null {
    const { layout } = this;
    let best = -1;
    let bestScore = -1;
    for (let room = 0; room < this.state.length; room++) {
      if (this.state[room] !== UNKNOWN) continue;
      let touchesWhite = 0;
      for (const id of layout.roomCells[room]) {
        for (const nb of layout.adj[id]) if (this.white(nb)) touchesWhite = 1;
      }
      const score = touchesWhite * 1000 + layout.roomCells[room].length;
      if (score > bestScore) {
        bestScore = score;
        best = room;
      }
    }
    return best < 0 ? null : { id: best, candidates: [WHITE, BLACK] };
  }


  assign(room: number, value: number): NurimazeModel {
    const next = new NurimazeModel(this.layout, this.state.slice(), false);
    if (next.propagate([[room, value]])) next.probe();
    return next;
  }

  /** The answer's `states` grid: 1 black, 2 white (marked). */
  solution(): number[][] {
    const { layout } = this;
    return Array.from({ length: layout.rows }, (_, r) =>
      Array.from({ length: layout.cols }, (_, c) => {
        const s = this.state[layout.roomOf[r * layout.cols + c]];
        return s === BLACK ? 1 : s === WHITE ? 2 : 0;
      })
    );
  }

  /** A room's colour: -1 undecided, 0 black, 1 white. */
  roomState(room: number): number {
    return this.state[room];
  }

  /** Rooms still undecided (diagnosis: how far propagation alone got). */
  undecided(): number {
    return this.state.filter((s) => s === UNKNOWN).length;
  }
}
