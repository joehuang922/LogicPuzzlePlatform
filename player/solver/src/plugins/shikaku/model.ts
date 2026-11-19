import { Branch, ConstraintModel } from "../../types";

/** Canonical Shikaku representation (ShikakuCanon): rows x cols, 0 empty, n > 0 a clue. */
export interface ShikakuCanon {
  cells: number[][];
}

export interface ShikakuRect {
  r: number;
  c: number;
  w: number;
  h: number;
}

/** The answer shape (ShikakuAnswer): one rectangle per clue, sorted by corner. */
export interface ShikakuSolution {
  rects: ShikakuRect[];
}

interface Spec {
  rows: number;
  cols: number;
  cellCount: number;
  clueCount: number;
  /** Candidate rectangles, all clues together. */
  cands: ShikakuRect[];
  candClue: Int32Array;
  /** Clue -> its candidate ids. */
  clueCands: number[][];
  /** Cell -> the candidate ids covering it. */
  cellCands: number[][];
}

/**
 * Every rectangle of a clue's area that holds the clue and no other clue. `prefix` is a
 * 2D prefix sum of clue counts.
 */
function buildSpec(canon: ShikakuCanon): Spec {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  const cellCount = rows * cols;
  const prefix = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      prefix[r + 1][c + 1] = prefix[r][c + 1] + prefix[r + 1][c] - prefix[r][c] + (canon.cells[r][c] > 0 ? 1 : 0);
    }
  }
  const cluesIn = (r: number, c: number, h: number, w: number) =>
    prefix[r + h][c + w] - prefix[r][c + w] - prefix[r + h][c] + prefix[r][c];

  const cands: ShikakuRect[] = [];
  const candClueList: number[] = [];
  const clueCands: number[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = canon.cells[r][c];
      if (n <= 0) continue;
      const k = clueCands.length;
      const mine: number[] = [];
      for (let h = 1; h <= n; h++) {
        if (n % h) continue;
        const w = n / h;
        if (h > rows || w > cols) continue;
        for (let r0 = Math.max(0, r - h + 1); r0 <= Math.min(r, rows - h); r0++) {
          for (let c0 = Math.max(0, c - w + 1); c0 <= Math.min(c, cols - w); c0++) {
            if (cluesIn(r0, c0, h, w) !== 1) continue;
            mine.push(cands.length);
            cands.push({ r: r0, c: c0, w, h });
            candClueList.push(k);
          }
        }
      }
      clueCands.push(mine);
    }
  }
  const cellCands: number[][] = Array.from({ length: cellCount }, () => []);
  cands.forEach((q, id) => {
    for (let r = q.r; r < q.r + q.h; r++) for (let c = q.c; c < q.c + q.w; c++) cellCands[r * cols + c].push(id);
  });
  return { rows, cols, cellCount, clueCount: clueCands.length, cands, candClue: Int32Array.from(candClueList), clueCands, cellCands };
}

/**
 * Native CSP solver for Shikaku (puzzle type 22). One variable per clue, its domain the
 * rectangles of the clue's area that hold it and no other clue. Propagated to a fixpoint:
 *
 *  - Clues (`applyClue`): no rectangle left is a dead end. The cells every remaining
 *    rectangle shares (their intersection, itself a rectangle) belong to this clue, so
 *    every other clue's rectangle over them goes. With one rectangle left that is all of
 *    it: the clue is placed.
 *  - Cells (`applyCell`): a cell no clue can reach is a dead end; a cell only one clue can
 *    reach must be covered by it, so that clue's rectangles missing the cell go.
 *
 * Together these are exact on a full assignment (placed rectangles never overlap, every
 * cell is covered), so `isSolved` only needs every clue placed. Failed-literal probing
 * over every live rectangle runs at construction and after every search assignment.
 */
export class ShikakuModel implements ConstraintModel<ShikakuSolution> {
  private constructor(
    private readonly spec: Spec,
    private readonly alive: Uint8Array, // per candidate
    private readonly count: Int32Array, // per clue: live candidates
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: ShikakuCanon): ShikakuModel {
    const spec = buildSpec(canon);
    const count = Int32Array.from(spec.clueCands.map((l) => l.length));
    const model = new ShikakuModel(spec, new Uint8Array(spec.cands.length).fill(1), count, false);
    if (spec.clueCount === 0) return model.toDead(); // nothing to tile with
    const clues = spec.clueCands.map((_, k) => k);
    const cells = Array.from({ length: spec.cellCount }, (_, x) => x);
    return model.propagate(clues, cells).probe();
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    if (this.dead) return false;
    for (let k = 0; k < this.spec.clueCount; k++) if (this.count[k] !== 1) return false;
    return true;
  }

  selectBranch(): Branch | null {
    const { spec, count, alive } = this;
    let best = -1;
    for (let k = 0; k < spec.clueCount; k++) if (count[k] > 1 && (best < 0 || count[k] < count[best])) best = k;
    if (best < 0) return null;
    return { id: best, candidates: spec.clueCands[best].filter((id) => alive[id]) };
  }

  assign(clue: number, cand: number): ConstraintModel<ShikakuSolution> {
    const m = this.choose(clue, cand);
    return m.dead ? m : m.probe();
  }

  solution(): ShikakuSolution {
    const rects = this.spec.cands.filter((_, id) => this.alive[id]).map((q) => ({ ...q }));
    rects.sort((a, b) => a.r - b.r || a.c - b.c);
    return { rects };
  }

  // -- propagation ------------------------------------------------------------

  private toDead(): ShikakuModel {
    return new ShikakuModel(this.spec, this.alive, this.count, true);
  }

  private copy(): ShikakuModel {
    return new ShikakuModel(this.spec, Uint8Array.from(this.alive), Int32Array.from(this.count), false);
  }

  /** Clue takes rectangle `cand`: every other rectangle of it goes. */
  private choose(clue: number, cand: number): ShikakuModel {
    if (!this.alive[cand] || this.spec.candClue[cand] !== clue) return this.toDead();
    const m = this.copy();
    const touched: number[] = [];
    for (const id of this.spec.clueCands[clue]) if (id !== cand && m.alive[id]) m.kill(id, touched);
    return m.propagate([clue], touched);
  }

  /** Rectangle `cand` goes. */
  private without(cand: number): ShikakuModel {
    const m = this.copy();
    const touched: number[] = [];
    m.kill(cand, touched);
    return m.propagate([this.spec.candClue[cand]], touched);
  }

  /** Remove a candidate; its cells go on the cell queue. */
  private kill(id: number, cellQueue: number[]): void {
    const { spec } = this;
    this.alive[id] = 0;
    this.count[spec.candClue[id]]--;
    const q = spec.cands[id];
    for (let r = q.r; r < q.r + q.h; r++) for (let c = q.c; c < q.c + q.w; c++) cellQueue.push(r * spec.cols + c);
  }

  /** Run both rules to a fixpoint from the given clues and cells, mutating this model. */
  private propagate(clueQueue: number[], cellQueue: number[]): ShikakuModel {
    const { spec } = this;
    const clueQ = [...clueQueue];
    const cellQ = [...cellQueue];
    let ci = 0;
    let xi = 0;
    while (ci < clueQ.length || xi < cellQ.length) {
      if (ci < clueQ.length) {
        if (!this.applyClue(clueQ[ci++], cellQ)) return this.toDead();
        continue;
      }
      const x = cellQ[xi++];
      if (!this.applyCell(x, cellQ)) return this.toDead();
      // Cells that lost a rectangle may change their clues' intersection.
      for (const id of spec.cellCands[x]) {
        const k = spec.candClue[id];
        if (this.alive[id] && this.count[k] > 0) clueQ.push(k);
      }
      if (clueQ.length - ci > 4 * spec.clueCount) clueQ.splice(0, ci), (ci = 0); // keep it bounded
    }
    return this;
  }

  /** The cells every live rectangle of clue k covers are k's: other clues' rectangles there go. */
  private applyClue(k: number, cellQ: number[]): boolean {
    const { spec, alive } = this;
    if (this.count[k] === 0) return false;
    let r0 = 0, c0 = 0, r1 = spec.rows, c1 = spec.cols;
    for (const id of spec.clueCands[k]) {
      if (!alive[id]) continue;
      const q = spec.cands[id];
      r0 = Math.max(r0, q.r);
      c0 = Math.max(c0, q.c);
      r1 = Math.min(r1, q.r + q.h);
      c1 = Math.min(c1, q.c + q.w);
    }
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        for (const id of spec.cellCands[r * spec.cols + c]) {
          if (alive[id] && spec.candClue[id] !== k) {
            this.kill(id, cellQ);
            if (this.count[spec.candClue[id]] === 0) return false;
          }
        }
      }
    }
    return true;
  }

  /** Some clue must cover cell x; if only one can, its rectangles missing x go. */
  private applyCell(x: number, cellQ: number[]): boolean {
    const { spec, alive } = this;
    let only = -1;
    for (const id of spec.cellCands[x]) {
      if (!alive[id]) continue;
      const k = spec.candClue[id];
      if (only < 0) only = k;
      else if (only !== k) return true;
    }
    if (only < 0) return false;
    const r = Math.floor(x / spec.cols);
    const c = x % spec.cols;
    for (const id of spec.clueCands[only]) {
      if (!alive[id]) continue;
      const q = spec.cands[id];
      if (r < q.r || r >= q.r + q.h || c < q.c || c >= q.c + q.w) this.kill(id, cellQ);
    }
    return this.count[only] > 0;
  }

  /** Failed-literal probing over every live rectangle of an unplaced clue, to a fixpoint. */
  private probe(): ShikakuModel {
    let m: ShikakuModel = this;
    for (let changed = true; changed && !m.dead; ) {
      changed = false;
      for (let k = 0; k < m.spec.clueCount && !m.dead; k++) {
        for (const id of m.spec.clueCands[k]) {
          if (m.dead || m.count[k] <= 1) break;
          if (!m.alive[id]) continue;
          if (m.choose(k, id).dead) {
            m = m.without(id);
            changed = true;
          }
        }
      }
    }
    return m;
  }
}
