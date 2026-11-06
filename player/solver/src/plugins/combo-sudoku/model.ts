import { Branch, ConstraintModel } from "../../types";

/**
 * Canonical combo sudoku (schemas/canon/combo-sudoku.json): 9x9 boards placed on a
 * shared lattice of 3x3 rooms. Board (x, y) covers cells 3x..3x+8 by 3y..3y+8, so two
 * boards that overlap share whole rooms, and a shared cell must satisfy every board.
 */
export interface ComboSudokuCanon {
  room_width?: number;
  room_height?: number;
  subboards: { x: number; y: number; hints: number[][] }[];
}

/** The solution, in the answer's own shape: every board's filled 9x9 grid. */
export interface ComboSudokuSolution {
  subboards: { x: number; y: number; answers: number[][] }[];
}

const FULL = 0b1111111110; // bits 1..9 set (bit v = value v)
const isSingle = (mask: number) => mask !== 0 && (mask & (mask - 1)) === 0;
const onlyValue = (mask: number) => 31 - Math.clz32(mask);

function popcount(mask: number): number {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
}

/**
 * The layout's constraint structure, built once per canon and shared by every model in
 * a search: cells numbered in first-seen order, each unit (a board's row, column or box;
 * a box two boards share counted once) as cell ids, and per cell its peers and units.
 */
class Layout {
  readonly size: number;
  readonly units: Int32Array[];
  readonly peers: Int32Array[];
  readonly cellUnits: Int32Array[];
  /** Per board, its 81 cell ids in row-major order (for the solution). */
  readonly boardCells: Int32Array[];
  readonly boards: { x: number; y: number }[];
  /** Givens as (cell id, digit); two boards may both give a shared cell. */
  readonly givens: [number, number][];

  constructor(canon: ComboSudokuCanon) {
    const ids = new Map<string, number>();
    const idOf = (col: number, row: number) => {
      const key = `${col},${row}`;
      let id = ids.get(key);
      if (id === undefined) {
        id = ids.size;
        ids.set(key, id);
      }
      return id;
    };

    this.boards = canon.subboards.map(({ x, y }) => ({ x, y }));
    this.boardCells = [];
    this.givens = [];
    const unitKeys = new Set<string>();
    const units: number[][] = [];
    const addUnit = (cells: number[]) => {
      const key = [...cells].sort((a, b) => a - b).join(",");
      if (unitKeys.has(key)) return;
      unitKeys.add(key);
      units.push(cells);
    };

    for (const sb of canon.subboards) {
      const c0 = 3 * sb.x;
      const r0 = 3 * sb.y;
      const cells: number[] = [];
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const id = idOf(c0 + c, r0 + r);
          cells.push(id);
          const v = sb.hints[r]?.[c] ?? 0;
          if (v >= 1 && v <= 9) this.givens.push([id, v]);
        }
      }
      this.boardCells.push(Int32Array.from(cells));
      for (let i = 0; i < 9; i++) {
        addUnit(cells.slice(i * 9, i * 9 + 9)); // row
        addUnit(Array.from({ length: 9 }, (_, k) => cells[k * 9 + i])); // column
      }
      for (let br = 0; br < 9; br += 3) {
        for (let bc = 0; bc < 9; bc += 3) {
          const box: number[] = [];
          for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) box.push(cells[(br + dr) * 9 + bc + dc]);
          addUnit(box);
        }
      }
    }

    this.size = ids.size;
    this.units = units.map((u) => Int32Array.from(u));
    const peerSets = Array.from({ length: this.size }, () => new Set<number>());
    const cellUnits: number[][] = Array.from({ length: this.size }, () => []);
    units.forEach((unit, u) => {
      for (const id of unit) {
        cellUnits[id].push(u);
        for (const other of unit) if (other !== id) peerSets[id].add(other);
      }
    });
    this.peers = peerSets.map((s) => Int32Array.from(s));
    this.cellUnits = cellUnits.map((u) => Int32Array.from(u));
  }

  /**
   * Narrow cell [id] to [mask] and propagate to a fixpoint: a solved cell's digit leaves
   * its peers (naked single), and a digit with one place left in a unit goes there
   * (hidden single). Hidden singles matter here: overlapping boards constrain each other
   * mostly through shared boxes, which naked singles alone barely carry across (a 5-board
   * sample needs ~477k search nodes without them, 5 with). Mutates [d]; false on a
   * contradiction.
   */
  restrict(d: Uint16Array, id: number, mask: number): boolean {
    const queue: number[] = [];
    const dirty = new Uint8Array(this.units.length);
    const dirtyList: number[] = [];

    const narrow = (cell: number, m: number): boolean => {
      const next = d[cell] & m;
      if (next === d[cell]) return true;
      if (next === 0) return false;
      d[cell] = next;
      queue.push(cell);
      for (const u of this.cellUnits[cell]) {
        if (!dirty[u]) {
          dirty[u] = 1;
          dirtyList.push(u);
        }
      }
      return true;
    };

    if (!narrow(id, mask)) return false;
    for (;;) {
      while (queue.length > 0) {
        const cell = queue.pop()!;
        const m = d[cell];
        if (!isSingle(m)) continue;
        for (const p of this.peers[cell]) if (!narrow(p, ~m)) return false;
      }
      if (dirtyList.length === 0) return true;
      const u = dirtyList.pop()!;
      dirty[u] = 0;
      const unit = this.units[u];
      for (let v = 1; v <= 9; v++) {
        const b = 1 << v;
        let place = -1;
        let count = 0;
        for (const cell of unit) {
          if (d[cell] & b) {
            place = cell;
            if (++count > 1) break;
          }
        }
        if (count === 0) return false;
        if (count === 1 && !narrow(place, b)) return false;
      }
    }
  }
}

export class ComboSudokuModel implements ConstraintModel<ComboSudokuSolution> {
  private constructor(
    private readonly layout: Layout,
    private readonly domains: Uint16Array,
    private readonly dead: boolean,
  ) {}

  static fromCanon(canon: ComboSudokuCanon): ComboSudokuModel {
    const layout = new Layout(canon);
    const domains = new Uint16Array(layout.size).fill(FULL);
    let alive = layout.size > 0;
    // Two boards giving a shared cell different digits wipe its domain: "none".
    for (const [id, v] of layout.givens) {
      if (!alive) break;
      alive = layout.restrict(domains, id, 1 << v);
    }
    return new ComboSudokuModel(layout, domains, !alive);
  }

  isDead(): boolean {
    return this.dead;
  }

  isSolved(): boolean {
    return !this.dead && this.domains.every(isSingle);
  }

  selectBranch(): Branch | null {
    let bestId = -1;
    let bestCount = 10;
    for (let id = 0; id < this.domains.length; id++) {
      const mask = this.domains[id];
      if (isSingle(mask)) continue;
      const count = popcount(mask);
      if (count < bestCount) {
        bestCount = count;
        bestId = id;
        if (count === 2) break;
      }
    }
    if (bestId === -1) return null;
    const candidates: number[] = [];
    for (let v = 1; v <= 9; v++) if (this.domains[bestId] & (1 << v)) candidates.push(v);
    return { id: bestId, candidates };
  }

  assign(id: number, value: number): ComboSudokuModel {
    const next = this.domains.slice();
    const ok = this.layout.restrict(next, id, 1 << value);
    return new ComboSudokuModel(this.layout, next, !ok);
  }

  solution(): ComboSudokuSolution {
    return {
      subboards: this.layout.boards.map(({ x, y }, i) => {
        const cells = this.layout.boardCells[i];
        const answers: number[][] = [];
        for (let r = 0; r < 9; r++) {
          const row: number[] = [];
          for (let c = 0; c < 9; c++) {
            const mask = this.domains[cells[r * 9 + c]];
            row.push(isSingle(mask) ? onlyValue(mask) : 0);
          }
          answers.push(row);
        }
        return { x, y, answers };
      }),
    };
  }
}
