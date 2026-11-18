import { Branch, ConstraintModel } from "../../types";

/**
 * Canonical Pencils representation, mirroring the frontend `PencilsCanon`: rows x cols,
 * 0 empty, a positive integer a number (it lies on a pencil body of that length), -1..-4
 * a given pencil head pointing up / down / left / right.
 */
export interface PencilsCanon {
  cells: number[][];
}

/** The answer shape (PencilsAnswer). `heads` holds the heads the player places (not given ones). */
export interface PencilsSolution {
  trails: { h: number[][]; v: number[][] };
  heads: number[][];
  edges: { h: number[][]; v: number[][] };
}

// Edge values, as bits of an edge's domain.
const NONE = 1;
const BODY = 2;
const TRAIL = 4;
const ALL = NONE | BODY | TRAIL;

// Sides of a cell, in table order.
const UP = 0;
const DOWN = 1;
const LEFT = 2;
const RIGHT = 3;
const OPPOSITE = [DOWN, UP, RIGHT, LEFT];
/** Canon head code -> the side the head points to. */
const HEAD_SIDE: Record<number, number> = { [-1]: UP, [-2]: DOWN, [-3]: LEFT, [-4]: RIGHT };
const SIDE_HEAD = [-1, -2, -3, -4];

/**
 * A cell's allowed configurations of its four edges (UP, DOWN, LEFT, RIGHT), each as four
 * edge values packed 3 bits apiece. Off-board edges are NONE.
 */
type Table = number[];

const pack = (vals: number[]) => vals[0] | (vals[1] << 3) | (vals[2] << 6) | (vals[3] << 9);
const valAt = (tuple: number, side: number) => (tuple >> (3 * side)) & 7;

/** Every configuration of the five cell roles; `headSide` restricts a head to point that way. */
function buildTable(opts: { numbered: boolean; headSide: number | null; onBoard: boolean[] }): Table {
  const out: Table = [];
  const vals = [NONE, BODY, TRAIL];
  for (const a of vals) for (const b of vals) for (const c of vals) for (const d of vals) {
    const t = [a, b, c, d];
    if (t.some((v, s) => !opts.onBoard[s] && v !== NONE)) continue;
    const bodies = t.map((v, s) => (v === BODY ? s : -1)).filter((s) => s >= 0);
    const trails = t.filter((v) => v === TRAIL).length;
    let ok: boolean;
    if (opts.headSide !== null) {
      // A given head: its body on the side away from where it points, and one trail.
      ok = bodies.length === 1 && bodies[0] === OPPOSITE[opts.headSide] && trails === 1;
    } else if (opts.numbered) {
      // A number lies on a body: an end (one body link) or a straight middle.
      ok = trails === 0 && (bodies.length === 1 || (bodies.length === 2 && bodies[0] === OPPOSITE[bodies[1]]));
    } else {
      ok =
        (trails === 0 && bodies.length === 1) || // body end
        (trails === 0 && bodies.length === 2 && bodies[0] === OPPOSITE[bodies[1]]) || // body middle
        (trails === 1 && bodies.length === 1) || // head
        (bodies.length === 0 && (trails === 1 || trails === 2)); // trail end / middle
    }
    if (ok) out.push(pack(t));
  }
  return out;
}

/** One placement of a numbered cell's body: the edge values it fixes. */
interface Placement {
  edges: number[];
  values: number[];
}

interface Spec {
  rows: number;
  cols: number;
  cellCount: number;
  hCount: number;
  edgeCount: number;
  canon: Int32Array; // per cell
  /** Cell -> edge id per side, or -1 off board. */
  edgeOf: Int32Array; // cell * 4 + side
  /** Edge -> its two cells and the side of the first that it is on. */
  ends: Int32Array; // edge * 2 + i
  tables: Table[];
  /** Numbered cell -> the placements of its body (indices into `placements`). */
  numberRules: { cell: number; placements: Placement[] }[];
  rulesOfEdge: number[][];
}

function buildSpec(canon: PencilsCanon): Spec {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  const cellCount = rows * cols;
  const hCount = rows * Math.max(cols - 1, 0);
  const edgeCount = hCount + Math.max(rows - 1, 0) * cols;
  const cv = new Int32Array(cellCount);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cv[r * cols + c] = canon.cells[r][c] | 0;

  const edgeOf = new Int32Array(cellCount * 4).fill(-1);
  const ends = new Int32Array(edgeCount * 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const e = r * (cols - 1) + c;
      const x = r * cols + c;
      edgeOf[x * 4 + RIGHT] = e;
      edgeOf[(x + 1) * 4 + LEFT] = e;
      ends[2 * e] = x;
      ends[2 * e + 1] = x + 1;
    }
  }
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const e = hCount + r * cols + c;
      const x = r * cols + c;
      edgeOf[x * 4 + DOWN] = e;
      edgeOf[(x + cols) * 4 + UP] = e;
      ends[2 * e] = x;
      ends[2 * e + 1] = x + cols;
    }
  }

  const tables: Table[] = [];
  for (let x = 0; x < cellCount; x++) {
    const onBoard = [0, 1, 2, 3].map((s) => edgeOf[x * 4 + s] >= 0);
    const v = cv[x];
    tables.push(buildTable({ numbered: v > 0, headSide: v < 0 ? HEAD_SIDE[v] ?? null : null, onBoard }));
  }

  // Number placements: a straight body of k cells through the number, the head at
  // either end (pointing away from the body).
  const numberRules: { cell: number; placements: Placement[] }[] = [];
  const rulesOfEdge: number[][] = Array.from({ length: edgeCount }, () => []);
  const step = [-cols, cols, -1, 1];
  for (let x = 0; x < cellCount; x++) {
    const k = cv[x];
    if (k <= 0) continue;
    const r = Math.floor(x / cols);
    const c = x % cols;
    const placements: Placement[] = [];
    for (const horizontal of [true, false]) {
      for (let off = 0; off < k; off++) {
        // body cells: along the line, `off` of them before x
        const body: number[] = [];
        let ok = true;
        for (let i = 0; i < k; i++) {
          const rr = horizontal ? r : r - off + i;
          const cc = horizontal ? c - off + i : c;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) {
            ok = false;
            break;
          }
          const y = rr * cols + cc;
          if (cv[y] < 0 || (cv[y] > 0 && cv[y] !== k)) {
            ok = false;
            break;
          }
          body.push(y);
        }
        if (!ok) continue;
        const [fwd, back] = horizontal ? [RIGHT, LEFT] : [DOWN, UP];
        for (const headAtEnd of [true, false]) {
          // head beyond the last body cell (side fwd) or before the first (side back)
          const tip = headAtEnd ? body[k - 1] : body[0];
          const tipSide = headAtEnd ? fwd : back;
          const tail = headAtEnd ? body[0] : body[k - 1];
          const tailSide = headAtEnd ? back : fwd;
          const headEdge = edgeOf[tip * 4 + tipSide];
          if (headEdge < 0) continue;
          const head = tip + step[tipSide];
          if (cv[head] > 0) continue; // a number is never a head
          if (cv[head] < 0 && HEAD_SIDE[cv[head]] !== tipSide) continue; // given head must point away
          const edges: number[] = [];
          const values: number[] = [];
          const add = (e: number, v: number) => {
            if (e < 0) return;
            edges.push(e);
            values.push(v);
          };
          add(headEdge, BODY);
          for (let i = 0; i + 1 < k; i++) add(edgeOf[body[i] * 4 + fwd], BODY);
          add(edgeOf[tail * 4 + tailSide], NONE);
          for (const y of body) {
            const sides = horizontal ? [UP, DOWN] : [LEFT, RIGHT];
            for (const s of sides) add(edgeOf[y * 4 + s], NONE);
          }
          placements.push({ edges, values });
        }
      }
    }
    const id = numberRules.length;
    numberRules.push({ cell: x, placements });
    const touched = new Set<number>();
    for (const p of placements) for (const e of p.edges) touched.add(e);
    for (const e of touched) rulesOfEdge[e].push(id);
  }

  return { rows, cols, cellCount, hCount, edgeCount, canon: cv, edgeOf, ends, tables, numberRules, rulesOfEdge };
}

/**
 * Native CSP solver for Pencils (puzzle type 8). Every pencil is one path through cells:
 * body end, straight 1xN body, head, then a trail of N steps; the pencils cover the board
 * exactly. So the variables are the edges between neighbouring cells, each NONE, BODY or
 * TRAIL (a link inside a body / between body and head, or a trail step). Rules:
 *
 *  - Cells (`applyCell`): each cell's four edges form one of the roles — body end, straight
 *    body middle, head (one body link, one trail link), trail middle, trail end. A number
 *    is a body cell; a given head has its body on the side away from where it points.
 *  - Numbers (`applyNumber`): every placement of a numbered cell's body (k cells in a
 *    line through it, the head at either end); edges every live placement agrees on are
 *    fixed, none left is a dead end.
 *  - Paths (`applyPaths`): over the chains of decided links, a finished body fixes the
 *    trail's length and vice versa; a trail or body that reaches it is capped, one past it
 *    is a dead end; a closed chain needs exactly one head with matching lengths and
 *    numbers; a trail loop is a dead end.
 *
 * Every cell is covered because every cell must take a role. These are the documented
 * rules, a little stricter than the board's completion check (which also accepts a
 * non-1xN rectangular body or a head in the middle of its trail).
 *
 * All are necessary conditions, so the search stays complete; `isSolved` re-checks every
 * pencil. Failed-literal probing over every (edge, value) runs at construction and after
 * every search assignment.
 */
export class PencilsModel implements ConstraintModel<PencilsSolution> {
  private constructor(
    private readonly spec: Spec,
    private readonly dom: Int8Array, // per edge: bits of NONE | BODY | TRAIL
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: PencilsCanon): PencilsModel {
    const spec = buildSpec(canon);
    const model = new PencilsModel(spec, new Int8Array(spec.edgeCount).fill(ALL), false);
    if (spec.cellCount < 2 || spec.tables.some((t) => t.length === 0)) return model.toDead();
    return model.propagate().probe();
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    if (this.dead) return false;
    for (let e = 0; e < this.spec.edgeCount; e++) if (!single(this.dom[e])) return false;
    return this.checkFull();
  }

  selectBranch(): Branch | null {
    // An undecided edge at a chain end or a head (they drive length forcing), else the
    // edge with the fewest values.
    const { spec, dom } = this;
    let best = -1;
    let bestScore = Infinity;
    for (let e = 0; e < spec.edgeCount; e++) {
      if (single(dom[e])) continue;
      let score = popcount(dom[e]) * 10;
      for (let i = 0; i < 2; i++) {
        const x = spec.ends[2 * e + i];
        for (let s = 0; s < 4; s++) {
          const f = spec.edgeOf[x * 4 + s];
          if (f >= 0 && f !== e && (dom[f] === BODY || dom[f] === TRAIL)) score -= 3;
        }
      }
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best < 0) return null;
    const candidates = [BODY, TRAIL, NONE].filter((v) => dom[best] & v);
    return { id: best, candidates };
  }

  assign(id: number, value: number): ConstraintModel<PencilsSolution> {
    const m = this.withValue(id, value);
    return m.dead ? m : m.probe();
  }

  private withValue(e: number, v: number): PencilsModel {
    if (!(this.dom[e] & v)) return this.toDead();
    const dom = Int8Array.from(this.dom);
    dom[e] = v;
    return new PencilsModel(this.spec, dom, false).propagate([e]);
  }

  private withoutValue(e: number, v: number): PencilsModel {
    const dom = Int8Array.from(this.dom);
    dom[e] &= ~v;
    if (!dom[e]) return new PencilsModel(this.spec, dom, true);
    return new PencilsModel(this.spec, dom, false).propagate([e]);
  }

  solution(): PencilsSolution {
    const { rows, cols, hCount, canon, edgeOf } = this.spec;
    const dom = this.dom;
    const val = (e: number) => (e < 0 ? NONE : dom[e]);
    const trailsH = Array.from({ length: rows }, (_, r) => Array.from({ length: cols - 1 }, (_, c) => (dom[r * (cols - 1) + c] === TRAIL ? 1 : 0)));
    const trailsV = Array.from({ length: rows - 1 }, (_, r) => Array.from({ length: cols }, (_, c) => (dom[hCount + r * cols + c] === TRAIL ? 1 : 0)));
    const heads = Array.from({ length: rows }, () => new Array(cols).fill(0));
    const bodyOf = new Int32Array(rows * cols).fill(-1); // body cells -> their head cell
    for (let x = 0; x < rows * cols; x++) {
      const sides = [0, 1, 2, 3].map((s) => val(edgeOf[x * 4 + s]));
      const b = sides.indexOf(BODY);
      if (b >= 0 && sides.includes(TRAIL)) {
        // A head points away from its body.
        if (canon[x] >= 0) heads[Math.floor(x / cols)][x % cols] = SIDE_HEAD[OPPOSITE[b]];
        // Walk its body to mark the cells.
        const step = [-cols, cols, -1, 1][b];
        for (let y = x + step, s = b; ; y += step) {
          bodyOf[y] = x;
          if (val(edgeOf[y * 4 + s]) !== BODY) break;
        }
      }
    }
    // Walls around every body: between a body cell and any cell outside that body.
    const wall = (a: number, b: number) => ((bodyOf[a] >= 0 || bodyOf[b] >= 0) && bodyOf[a] !== bodyOf[b] ? 1 : 0);
    const edgesH = Array.from({ length: rows - 1 }, (_, r) => Array.from({ length: cols }, (_, c) => wall(r * cols + c, (r + 1) * cols + c)));
    const edgesV = Array.from({ length: rows }, (_, r) => Array.from({ length: cols - 1 }, (_, c) => wall(r * cols + c, r * cols + c + 1)));
    return { trails: { h: trailsH, v: trailsV }, heads, edges: { h: edgesH, v: edgesV } };
  }

  // -- propagation ------------------------------------------------------------

  /** Failed-literal probing over every (edge, value), to a fixpoint. */
  private probe(): PencilsModel {
    let m: PencilsModel = this;
    for (let changed = true; changed && !m.dead; ) {
      changed = false;
      for (let e = 0; e < m.spec.edgeCount && !m.dead; e++) {
        if (single(m.dom[e])) continue;
        for (const v of [NONE, BODY, TRAIL]) {
          if (m.dead || !(m.dom[e] & v) || single(m.dom[e])) continue;
          if (m.withValue(e, v).dead) {
            m = m.withoutValue(e, v);
            changed = true;
          }
        }
      }
    }
    return m;
  }

  private toDead(): PencilsModel {
    return new PencilsModel(this.spec, this.dom, true);
  }

  /** Restrict edge e to `mask`; false when nothing is left. Queues the edge on change. */
  private restrict(e: number, mask: number): boolean {
    const next = this.dom[e] & mask;
    if (next === this.dom[e]) return true;
    if (!next) return false;
    this.dom[e] = next;
    this.queue.push(e);
    return true;
  }

  private queue: number[] = [];

  /**
   * Run every rule to a fixpoint, mutating `this.dom` (the caller copied it). With no
   * edges given every rule runs once first; after that only the rules on changed edges.
   */
  private propagate(changed?: number[]): PencilsModel {
    const { spec } = this;
    this.queue = changed ? [...changed] : [];
    if (!changed) {
      for (let x = 0; x < spec.cellCount; x++) if (!this.applyCell(x)) return this.toDead();
      for (const rule of spec.numberRules) if (!this.applyNumber(rule)) return this.toDead();
      for (let x = 0; x < spec.cellCount; x++) if (!this.applyChainAt(x)) return this.toDead();
    }
    const ruleStamp = new Int32Array(spec.numberRules.length);
    let round = 0;
    for (let qi = 0; qi < this.queue.length; qi++) {
      const e = this.queue[qi];
      round++;
      for (let i = 0; i < 2; i++) if (!this.applyCell(spec.ends[2 * e + i])) return this.toDead();
      for (const id of spec.rulesOfEdge[e]) {
        if (ruleStamp[id] === round) continue;
        ruleStamp[id] = round;
        if (!this.applyNumber(spec.numberRules[id])) return this.toDead();
      }
      for (let i = 0; i < 2; i++) if (!this.applyChainAt(spec.ends[2 * e + i])) return this.toDead();
    }
    this.queue = [];
    return this;
  }

  /** Keep the cell's configurations consistent with its edges; prune unsupported values. */
  private applyCell(x: number): boolean {
    const { spec, dom } = this;
    const table = spec.tables[x];
    const base = x * 4;
    const e0 = spec.edgeOf[base], e1 = spec.edgeOf[base + 1], e2 = spec.edgeOf[base + 2], e3 = spec.edgeOf[base + 3];
    const d0 = e0 >= 0 ? dom[e0] : NONE, d1 = e1 >= 0 ? dom[e1] : NONE, d2 = e2 >= 0 ? dom[e2] : NONE, d3 = e3 >= 0 ? dom[e3] : NONE;
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (let i = 0; i < table.length; i++) {
      const t = table[i];
      const v0 = t & 7, v1 = (t >> 3) & 7, v2 = (t >> 6) & 7, v3 = (t >> 9) & 7;
      if (!(d0 & v0) || !(d1 & v1) || !(d2 & v2) || !(d3 & v3)) continue;
      s0 |= v0;
      s1 |= v1;
      s2 |= v2;
      s3 |= v3;
    }
    if (!s0) return false;
    return (e0 < 0 || this.restrict(e0, s0)) && (e1 < 0 || this.restrict(e1, s1)) && (e2 < 0 || this.restrict(e2, s2)) && (e3 < 0 || this.restrict(e3, s3));
  }

  /** A numbered cell's live body placements; fix what they all agree on. */
  private applyNumber(rule: { cell: number; placements: Placement[] }): boolean {
    const { dom } = this;
    const live = rule.placements.filter((p) => p.edges.every((e, i) => dom[e] & p.values[i]));
    if (live.length === 0) return false;
    const first = live[0];
    for (let i = 0; i < first.edges.length; i++) {
      const e = first.edges[i];
      const v = first.values[i];
      if (live.every((p) => p.edges.some((f, j) => f === e && p.values[j] === v)) && !this.restrict(e, v)) return false;
    }
    return true;
  }

  private linkAt(x: number, s: number): number {
    const e = this.spec.edgeOf[x * 4 + s];
    return e >= 0 && (this.dom[e] === BODY || this.dom[e] === TRAIL) ? e : -1;
  }

  /** True when x can gain no more links (all its edges are decided). */
  private closed = (x: number): boolean => {
    for (let s = 0; s < 4; s++) {
      const e = this.spec.edgeOf[x * 4 + s];
      if (e >= 0 && !single(this.dom[e])) return false;
    }
    return true;
  };

  /**
   * The chain of decided links (BODY/TRAIL edges) through cell x, if any: its ends, head
   * and lengths. See the class comment for the rules applied.
   */
  private applyChainAt(x0: number): boolean {
    const { spec, dom } = this;
    const n = spec.cellCount;
    // Walk to one end of the chain (cells have at most two links, by the cell rule).
    let start = x0;
    let prevEdge = -1;
    for (let guard = 0; ; guard++) {
      if (guard > n) return false;
      let next = -1;
      for (let s = 0; s < 4; s++) {
        const e = this.linkAt(start, s);
        if (e >= 0 && e !== prevEdge) {
          next = e;
          break;
        }
      }
      if (next < 0) break;
      const other = spec.ends[2 * next] === start ? spec.ends[2 * next + 1] : spec.ends[2 * next];
      if (other === x0) return false; // a cycle: no pencil is a loop
      prevEdge = next;
      start = other;
    }
    if (start === x0 && prevEdge < 0) {
      // x0 is an end (or has no links): fine, walk from it.
      let any = false;
      for (let s = 0; s < 4; s++) if (this.linkAt(x0, s) >= 0) any = true;
      if (!any) return true;
    }
    // Walk the chain from that end, recording cells and link kinds.
    const cells: number[] = [start];
    const kinds: number[] = [];
    let cur = start;
    let prev = -1;
    for (;;) {
      let next = -1;
      for (let s = 0; s < 4; s++) {
        const e = this.linkAt(cur, s);
        if (e >= 0 && e !== prev) {
          next = e;
          break;
        }
      }
      if (next < 0) break;
      const other = spec.ends[2 * next] === cur ? spec.ends[2 * next + 1] : spec.ends[2 * next];
      if (cells.length > n) return false;
      kinds.push(dom[next]);
      cells.push(other);
      prev = next;
      cur = other;
    }
    return this.checkChain(cells, kinds, this.closed);
  }

  /**
   * One chain: cells[0..m], kinds[i] the link between cells[i] and cells[i+1]. Applies the
   * length rules (see the class comment).
   */
  private checkChain(cells: number[], kinds: number[], closed: (x: number) => boolean): boolean {
    const { spec } = this;
    let headAt = -1;
    for (let i = 1; i < cells.length; i++) {
      if (i < kinds.length && kinds[i - 1] !== kinds[i]) {
        if (headAt >= 0) return false; // two heads
        headAt = i;
      }
    }
    const firstClosed = closed(cells[0]);
    const lastClosed = closed(cells[cells.length - 1]);
    // Orient so the body side (if known) comes first.
    let cs = cells;
    let ks = kinds;
    if (headAt >= 0 && ks[0] === TRAIL) {
      cs = [...cells].reverse();
      ks = [...kinds].reverse();
      headAt = cs.length - 1 - headAt;
    }
    const startClosed = cs === cells ? firstClosed : lastClosed;
    const endClosed = cs === cells ? lastClosed : firstClosed;
    // Numbers on the chain's body cells.
    let number = 0;
    const bodyEnd = headAt >= 0 ? headAt : ks[0] === BODY ? cs.length : 0;
    for (let i = 0; i < bodyEnd; i++) {
      const v = spec.canon[cs[i]];
      if (v > 0) {
        if (number && number !== v) return false;
        number = v;
      }
    }

    if (headAt < 0) {
      // No head yet: a closed chain can't be a pencil.
      if (startClosed && endClosed) return false;
      if (ks[0] === BODY && number && cs.length > number + 1) return false; // body cells plus a head
      return true;
    }
    const body = headAt; // body cells: cs[0..headAt-1]
    const trail = cs.length - 1 - headAt; // trail cells after the head
    if (number && body > number) return false;
    let n = number;
    if (startClosed) {
      if (n && body !== n) return false;
      n = body;
    }
    if (endClosed) {
      if (n && trail !== n) return false;
      if (!n) n = trail;
      if (startClosed && body !== trail) return false;
      if (body > n) return false;
      if (body === n && !startClosed && !this.cap(cs[0], cs[1])) return false;
    }
    if (n) {
      if (trail > n || body > n) return false;
      if (trail === n && !endClosed && !this.cap(cs[cs.length - 1], cs[cs.length - 2])) return false;
      if (body === n && !startClosed && !this.cap(cs[0], cs[1])) return false;
    }
    return true;
  }

  /** End the chain at cell x (its neighbour on the chain is `from`): all its other edges NONE. */
  private cap(x: number, from: number): boolean {
    const { spec } = this;
    for (let s = 0; s < 4; s++) {
      const e = spec.edgeOf[x * 4 + s];
      if (e < 0) continue;
      const other = spec.ends[2 * e] === x ? spec.ends[2 * e + 1] : spec.ends[2 * e];
      if (other === from) continue;
      if (!this.restrict(e, NONE)) return false;
    }
    return true;
  }

  /** Every pencil on a fully decided board: cells take roles, chains are pencils. */
  private checkFull(): boolean {
    const { spec, dom } = this;
    for (let x = 0; x < spec.cellCount; x++) if (!this.applyCell(x)) return false;
    // Chains: every chain closed, one head, equal lengths, numbers matching.
    const seen = new Uint8Array(spec.cellCount);
    for (let x = 0; x < spec.cellCount; x++) {
      if (seen[x]) continue;
      // Each cell has 1 or 2 links (tables), so walk from an end.
      let deg = 0;
      for (let s = 0; s < 4; s++) {
        const e = spec.edgeOf[x * 4 + s];
        if (e >= 0 && dom[e] !== NONE) deg++;
      }
      if (deg !== 1) continue;
      const cells = [x];
      const kinds: number[] = [];
      seen[x] = 1;
      let cur = x;
      let prev = -1;
      for (;;) {
        let next = -1;
        for (let s = 0; s < 4; s++) {
          const e = spec.edgeOf[cur * 4 + s];
          if (e >= 0 && e !== prev && dom[e] !== NONE) next = e;
        }
        if (next < 0) break;
        const other = spec.ends[2 * next] === cur ? spec.ends[2 * next + 1] : spec.ends[2 * next];
        seen[other] = 1;
        kinds.push(dom[next]);
        cells.push(other);
        prev = next;
        cur = other;
      }
      const heads = kinds.filter((k, i) => i > 0 && k !== kinds[i - 1]).length;
      if (heads !== 1) return false;
      const body = kinds.filter((k) => k === BODY).length;
      const trail = kinds.length - body;
      if (body !== trail) return false;
      const bodyCells = kinds[0] === BODY ? cells.slice(0, body) : cells.slice(cells.length - body);
      if (bodyCells.some((y) => spec.canon[y] > 0 && spec.canon[y] !== body)) return false;
    }
    // Every cell lies on some chain with an end (loops were excluded by propagation).
    return seen.every((s) => s === 1);
  }
}

function single(m: number): boolean {
  return m === NONE || m === BODY || m === TRAIL;
}

function popcount(m: number): number {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
}
