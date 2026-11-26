/**
 * Big-nonogram strip editor logic: place strips on the board, combine their
 * readings with manual edits, check the clue set, and find suspect lines.
 *
 * Mirrors parsers/src/puzzle_parsers/nonogram_strips/merge.py (placement and
 * combining); the checks add line-logic propagation, which only the client
 * runs. A strip's position along its axis comes from, in order: a manual
 * offset, a border it shows (first or last line of the board), its thick
 * lines (every 5th, so the offset is known mod 5) together with overlap with
 * strips already placed.
 */
import { nonogramSolveLine } from "@puzzle/solver";
import type { StripLineReading } from "../api/client";

export type Axis = "rows" | "cols";

/** A strip as the merge sees it: its lines in board order, index-aligned. */
export interface StripInput {
  id: string;
  lines: (StripLineReading | null)[];
  thick: boolean[];
  startBorder: boolean;
  endBorder: boolean;
  manualOffset: number | null;
}

export interface Placement {
  offset: number | null;
  how: "manual" | "start border" | "end border" | "overlap" | "unplaced";
  agree: number;
  disagree: number;
  note?: string;
}

export interface Reading {
  stripId: string;
  clues: number[];
  flags: string[];
  boxes: number[][];
}

export type LineStatus = "ok" | "flagged" | "conflict" | "missing" | "edited";

export interface LineResult {
  index: number;
  clues: number[] | null;
  status: LineStatus;
  readings: Reading[];
  flags: string[];
}

const usable = (ln: StripLineReading | null): ln is StripLineReading =>
  !!ln && ln.complete && ln.clues.length > 0;

function phaseOk(s: StripInput, offset: number): boolean {
  if (!s.thick.some(Boolean)) return true;
  return s.thick.every((t, j) => t === ((((offset + j) % 5) + 5) % 5 === 0));
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Where each strip of one axis goes on a board with `length` lines. */
export function placeStrips(strips: StripInput[], length: number): Map<string, Placement> {
  const out = new Map<string, Placement>();
  const placed = new Map<number, number[][]>();
  const put = (s: StripInput, offset: number, how: Placement["how"], agree = 0, disagree = 0) => {
    out.set(s.id, { offset, how, agree, disagree });
    s.lines.forEach((ln, j) => {
      if (usable(ln)) {
        const at = placed.get(offset + j) ?? [];
        at.push(ln.clues);
        placed.set(offset + j, at);
      }
    });
  };
  for (const s of strips) {
    const n = s.lines.length;
    if (s.manualOffset !== null) put(s, s.manualOffset, "manual");
    else if (s.startBorder && s.endBorder && n !== length)
      out.set(s.id, { offset: null, how: "unplaced", agree: 0, disagree: 0, note: `shows both borders but has ${n} lines, not ${length}` });
    else if (s.startBorder) put(s, 0, "start border");
    else if (s.endBorder) put(s, length - n, "end border");
  }
  // Overlap, most confident first, until nothing more can be placed.
  for (;;) {
    let best: { s: StripInput; score: number; agree: number; disagree: number; offset: number } | null = null;
    for (const s of strips) {
      if (out.has(s.id)) continue;
      const n = s.lines.length;
      const scored: { score: number; agree: number; disagree: number; offset: number }[] = [];
      for (let o = -n + 1; o < length; o++) {
        if (!phaseOk(s, o)) continue;
        let agree = 0, disagree = 0;
        s.lines.forEach((ln, j) => {
          if (!usable(ln)) return;
          for (const other of placed.get(o + j) ?? []) {
            if (same(other, ln.clues)) agree++;
            else disagree++;
          }
        });
        scored.push({ score: agree - 3 * disagree, agree, disagree, offset: o });
      }
      scored.sort((a, b) => b.score - a.score);
      if (!scored.length || scored[0].agree < 3) continue;
      const runner = scored.length > 1 ? scored[1].score : -999;
      if (scored[0].score - runner < 3) continue; // ambiguous
      if (!best || scored[0].score > best.score) best = { s, ...scored[0] };
    }
    if (!best) break;
    put(best.s, best.offset, "overlap", best.agree, best.disagree);
  }
  for (const s of strips) {
    if (!out.has(s.id))
      out.set(s.id, { offset: null, how: "unplaced", agree: 0, disagree: 0, note: "no border and no clear overlap: set its first line by hand" });
  }
  return out;
}

/** Board lines from the placed strips' readings, with manual edits on top. */
export function combineLines(
  strips: StripInput[],
  placements: Map<string, Placement>,
  length: number,
  edits: Map<number, number[]>,
): LineResult[] {
  const lines: LineResult[] = [];
  for (let idx = 0; idx < length; idx++) {
    const readings: Reading[] = [];
    const flags: string[] = [];
    for (const s of strips) {
      const p = placements.get(s.id);
      if (!p || p.offset === null) continue;
      const ln = s.lines[idx - p.offset];
      if (ln && ln.complete) {
        readings.push({ stripId: s.id, clues: ln.clues, flags: ln.flags, boxes: ln.boxes });
        flags.push(...ln.flags);
      }
    }
    const edit = edits.get(idx);
    if (edit) {
      lines.push({ index: idx, clues: edit, status: "edited", readings, flags });
      continue;
    }
    const distinct = new Map(readings.map((r) => [r.clues.join(","), r.clues]));
    if (!readings.length) lines.push({ index: idx, clues: null, status: "missing", readings, flags });
    else if (distinct.size > 1) lines.push({ index: idx, clues: null, status: "conflict", readings, flags });
    else {
      const clues = [...distinct.values()][0];
      lines.push({ index: idx, clues, status: flags.length || !clues.length ? "flagged" : "ok", readings, flags });
    }
  }
  return lines;
}

/** "3 1 12" or "3, 1, 12" -> [3, 1, 12]; null when not a clue list. */
export function parseClueText(text: string): number[] | null {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  if (!parts.length) return null;
  const nums = parts.map(Number);
  return nums.every((n) => Number.isInteger(n) && n >= 0) ? nums : null;
}

export interface Check {
  name: string;
  ok: boolean;
  blocking: boolean;
  detail: string;
}

const minLength = (c: number[]) => c.reduce((a, b) => a + b, 0) + Math.max(0, c.length - 1);
const list = (xs: number[]) => (xs.length > 12 ? `${xs.slice(0, 12).join(", ")}, …` : xs.join(", "));

/** Format checks on the combined clue set; blocking ones stop creation. */
export function checkClues(rows: LineResult[], cols: LineResult[]): Check[] {
  const out: Check[] = [];
  for (const [axis, lines, other] of [["Rows", rows, cols], ["Columns", cols, rows]] as const) {
    const unsettled = lines.filter((l) => l.clues === null).map((l) => l.index + 1);
    out.push({
      name: `${axis} read`,
      ok: !unsettled.length,
      blocking: true,
      detail: unsettled.length ? `${unsettled.length} missing or disagreeing: ${list(unsettled)}` : `all ${lines.length} read`,
    });
    const overflow = lines.filter((l) => l.clues && minLength(l.clues) > other.length).map((l) => l.index + 1);
    out.push({
      name: `${axis} fit`,
      ok: !overflow.length,
      blocking: true,
      detail: overflow.length ? `clues longer than ${other.length} cells: ${list(overflow)}` : "every line fits",
    });
    const flagged = lines.filter((l) => l.status === "flagged").map((l) => l.index + 1);
    out.push({
      name: `${axis} to look at`,
      ok: !flagged.length,
      blocking: false,
      detail: flagged.length ? `${flagged.length} with a doubtful reading: ${list(flagged)}` : "no doubtful readings",
    });
  }
  if ([...rows, ...cols].every((l) => l.clues !== null)) {
    const rs = rows.reduce((a, l) => a + l.clues!.reduce((x, y) => x + y, 0), 0);
    const cs = cols.reduce((a, l) => a + l.clues!.reduce((x, y) => x + y, 0), 0);
    out.push({
      name: "Totals",
      ok: rs === cs,
      blocking: true,
      detail: rs === cs ? `rows and columns both add up to ${rs}` : `rows add up to ${rs}, columns to ${cs} (off by ${Math.abs(rs - cs)})`,
    });
  } else {
    out.push({ name: "Totals", ok: false, blocking: true, detail: "every line must be read first" });
  }
  return out;
}

// --- line-logic propagation ------------------------------------------------

export type LineId = `r${number}` | `c${number}`;

export interface Propagation {
  /** The first line that could not take its clues, or null. */
  contradiction: LineId | null;
  /** Cells line logic settled (all of them: the clues have a unique picture). */
  settled: number;
  total: number;
}

/** Line-solve every row and column to a fixpoint, optionally skipping one line. */
export function propagate(rowClues: number[][], colClues: number[][], skip?: LineId): Propagation {
  const R = rowClues.length, C = colClues.length;
  const g = new Int8Array(R * C).fill(-1);
  const queue: LineId[] = [];
  for (let i = 0; i < R; i++) queue.push(`r${i}`);
  for (let j = 0; j < C; j++) queue.push(`c${j}`);
  const inQueue = new Set<string>(queue);
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    inQueue.delete(id);
    if (id === skip) continue;
    const isRow = id[0] === "r";
    const k = Number(id.slice(1));
    const n = isRow ? C : R;
    const cells = new Array<number>(n);
    for (let t = 0; t < n; t++) cells[t] = isRow ? g[k * C + t] : g[t * C + k];
    const res = nonogramSolveLine(cells, isRow ? rowClues[k] : colClues[k]);
    if (!res) return { contradiction: id, settled: 0, total: R * C };
    for (let t = 0; t < n; t++) {
      if (cells[t] === -1 && res[t] !== -1) {
        if (isRow) g[k * C + t] = res[t];
        else g[t * C + k] = res[t];
        const other: LineId = isRow ? `c${t}` : `r${t}`;
        if (!inQueue.has(other)) {
          queue.push(other);
          inQueue.add(other);
        }
      }
    }
  }
  let settled = 0;
  for (const v of g) if (v !== -1) settled++;
  return { contradiction: null, settled, total: R * C };
}

/**
 * Lines whose removal alone clears every contradiction: almost always the
 * misread line itself. Yields between lines so the page stays responsive.
 */
export async function findSuspects(
  rowClues: number[][],
  colClues: number[][],
  onProgress?: (done: number, total: number) => void,
): Promise<LineId[]> {
  const ids: LineId[] = [
    ...rowClues.map((_, i) => `r${i}` as LineId),
    ...colClues.map((_, j) => `c${j}` as LineId),
  ];
  const out: LineId[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (propagate(rowClues, colClues, ids[i]).contradiction === null) out.push(ids[i]);
    if (i % 5 === 4) {
      onProgress?.(i + 1, ids.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(ids.length, ids.length);
  return out;
}

export const lineLabel = (id: LineId) => `${id[0] === "r" ? "Row" : "Column"} ${Number(id.slice(1)) + 1}`;
