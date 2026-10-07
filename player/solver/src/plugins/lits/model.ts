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

export class LitsModel implements ConstraintModel {
  private constructor(
    private readonly rows: number,
    private readonly cols: number,
    private readonly placements: Placement[][], // region id -> its placements
    private readonly domains: boolean[][], // region id -> per-placement still-legal flag
    private readonly chosen: number[], // region id -> committed placement index, or -1
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: LitsCanon): LitsModel {
    const h = canon.grids.h;
    const v = canon.grids.v;
    const rows = h.length + 1;
    const cols = (v[0]?.length ?? -1) + 1;
    const region = computeRegions(rows, cols, h, v);

    const regionCount = region.length ? Math.max(...region) + 1 : 0;
    const cellsByRegion: number[][] = Array.from({ length: regionCount }, () => []);
    for (let id = 0; id < region.length; id++) cellsByRegion[region[id]].push(id);

    const placements = cellsByRegion.map((cells) => regionPlacements(cells, cols));
    const domains = placements.map((p) => p.map(() => true));
    const chosen = new Array<number>(regionCount).fill(-1);
    // A region with no legal placement makes the whole puzzle unsatisfiable.
    const dead = placements.some((p) => p.length === 0);
    return new LitsModel(rows, cols, placements, domains, chosen, dead);
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    if (this.dead) return false;
    for (let rid = 0; rid < this.chosen.length; rid++) {
      if (this.chosen[rid] < 0) return false;
    }
    // Every region is committed. Verify the two global rules in full (local rules were
    // already enforced on assign, but connectivity and 2x2 span regions, so re-check).
    const shaded = this.shadedSet(this.chosen);
    if (!this.allConnected(shaded)) return false;
    if (this.hasShaded2x2(shaded)) return false;
    if (this.hasSameShapeAdjacency()) return false;
    return true;
  }

  selectBranch(): Branch | null {
    // Min-remaining-values: branch on the uncommitted region with the fewest legal
    // placements left.
    let best = -1;
    let bestCount = Infinity;
    for (let rid = 0; rid < this.chosen.length; rid++) {
      if (this.chosen[rid] >= 0) continue;
      const count = this.domains[rid].reduce((n, ok) => n + (ok ? 1 : 0), 0);
      if (count < bestCount) {
        bestCount = count;
        best = rid;
        if (count <= 1) break;
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
    const chosen = this.chosen.slice();
    const domains = this.domains.map((d) => d.slice());
    chosen[id] = value;
    domains[id] = domains[id].map((_, i) => i === value);

    const placed = this.placements[id][value];
    // Forward-check uncommitted regions. A candidate placement is pruned when it would
    // make a fully-shaded 2x2 with cells shaded so far, or sit orthogonally adjacent to
    // this piece with the same shape. These prunings are SOUND (never remove a placement
    // that could appear in a valid solution), so completeness is preserved; the global
    // rules are still verified in full at the leaf.
    let dead = false;
    const shadedSoFar = this.shadedSet(chosen);
    for (let rid = 0; rid < chosen.length; rid++) {
      if (chosen[rid] >= 0) continue;
      let any = false;
      const dom = domains[rid];
      for (let i = 0; i < dom.length; i++) {
        if (!dom[i]) continue;
        const cand = this.placements[rid][i];
        if (this.wouldForm2x2(cand, shadedSoFar) || this.sameShapeAdjacent(cand, placed)) {
          dom[i] = false;
        } else {
          any = true;
        }
      }
      if (!any) dead = true;
    }

    return new LitsModel(this.rows, this.cols, this.placements, domains, chosen, dead || this.dead);
  }

  solution(): number[][] {
    const grid: number[][] = Array.from({ length: this.rows }, () => new Array<number>(this.cols).fill(0));
    for (let rid = 0; rid < this.chosen.length; rid++) {
      const idx = this.chosen[rid];
      if (idx < 0) continue;
      for (const cell of this.placements[rid][idx].cells) {
        grid[Math.floor(cell / this.cols)][cell % this.cols] = 1;
      }
    }
    return grid;
  }

  // -- helpers ----------------------------------------------------------------

  /** Shaded cells from a (possibly partial) assignment; uncommitted regions contribute none. */
  private shadedSet(chosen: number[]): Set<number> {
    const set = new Set<number>();
    for (let rid = 0; rid < chosen.length; rid++) {
      const idx = chosen[rid];
      if (idx < 0) continue;
      for (const cell of this.placements[rid][idx].cells) set.add(cell);
    }
    return set;
  }

  private wouldForm2x2(cand: Placement, shaded: Set<number>): boolean {
    const cols = this.cols;
    // A new 2x2 can only appear touching one of the candidate's own cells. For each
    // candidate cell, test the (up to 4) 2x2 blocks it participates in.
    for (const cell of cand.cells) {
      const r = Math.floor(cell / cols);
      const c = cell % cols;
      for (const [r0, c0] of [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]]) {
        if (r0 < 0 || c0 < 0 || r0 + 1 >= this.rows || c0 + 1 >= cols) continue;
        const block = [r0 * cols + c0, r0 * cols + c0 + 1, (r0 + 1) * cols + c0, (r0 + 1) * cols + c0 + 1];
        if (block.every((b) => cand.cellSet.has(b) || shaded.has(b))) return true;
      }
    }
    return false;
  }

  private sameShapeAdjacent(a: Placement, b: Placement): boolean {
    if (a.shape !== b.shape) return false;
    const cols = this.cols;
    for (const cell of a.cells) {
      const r = Math.floor(cell / cols);
      const c = cell % cols;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        // Bounds-check both axes before indexing: without the column guard, the
        // right-neighbor of a last-column cell (nc === cols) would wrap to id
        // (r+1)*cols, i.e. the first cell of the next row, and the left-neighbor of
        // a first-column cell (nc === -1) would wrap to the previous row's last
        // cell — falsely reporting two far-apart pieces as orthogonally adjacent.
        if (nr < 0 || nc < 0 || nr >= this.rows || nc >= cols) continue;
        if (b.cellSet.has(nr * cols + nc)) return true;
      }
    }
    return false;
  }

  private allConnected(shaded: Set<number>): boolean {
    if (shaded.size === 0) return false;
    const cols = this.cols;
    const start = shaded.values().next().value as number;
    const seen = new Set<number>([start]);
    const stack = [start];
    while (stack.length) {
      const cell = stack.pop()!;
      const r = Math.floor(cell / cols);
      const c = cell % cols;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= this.rows || nc >= cols) continue;
        const nid = nr * cols + nc;
        if (shaded.has(nid) && !seen.has(nid)) {
          seen.add(nid);
          stack.push(nid);
        }
      }
    }
    return seen.size === shaded.size;
  }

  private hasShaded2x2(shaded: Set<number>): boolean {
    const cols = this.cols;
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        if (
          shaded.has(r * cols + c) &&
          shaded.has(r * cols + c + 1) &&
          shaded.has((r + 1) * cols + c) &&
          shaded.has((r + 1) * cols + c + 1)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private hasSameShapeAdjacency(): boolean {
    for (let rid = 0; rid < this.chosen.length; rid++) {
      const idx = this.chosen[rid];
      if (idx < 0) continue;
      const a = this.placements[rid][idx];
      for (let other = rid + 1; other < this.chosen.length; other++) {
        const oidx = this.chosen[other];
        if (oidx < 0) continue;
        if (this.sameShapeAdjacent(a, this.placements[other][oidx])) return true;
      }
    }
    return false;
  }
}
