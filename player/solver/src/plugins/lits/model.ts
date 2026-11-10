import { Branch, ConstraintModel } from "../../types";

/**
 * Canonical LITS representation, mirroring the frontend `LitsCanon` and docs/lits.
 * The grid is pre-divided into regions by thick borders; the player shades exactly one
 * L/I/T/S tetromino (never the O square) per region.
 */
export interface LitsCanon {
  grids: {
    /** (rows-1) x cols: h[r][c] = 1 is a thick border between row r and r+1 at col c. */
    h: number[][];
    /** rows x (cols-1): v[r][c] = 1 is a thick border between col c and c+1 at row r. */
    v: number[][];
  };
}

/**
 * One placement option for a region: the four shaded cells (opaque ids row*cols+col,
 * sorted) and the tetromino shape letter. `cellSet` is the same cells as a Set for O(1)
 * membership during propagation. Placements are static per puzzle, so a model shares the
 * placement lists by reference and only copies the per-region domains on assign.
 */
interface Placement {
  cells: number[];
  cellSet: Set<number>;
  shape: string; // "L" | "I" | "T" | "S"
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// -- tetromino classification (mirrors the Android/web board) -----------------

type Coord = [number, number];

function serialize(coords: Coord[]): string {
  const minR = Math.min(...coords.map(([r]) => r));
  const minC = Math.min(...coords.map(([, c]) => c));
  return coords
    .map(([r, c]) => [r - minR, c - minC] as Coord)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([r, c]) => `${r},${c}`)
    .join(";");
}

/** Canonical signature invariant under the 4 rotations x 2 reflections. */
function canonicalKey(coords: Coord[]): string {
  let variant = coords.map(([r, c]) => [r, c] as Coord);
  const keys: string[] = [];
  for (let refl = 0; refl < 2; refl++) {
    for (let rot = 0; rot < 4; rot++) {
      keys.push(serialize(variant));
      variant = variant.map(([r, c]) => [c, -r] as Coord);
    }
    variant = variant.map(([r, c]) => [r, -c] as Coord);
  }
  keys.sort();
  return keys[0];
}

const TETROMINO_KEYS: Record<string, string> = (() => {
  const refs: Record<string, Coord[]> = {
    I: [[0, 0], [0, 1], [0, 2], [0, 3]],
    L: [[0, 0], [1, 0], [2, 0], [2, 1]],
    T: [[0, 0], [0, 1], [0, 2], [1, 1]],
    S: [[0, 1], [0, 2], [1, 0], [1, 1]],
    O: [[0, 0], [0, 1], [1, 0], [1, 1]],
  };
  const map: Record<string, string> = {};
  for (const [letter, coords] of Object.entries(refs)) map[canonicalKey(coords)] = letter;
  return map;
})();

/** Classify 4 cells as "L"|"I"|"T"|"S", or null if not a valid (connected, non-O) piece. */
function classify(coords: Coord[]): string | null {
  if (coords.length !== 4) return null;
  const letter = TETROMINO_KEYS[canonicalKey(coords)];
  return letter && letter !== "O" ? letter : null;
}

// -- region partition ---------------------------------------------------------

/** Flood-fill the grid into regions, treating a thick border as a barrier. */
function computeRegions(rows: number, cols: number, h: number[][], v: number[][]): number[] {
  const region = new Array<number>(rows * cols).fill(-1);
  const edge = (g: number[][], r: number, c: number) => g[r]?.[c] ?? 0;
  let next = 0;
  for (let r0 = 0; r0 < rows; r0++) {
    for (let c0 = 0; c0 < cols; c0++) {
      if (region[r0 * cols + c0] >= 0) continue;
      const id = next++;
      const stack: Coord[] = [[r0, c0]];
      region[r0 * cols + c0] = id;
      while (stack.length) {
        const [r, c] = stack.pop()!;
        if (r > 0 && region[(r - 1) * cols + c] < 0 && edge(h, r - 1, c) === 0) {
          region[(r - 1) * cols + c] = id;
          stack.push([r - 1, c]);
        }
        if (r < rows - 1 && region[(r + 1) * cols + c] < 0 && edge(h, r, c) === 0) {
          region[(r + 1) * cols + c] = id;
          stack.push([r + 1, c]);
        }
        if (c > 0 && region[r * cols + (c - 1)] < 0 && edge(v, r, c - 1) === 0) {
          region[r * cols + (c - 1)] = id;
          stack.push([r, c - 1]);
        }
        if (c < cols - 1 && region[r * cols + (c + 1)] < 0 && edge(v, r, c) === 0) {
          region[r * cols + (c + 1)] = id;
          stack.push([r, c + 1]);
        }
      }
    }
  }
  return region;
}

/**
 * Every placement of a non-O tetromino that fits entirely inside one region. Enumerated
 * by growing connected 4-cell subsets anchored at each region cell — the region is small,
 * and we only keep subsets that classify to L/I/T/S. Deduped by cell-set.
 */
function regionPlacements(regionCells: number[], cols: number): Placement[] {
  const inRegion = new Set(regionCells);
  const chosenSet = new Set<number>();
  const out: Placement[] = [];
  const seen = new Set<string>();

  const grow = (chosen: number[], anchor: number) => {
    if (chosen.length === 4) {
      const coords = chosen.map((id) => [Math.floor(id / cols), id % cols] as Coord);
      const shape = classify(coords);
      if (!shape) return;
      const sorted = [...chosen].sort((a, b) => a - b);
      const key = sorted.join(",");
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ cells: sorted, cellSet: new Set(sorted), shape });
      return;
    }
    // Candidate extensions: cells orthogonally adjacent to the current set, in-region, not
    // already chosen, and greater than the *anchor* (so the anchor is the subset's minimum
    // id and each subset is reached only from its min — dedup via `seen` covers the
    // multiple growth orders). Gating on the anchor rather than the running max is
    // essential: a connected subset can require adding a lower-id cell after a higher-id
    // one (e.g. a T whose stem is the min id and whose bar extends left), which a
    // running-max gate would make unreachable, undercounting placements to zero.
    const frontier = new Set<number>();
    for (const id of chosen) {
      const r = Math.floor(id / cols);
      const c = id % cols;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        // Bounds-check the column before indexing: without the guard, the
        // right-neighbor of a last-column cell would wrap to the next row's first
        // cell. In practice `inRegion` and the leaf `classify()` reject the wrapped
        // id, but guarding here keeps the frontier geometrically honest and matches
        // the bounds-checked neighbor loops elsewhere in this model.
        if (nc < 0 || nc >= cols) continue;
        const nid = nr * cols + nc;
        if (inRegion.has(nid) && !chosenSet.has(nid) && nid > anchor) frontier.add(nid);
      }
    }
    for (const nid of frontier) {
      chosen.push(nid);
      chosenSet.add(nid);
      grow(chosen, anchor);
      chosen.pop();
      chosenSet.delete(nid);
    }
  };

  for (const id of regionCells) {
    chosenSet.add(id);
    grow([id], id);
    chosenSet.delete(id);
  }
  return out;
}


// -- model --------------------------------------------------------------------

/** Cell states the propagation tracks. A cell starts UNKNOWN and only ever settles. */
const UNKNOWN = 0;
const SHADED = 1;
const UNSHADED = 2;

/** Per-puzzle data shared by reference across every model in a search. */
interface Board {
  rows: number;
  cols: number;
  /** cell -> region id. */
  region: Int32Array;
  /** region id -> its cells. */
  regionCells: number[][];
  /** region id -> its placements. */
  placements: Placement[][];
  /** region id -> placement -> orthogonal neighbours of the piece in *other* regions. */
  outside: number[][][];
  /** cell -> orthogonal neighbours. */
  neighbors: number[][];
  /** Every 2x2 block of the grid, as 4 cell ids. */
  blocks: number[][];
  /** cell -> indices into `blocks` of the blocks containing it. */
  blocksOf: number[][];
}

/**
 * LITS as a constraint model. The variables are the regions, each with a domain of
 * still-possible placements; on top of them the model tracks every cell as unknown,
 * shaded or unshaded. `propagate` runs the deductions a human solver uses until nothing
 * changes:
 *
 * - region: a placement dies if it covers an unshaded cell, misses a shaded cell of its
 *   region, would finish a shaded 2x2, touches a same-shape piece, or has no neighbour
 *   outside its region that could still be shaded (it could never connect). A cell every
 *   surviving placement covers is shaded; one none covers is unshaded.
 * - 2x2: three shaded cells of a 2x2 make the fourth unshaded.
 * - connectivity: shaded cells must lie in one component of not-unshaded cells; other
 *   components are unshaded, and a cell whose removal would split the shaded cells is
 *   shaded.
 *
 * Every deduction is sound (it never removes part of a valid solution), so the search
 * stays complete. On well-formed puzzles they settle most regions before any branching,
 * which is what keeps large boards (50x64) inside the gate's time budget.
 */
export class LitsModel implements ConstraintModel {
  private constructor(
    private readonly board: Board,
    /** region id -> per-placement alive flag. Shared with the parent until written. */
    private readonly domains: Uint8Array[],
    /** region id -> number of alive placements. */
    private readonly counts: Int32Array,
    private readonly cells: Int8Array,
    private dead: boolean,
  ) {}

  static fromCanon(canon: LitsCanon): LitsModel {
    const h = canon.grids.h;
    const v = canon.grids.v;
    const rows = h.length + 1;
    const cols = (v[0]?.length ?? -1) + 1;
    const regionList = computeRegions(rows, cols, h, v);
    const n = rows * cols;

    const regionCount = regionList.length ? Math.max(...regionList) + 1 : 0;
    const regionCells: number[][] = Array.from({ length: regionCount }, () => []);
    for (let id = 0; id < n; id++) regionCells[regionList[id]].push(id);
    const region = Int32Array.from(regionList);

    const neighbors: number[][] = [];
    for (let id = 0; id < n; id++) {
      const r = Math.floor(id / cols);
      const c = id % cols;
      const list: number[] = [];
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) list.push(nr * cols + nc);
      }
      neighbors.push(list);
    }

    const placements = regionCells.map((cells) => regionPlacements(cells, cols));
    const outside = placements.map((list, rid) =>
      list.map((p) => {
        const out = new Set<number>();
        for (const cell of p.cells) {
          for (const nb of neighbors[cell]) if (region[nb] !== rid) out.add(nb);
        }
        return [...out];
      }),
    );

    const blocks: number[][] = [];
    const blocksOf: number[][] = Array.from({ length: n }, () => []);
    for (let r = 0; r + 1 < rows; r++) {
      for (let c = 0; c + 1 < cols; c++) {
        const block = [r * cols + c, r * cols + c + 1, (r + 1) * cols + c, (r + 1) * cols + c + 1];
        for (const cell of block) blocksOf[cell].push(blocks.length);
        blocks.push(block);
      }
    }

    const board: Board = { rows, cols, region, regionCells, placements, outside, neighbors, blocks, blocksOf };
    const domains = placements.map((list) => new Uint8Array(list.length).fill(1));
    const counts = Int32Array.from(placements.map((list) => list.length));
    // A region with no legal placement makes the whole puzzle unsatisfiable.
    const model = new LitsModel(board, domains, counts, new Int8Array(n), counts.some((k) => k === 0));
    if (!model.dead) model.dead = !model.propagate();
    return model;
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    if (this.dead) return false;
    for (let rid = 0; rid < this.counts.length; rid++) {
      if (this.counts[rid] !== 1) return false;
    }
    // Propagation already enforces every rule; re-verify the finished grid in full so a
    // gap in it could only ever cost a solution, never accept a wrong one.
    return this.verify();
  }

  selectBranch(): Branch | null {
    // Min-remaining-values over the regions not yet down to one placement.
    let best = -1;
    let bestCount = Infinity;
    for (let rid = 0; rid < this.counts.length; rid++) {
      const k = this.counts[rid];
      if (k > 1 && k < bestCount) {
        bestCount = k;
        best = rid;
        if (k === 2) break;
      }
    }
    if (best === -1) return null;
    const candidates: number[] = [];
    this.domains[best].forEach((ok, i) => {
      if (ok) candidates.push(i);
    });
    // The branch variable is the region id; values are placement indices.
    return { id: best, candidates };
  }

  assign(id: number, value: number): ConstraintModel {
    const domains = this.domains.slice();
    domains[id] = new Uint8Array(domains[id].length);
    domains[id][value] = 1;
    const counts = this.counts.slice();
    counts[id] = 1;
    const model = new LitsModel(this.board, domains, counts, this.cells.slice(), false);
    model.dead = !model.propagate(id);
    return model;
  }

  solution(): number[][] {
    const { rows, cols } = this.board;
    const grid: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
    for (let rid = 0; rid < this.counts.length; rid++) {
      const idx = this.domains[rid].indexOf(1);
      if (this.counts[rid] !== 1 || idx < 0) continue;
      for (const cell of this.board.placements[rid][idx].cells) {
        grid[Math.floor(cell / cols)][cell % cols] = 1;
      }
    }
    return grid;
  }

  // -- propagation ------------------------------------------------------------

  /**
   * Run every deduction to a fixpoint. Returns false on a contradiction. Domains are
   * shared with the parent model, so each is copied before its first write here;
   * `owned` is a region whose domain this model already created.
   */
  private propagate(owned = -1): boolean {
    const { placements, regionCells, outside, blocks } = this.board;
    const cells = this.cells;
    const multiRegion = placements.length > 1;
    const copied = new Uint8Array(placements.length);
    if (owned >= 0) copied[owned] = 1;

    let changed = true;
    while (changed) {
      changed = false;

      for (let rid = 0; rid < placements.length; rid++) {
        const list = placements[rid];
        const rcells = regionCells[rid];
        let shadedInRegion = 0;
        for (const cell of rcells) if (cells[cell] === SHADED) shadedInRegion++;

        const cover = new Map<number, number>();
        let alive = 0;
        for (let i = 0; i < list.length; i++) {
          if (!this.domains[rid][i]) continue;
          const p = list[i];
          if (this.placementFits(p, outside[rid][i], shadedInRegion, multiRegion)) {
            alive++;
            for (const cell of p.cells) cover.set(cell, (cover.get(cell) ?? 0) + 1);
            continue;
          }
          if (!copied[rid]) {
            this.domains[rid] = this.domains[rid].slice();
            copied[rid] = 1;
          }
          this.domains[rid][i] = 0;
          changed = true;
        }
        this.counts[rid] = alive;
        if (alive === 0) return false;

        for (const cell of rcells) {
          const k = cover.get(cell) ?? 0;
          const want = k === alive ? SHADED : k === 0 ? UNSHADED : UNKNOWN;
          if (want === UNKNOWN || cells[cell] === want) continue;
          if (cells[cell] !== UNKNOWN) return false;
          cells[cell] = want;
          changed = true;
        }
      }

      for (const block of blocks) {
        let shaded = 0;
        let unknown = -1;
        let unknowns = 0;
        for (const cell of block) {
          if (cells[cell] === SHADED) shaded++;
          else if (cells[cell] === UNKNOWN) {
            unknowns++;
            unknown = cell;
          }
        }
        if (shaded === 4) return false;
        if (shaded === 3 && unknowns === 1) {
          cells[unknown] = UNSHADED;
          changed = true;
        }
      }

      // Connectivity is the costliest pass; run it only once the local rules are stuck.
      if (!changed) {
        const result = this.propagateConnectivity();
        if (result < 0) return false;
        if (result > 0) changed = true;
      }
    }
    return true;
  }

  /** Whether placement `p` of a region is still possible given the current cells. */
  private placementFits(p: Placement, out: number[], shadedInRegion: number, multiRegion: boolean): boolean {
    const cells = this.cells;
    let covered = 0;
    for (const cell of p.cells) {
      if (cells[cell] === UNSHADED) return false;
      if (cells[cell] === SHADED) covered++;
    }
    // The region's one piece must cover every shaded cell in it.
    if (covered !== shadedInRegion) return false;

    if (multiRegion) {
      // All shading is connected, so a piece must touch a cell of another region that
      // can still be shaded.
      let reachable = false;
      for (const nb of out) {
        if (cells[nb] !== UNSHADED) {
          reachable = true;
          break;
        }
      }
      if (!reachable) return false;
      // A shaded neighbour belongs to its region's piece; if every placement left there
      // has this shape, the two pieces would be same-shape neighbours.
      for (const nb of out) {
        if (cells[nb] === SHADED && this.fixedShape(this.board.region[nb]) === p.shape) return false;
      }
    }

    // Would finish a 2x2 of shaded cells.
    const { blocks, blocksOf } = this.board;
    for (const cell of p.cells) {
      for (const b of blocksOf[cell]) {
        let full = true;
        for (const x of blocks[b]) {
          if (cells[x] !== SHADED && !p.cellSet.has(x)) {
            full = false;
            break;
          }
        }
        if (full) return false;
      }
    }
    return true;
  }

  /** The shape every alive placement of a region shares, or null when they differ. */
  private fixedShape(rid: number): string | null {
    const list = this.board.placements[rid];
    const dom = this.domains[rid];
    let shape: string | null = null;
    for (let i = 0; i < list.length; i++) {
      if (!dom[i]) continue;
      if (shape === null) shape = list[i].shape;
      else if (shape !== list[i].shape) return null;
    }
    return shape;
  }

  /**
   * Shaded cells must form one connected group through cells that are not unshaded.
   * Returns -1 on a contradiction (shaded cells in two components), 1 if it settled a
   * cell, 0 otherwise. Components with no shaded cell become unshaded; a cut vertex that
   * separates shaded cells becomes shaded.
   */
  private propagateConnectivity(): number {
    const { neighbors } = this.board;
    const cells = this.cells;
    const n = cells.length;
    let anyShaded = false;
    for (let x = 0; x < n; x++) {
      if (cells[x] === SHADED) {
        anyShaded = true;
        break;
      }
    }
    if (!anyShaded) return 0;

    const comp = new Int32Array(n).fill(-1);
    let shadedComp = -1;
    let changed = 0;
    let next = 0;
    for (let start = 0; start < n; start++) {
      if (cells[start] === UNSHADED || comp[start] >= 0) continue;
      const id = next++;
      comp[start] = id;
      const members = [start];
      let hasShaded = false;
      for (let k = 0; k < members.length; k++) {
        const x = members[k];
        if (cells[x] === SHADED) hasShaded = true;
        for (const y of neighbors[x]) {
          if (cells[y] !== UNSHADED && comp[y] < 0) {
            comp[y] = id;
            members.push(y);
          }
        }
      }
      if (hasShaded) {
        if (shadedComp >= 0) return -1;
        shadedComp = id;
      } else {
        for (const x of members) cells[x] = UNSHADED;
        changed = 1;
      }
    }
    if (this.shadeCutVertices(comp, shadedComp)) changed = 1;
    return changed;
  }

  /**
   * Iterative Tarjan DFS over the component holding the shaded cells, rooted at a shaded
   * cell. A non-shaded vertex p with a child subtree that (a) cannot reach above p and
   * (b) holds shaded cells, while shaded cells also lie outside that subtree, separates
   * shaded cells, so it must be shaded.
   */
  private shadeCutVertices(comp: Int32Array, cid: number): boolean {
    const { neighbors } = this.board;
    const cells = this.cells;
    const n = cells.length;
    let root = -1;
    let totalShaded = 0;
    for (let x = 0; x < n; x++) {
      if (comp[x] === cid && cells[x] === SHADED) {
        totalShaded++;
        if (root < 0) root = x;
      }
    }
    if (root < 0) return false;

    const disc = new Int32Array(n).fill(-1);
    const low = new Int32Array(n);
    const below = new Int32Array(n); // shaded cells in the DFS subtree
    const parent = new Int32Array(n).fill(-1);
    const nextEdge = new Int32Array(n);
    const forced: number[] = [];
    let time = 0;
    disc[root] = low[root] = time++;
    below[root] = 1;
    const stack = [root];
    while (stack.length) {
      const a = stack[stack.length - 1];
      const nbs = neighbors[a];
      if (nextEdge[a] < nbs.length) {
        const b = nbs[nextEdge[a]++];
        if (cells[b] === UNSHADED) continue;
        if (disc[b] < 0) {
          parent[b] = a;
          disc[b] = low[b] = time++;
          below[b] = cells[b] === SHADED ? 1 : 0;
          stack.push(b);
        } else if (b !== parent[a]) {
          low[a] = Math.min(low[a], disc[b]);
        }
        continue;
      }
      stack.pop();
      const p = parent[a];
      if (p < 0) continue;
      low[p] = Math.min(low[p], low[a]);
      below[p] += below[a];
      if (low[a] >= disc[p] && cells[p] === UNKNOWN && below[a] > 0 && totalShaded - below[a] > 0) {
        forced.push(p);
      }
    }
    for (const x of forced) cells[x] = SHADED;
    return forced.length > 0;
  }

  // -- leaf verification --------------------------------------------------------

  /** Check the fully assigned grid against all LITS rules from scratch. */
  private verify(): boolean {
    const { placements, neighbors, blocks, region } = this.board;
    const n = this.cells.length;
    const shapeAt: (string | null)[] = new Array(n).fill(null);
    let count = 0;
    let start = -1;
    for (let rid = 0; rid < placements.length; rid++) {
      const p = placements[rid][this.domains[rid].indexOf(1)];
      for (const cell of p.cells) {
        shapeAt[cell] = p.shape;
        count++;
        start = cell;
      }
    }
    if (count === 0) return false;

    const seen = new Uint8Array(n);
    seen[start] = 1;
    const stack = [start];
    let reached = 1;
    while (stack.length) {
      const x = stack.pop()!;
      for (const y of neighbors[x]) {
        if (shapeAt[y] === null || seen[y]) continue;
        seen[y] = 1;
        reached++;
        stack.push(y);
      }
    }
    if (reached !== count) return false;

    for (const block of blocks) if (block.every((x) => shapeAt[x] !== null)) return false;

    for (let x = 0; x < n; x++) {
      if (shapeAt[x] === null) continue;
      for (const y of neighbors[x]) {
        if (region[y] !== region[x] && shapeAt[y] === shapeAt[x]) return false;
      }
    }
    return true;
  }
}
