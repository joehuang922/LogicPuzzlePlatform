// Irregular Nonogram (type 45) rules, shared by the board, the editor, the extractor and
// the progress calculator. The Android engine and authoring port these functions; the
// API's semanticChecks mirror irregularNonogramFormatProblems.
import { IrregularNonogramCanon, IrregularNonogramClue } from "../types/canon";
import { analyzeLineStatus, CellState, ClueStatus as NumberStatus } from "../liveValidators/nonogram";

export type Axis = "row" | "col";

/** A maximal run of board cells along one row or column. */
export interface Segment {
  axis: Axis;
  /** The row (axis "row") or column (axis "col") index. */
  line: number;
  /** First cell along the line: a column for a row segment, a row for a column one. */
  start: number;
  length: number;
}

/** Cells as [row, col]. */
export type Cell = [number, number];

export function segmentKey(axis: Axis, line: number, start: number): string {
  return `${axis}:${line}:${start}`;
}

export function segmentCells(s: Segment): Cell[] {
  return Array.from({ length: s.length }, (_, i) =>
    s.axis === "row" ? [s.line, s.start + i] : [s.start + i, s.line]
  );
}

const isBoard = (canon: IrregularNonogramCanon, r: number, c: number) =>
  r >= 0 && c >= 0 && r < canon.height && c < canon.width && canon.cells[r]?.[c] === 1;

/** Every row and column segment of the board. */
export function segments(canon: IrregularNonogramCanon): Segment[] {
  const out: Segment[] = [];
  for (let r = 0; r < canon.height; r++) {
    for (let c = 0; c < canon.width; c++) {
      if (!isBoard(canon, r, c) || isBoard(canon, r, c - 1)) continue;
      let n = 0;
      while (isBoard(canon, r, c + n)) n++;
      out.push({ axis: "row", line: r, start: c, length: n });
    }
  }
  for (let c = 0; c < canon.width; c++) {
    for (let r = 0; r < canon.height; r++) {
      if (!isBoard(canon, r, c) || isBoard(canon, r - 1, c)) continue;
      let n = 0;
      while (isBoard(canon, r + n, c)) n++;
      out.push({ axis: "col", line: c, start: r, length: n });
    }
  }
  return out;
}

/** The segment holding a cell along an axis, or null for a non-board cell. */
export function segmentAt(canon: IrregularNonogramCanon, axis: Axis, r: number, c: number): Segment | null {
  if (!isBoard(canon, r, c)) return null;
  if (axis === "row") {
    let s = c;
    while (isBoard(canon, r, s - 1)) s--;
    let e = c;
    while (isBoard(canon, r, e + 1)) e++;
    return { axis, line: r, start: s, length: e - s + 1 };
  }
  let s = r;
  while (isBoard(canon, s - 1, c)) s--;
  let e = r;
  while (isBoard(canon, e + 1, c)) e++;
  return { axis, line: c, start: s, length: e - s + 1 };
}

/** A clue entry tagged with its axis and line, whichever list it came from. */
export interface ClueRef {
  axis: Axis;
  line: number;
  entry: IrregularNonogramClue;
}

export function clueRefs(canon: IrregularNonogramCanon): ClueRef[] {
  return [
    ...canon.rowClues.map((e) => ({ axis: "row" as const, line: e.row, entry: e })),
    ...canon.colClues.map((e) => ({ axis: "col" as const, line: e.col, entry: e })),
  ];
}

/** Clue entries by segment key (the first entry wins when a segment has two). */
export function cluesBySegment(canon: IrregularNonogramCanon): Map<string, ClueRef> {
  const map = new Map<string, ClueRef>();
  for (const ref of clueRefs(canon)) {
    const key = segmentKey(ref.axis, ref.line, ref.entry.start);
    if (!map.has(key)) map.set(key, ref);
  }
  return map;
}

/**
 * The lattice cells a clue block occupies, nearest the board first: one per number, on
 * the segment's line, before its first cell (side "start") or after its last ("end").
 * May fall outside the bounding box. Needs the segment's length for the "end" side.
 */
export function clueBlockCells(ref: ClueRef, length: number): Cell[] {
  const k = ref.entry.clues.length;
  const { start, side } = ref.entry;
  const positions = Array.from({ length: k }, (_, i) => (side === "start" ? start - 1 - i : start + length + i));
  return positions.map((p) => (ref.axis === "row" ? [ref.line, p] : [p, ref.line]));
}

/**
 * Where each number of a clue is drawn, in reading order: [row, col, value]. A clue on
 * the start side reads toward the board (its last number touches the board); on the end
 * side away from it (its first number touches the board).
 */
export function clueLayout(ref: ClueRef, length: number): [number, number, number][] {
  const cells = clueBlockCells(ref, length);
  const ordered = ref.entry.side === "start" ? cells.slice().reverse() : cells;
  return ordered.map(([r, c], i) => [r, c, ref.entry.clues[i]]);
}

export interface Problem {
  message: string;
  cells: Cell[];
}

const at = (r: number, c: number) => `R${r + 1}C${c + 1}`;

/** Format problems: the canon can't be a question (or drawn). The API rejects the same. */
export function irregularNonogramFormatProblems(canon: IrregularNonogramCanon): Problem[] {
  const problems: Problem[] = [];
  const { width, height } = canon;
  if (canon.cells.length !== height || canon.cells.some((row) => row.length !== width)) {
    return [{ message: `cells must be ${height} x ${width}`, cells: [] }];
  }
  const segs = new Map(segments(canon).map((s) => [segmentKey(s.axis, s.line, s.start), s]));
  if (segs.size === 0) problems.push({ message: "The board has no cells", cells: [] });
  const seen = new Set<string>();
  // Lattice cells taken so far: the board, then each clue block.
  const taken = new Map<string, string>();
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) if (canon.cells[r][c] === 1) taken.set(`${r},${c}`, "the board");
  for (const ref of clueRefs(canon)) {
    const { line, entry } = ref;
    const name = ref.axis === "row" ? `Row ${line + 1} clue at ${at(line, entry.start)}` : `Column ${line + 1} clue at ${at(entry.start, line)}`;
    const key = segmentKey(ref.axis, line, entry.start);
    const seg = segs.get(key);
    const first: Cell = ref.axis === "row" ? [line, entry.start] : [entry.start, line];
    if (!seg) {
      problems.push({ message: `${name} doesn't start a ${ref.axis === "row" ? "row" : "column"} piece of the board`, cells: isBoard(canon, ...first) ? [first] : [] });
      continue;
    }
    if (seen.has(key)) {
      problems.push({ message: `${name}: the piece has two clues`, cells: segmentCells(seg) });
      continue;
    }
    seen.add(key);
    const need = entry.clues.reduce((a, b) => a + b, 0) + entry.clues.length - 1;
    if (need > seg.length) {
      problems.push({ message: `${name} (${entry.clues.join(" ")}) doesn't fit its ${seg.length} cells`, cells: segmentCells(seg) });
    }
    for (const [r, c] of clueBlockCells(ref, seg.length)) {
      const other = taken.get(`${r},${c}`);
      if (other) {
        problems.push({ message: `${name} overlaps ${other} at ${at(r, c)}`, cells: isBoard(canon, r, c) ? [[r, c]] : [] });
        break;
      }
    }
    for (const [r, c] of clueBlockCells(ref, seg.length)) {
      if (!taken.has(`${r},${c}`)) taken.set(`${r},${c}`, name.toLowerCase());
    }
  }
  return problems;
}

/** Misread warnings (overridable): pieces with no clue. */
export function irregularNonogramWarnings(canon: IrregularNonogramCanon): Problem[] {
  const clued = cluesBySegment(canon);
  const missing = segments(canon).filter((s) => !clued.has(segmentKey(s.axis, s.line, s.start)));
  if (missing.length === 0) return [];
  return [
    {
      message: `${missing.length} piece${missing.length === 1 ? " has" : "s have"} no clue`,
      cells: missing.flatMap((s) => [segmentCells(s)[0]]),
    },
  ];
}

/** The drawing's lattice bounds: board plus every clue block, [minRow, minCol, maxRow, maxCol]. */
export function layoutBounds(canon: IrregularNonogramCanon): [number, number, number, number] {
  let minR = 0;
  let minC = 0;
  let maxR = canon.height - 1;
  let maxC = canon.width - 1;
  const segs = new Map(segments(canon).map((s) => [segmentKey(s.axis, s.line, s.start), s]));
  for (const ref of clueRefs(canon)) {
    const seg = segs.get(segmentKey(ref.axis, ref.line, ref.entry.start));
    if (!seg) continue;
    for (const [r, c] of clueBlockCells(ref, seg.length)) {
      minR = Math.min(minR, r);
      minC = Math.min(minC, c);
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
    }
  }
  return [minR, minC, maxR, maxC];
}

// ---- Lines --------------------------------------------------------------------------

/** Runs of filled cells in a line of booleans. */
export function runs(filled: boolean[]): number[] {
  const out: number[] = [];
  let n = 0;
  for (const f of filled) {
    if (f) n++;
    else if (n) {
      out.push(n);
      n = 0;
    }
  }
  if (n) out.push(n);
  return out;
}

/**
 * Whether a line's decided cells (1 filled, 2 crossed, 0 undecided) still fit its clue:
 * some placement of the runs fills every filled cell and no crossed one. DP over
 * (run index, position).
 */
export function lineFits(states: number[], clues: number[]): boolean {
  const n = states.length;
  const k = clues.length;
  // ok[j][i]: runs j..k-1 fit in cells i..n-1.
  const ok: boolean[][] = Array.from({ length: k + 1 }, () => Array(n + 2).fill(false));
  ok[k][n] = true;
  for (let i = n - 1; i >= 0; i--) ok[k][i] = states[i] !== 1 && ok[k][i + 1];
  ok[k][n + 1] = true;
  for (let j = k - 1; j >= 0; j--) {
    const len = clues[j];
    for (let i = n; i >= 0; i--) {
      // Leave cell i empty, or place run j at i.
      let v = i < n && states[i] !== 1 && ok[j][i + 1];
      if (!v && i + len <= n) {
        let fits = true;
        for (let t = i; t < i + len; t++) if (states[t] === 2) fits = false;
        if (fits) {
          if (i + len === n) v = j === k - 1;
          else v = states[i + len] !== 1 && ok[j + 1][i + len + 1];
        }
      }
      ok[j][i] = v;
    }
  }
  return ok[0][0];
}

/** Player state of a cell: 0 unset, 1 filled, 2 crossed. Keys "col,row" (Nonogram's). */
export function cellState(values: Record<string, number>, r: number, c: number): number {
  const v = values[`${c},${r}`];
  return v === 1 || v === 2 ? v : 0;
}

export interface ClueStatus {
  /** Segments whose filled cells match the clue exactly. */
  satisfied: Set<string>;
  /** Segments whose decided cells can no longer fit the clue. */
  broken: Set<string>;
  /**
   * Per number of each segment's clue (in reading order), Nonogram's per-number status
   * (liveValidators/nonogram analyzeLineStatus): a number greys out as soon as its run is
   * settled from either end, not only when the whole piece is done.
   */
  numbers: Map<string, NumberStatus[]>;
}

export function clueStatus(canon: IrregularNonogramCanon, values: Record<string, number>): ClueStatus {
  const satisfied = new Set<string>();
  const broken = new Set<string>();
  const numbers = new Map<string, NumberStatus[]>();
  const clued = cluesBySegment(canon);
  for (const s of segments(canon)) {
    const key = segmentKey(s.axis, s.line, s.start);
    const ref = clued.get(key);
    if (!ref) continue;
    const states = segmentCells(s).map(([r, c]) => cellState(values, r, c));
    const filled = states.map((v) => v === 1);
    const got = runs(filled);
    if (got.length === ref.entry.clues.length && got.every((n, i) => n === ref.entry.clues[i])) satisfied.add(key);
    if (!lineFits(states, ref.entry.clues)) broken.add(key);
    numbers.set(key, analyzeLineStatus(ref.entry.clues, states as CellState[]).perClue);
  }
  return { satisfied, broken, numbers };
}

/** Solved: every clued segment's filled runs equal its clue (crosses count as empty). */
export function isIrregularNonogramSolved(canon: IrregularNonogramCanon, values: Record<string, number>): boolean {
  const clued = cluesBySegment(canon);
  if (clued.size === 0) return false;
  for (const s of segments(canon)) {
    const ref = clued.get(segmentKey(s.axis, s.line, s.start));
    if (!ref) continue;
    const got = runs(segmentCells(s).map(([r, c]) => cellState(values, r, c) === 1));
    if (got.length !== ref.entry.clues.length || got.some((n, i) => n !== ref.entry.clues[i])) return false;
  }
  return true;
}

/** Board cells filled or crossed / board cells, 0-100 (Nonogram's metric). */
export function irregularNonogramProgress(canon: IrregularNonogramCanon, values: Record<string, number>): number {
  let total = 0;
  let decided = 0;
  for (let r = 0; r < canon.height; r++) {
    for (let c = 0; c < canon.width; c++) {
      if (canon.cells[r]?.[c] !== 1) continue;
      total++;
      if (cellState(values, r, c) !== 0) decided++;
    }
  }
  return total === 0 ? 0 : Math.min(100, (decided / total) * 100);
}

/**
 * The answer { cells }: height x width, 0 unset, 1 filled, 2 crossed (Android Nonogram's
 * format): crosses are kept so a reload restores them. Off-board cells are 0.
 */
export function irregularNonogramAnswer(canon: IrregularNonogramCanon, values: Record<string, number>): { cells: number[][] } {
  return {
    cells: Array.from({ length: canon.height }, (_, r) =>
      Array.from({ length: canon.width }, (_, c) => (canon.cells[r]?.[c] === 1 ? cellState(values, r, c) : 0))
    ),
  };
}

/** "col,row" values back from a saved answer: 1 filled, 2 crossed. */
export function irregularNonogramValues(answer: { cells?: number[][] } | null | undefined): Record<string, number> {
  const values: Record<string, number> = {};
  answer?.cells?.forEach((row, r) => row.forEach((v, c) => { if (v === 1 || v === 2) values[`${c},${r}`] = v; }));
  return values;
}

export function parseIrregularNonogramCanon(canonRepr: unknown): IrregularNonogramCanon {
  return (typeof canonRepr === "string" ? JSON.parse(canonRepr) : canonRepr) as IrregularNonogramCanon;
}
