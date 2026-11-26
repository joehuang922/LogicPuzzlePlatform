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
  /** [clue position, value] the other crop read there. */
  alternates: [number, number][];
}

/** auto: settled by the automatic repair; edited: by a person (wins). */
export type LineStatus = "ok" | "flagged" | "conflict" | "missing" | "auto" | "edited";

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

/** Board lines from the placed strips' readings, automatic fixes and manual edits on top. */
export function combineLines(
  strips: StripInput[],
  placements: Map<string, Placement>,
  length: number,
  edits: Map<number, number[]>,
  autos: Map<number, number[]> = new Map(),
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
        readings.push({ stripId: s.id, clues: ln.clues, flags: ln.flags, boxes: ln.boxes, alternates: ln.alternates ?? [] });
        flags.push(...ln.flags);
      }
    }
    const edit = edits.get(idx);
    if (edit) {
      lines.push({ index: idx, clues: edit, status: "edited", readings, flags });
      continue;
    }
    const auto = autos.get(idx);
    if (auto) {
      lines.push({ index: idx, clues: auto, status: "auto", readings, flags });
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
  /** Row-major cells: 1 filled, 0 empty, -1 unsettled. */
  grid: Int8Array;
}

/** Line-solve every row and column to a fixpoint, optionally skipping lines. */
export function propagate(rowClues: number[][], colClues: number[][], skip?: LineId | Set<LineId>): Propagation {
  const skipped = (id: LineId) => (skip instanceof Set ? skip.has(id) : id === skip);
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
    if (skipped(id)) continue;
    const isRow = id[0] === "r";
    const k = Number(id.slice(1));
    const n = isRow ? C : R;
    const cells = new Array<number>(n);
    for (let t = 0; t < n; t++) cells[t] = isRow ? g[k * C + t] : g[t * C + k];
    const res = nonogramSolveLine(cells, isRow ? rowClues[k] : colClues[k]);
    if (!res) return { contradiction: id, settled: 0, total: R * C, grid: g };
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
  return { contradiction: null, settled, total: R * C, grid: g };
}

/**
 * Lines whose removal alone clears every contradiction: almost always the
 * misread line itself. Yields between lines so the page stays responsive.
 */
export async function findSuspects(
  rowClues: number[][],
  colClues: number[][],
  onProgress?: (done: number, total: number) => void,
  only?: LineId[],
): Promise<LineId[]> {
  const ids: LineId[] = only ?? [
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

// --- automatic repair --------------------------------------------------------
//
// A published nonogram has one picture, and its clues say everything twice
// (every cell is in a row and a column). So a clue set line logic solves to
// the last cell, with no contradiction, is right; a misread almost never does
// that. The repair looks for the misread lines, tries the readings a scanner
// gets wrong, and keeps a change only when it is the one change that makes
// the board solve. Anything less certain goes to a person, with the options.

/** One board line as the repair sees it. */
export interface RepairLine {
  /** The agreed reading, or null when strips disagree (see readings). */
  clues: number[] | null;
  /** Each strip's distinct reading of the line. */
  readings: number[][];
  /** [clue position, value] a crop also read. */
  alternates: [number, number][];
  /** The reader flagged the line (or the strips disagreed). */
  doubtful: boolean;
  /** A person set it: the repair never changes it. */
  locked: boolean;
}

export interface Fix {
  id: LineId;
  from: number[] | null;
  to: number[];
  why: string;
}

export type RepairResult =
  | { kind: "solved"; fixes: Fix[]; grid: Int8Array }
  | { kind: "consistent"; fixes: Fix[]; settled: number; total: number; grid: Int8Array }
  // stuck: `fixes` are changes found so far, unconfirmed until the board solves.
  | { kind: "stuck"; fixes: Fix[]; reason: string; suspects: LineId[]; options: Fix[]; grid: Int8Array | null };

// Digits a scan or OCR mixes up.
const CONFUSED: Record<string, string> = {
  "0": "689", "1": "47", "2": "7", "3": "589", "4": "19",
  "5": "368", "6": "058", "7": "12", "8": "03569", "9": "0348",
};

const key = (c: number[]) => c.join(",");
const sum = (c: number[]) => c.reduce((a, b) => a + b, 0);

/** Single-number misreadings of v: a digit mixed up, dropped, or a 1 gained. */
function confusions(v: number): number[] {
  const s = String(v);
  const out = new Set<number>();
  for (let i = 0; i < s.length; i++) {
    for (const d of CONFUSED[s[i]] ?? "") out.add(Number(s.slice(0, i) + d + s.slice(i + 1)));
    if (s.length > 1) out.add(Number(s.slice(0, i) + s.slice(i + 1)));
  }
  out.add(Number("1" + s));
  out.add(Number(s + "1"));
  out.delete(v);
  return [...out].filter((x) => x > 0 && !String(x).startsWith("0"));
}

/**
 * Other clue lists the line may really have. With `delta` (the change the
 * totals call for), any one number may be off by delta, or a number delta
 * missed or read extra, a two-digit number split or two merged. Without it
 * (when two lines are wrong at once), the usual misreadings.
 */
export function candidates(line: RepairLine, base: number[], delta: number | null, maxLen: number): number[][] {
  const out = new Map<string, number[]>();
  const add = (c: number[]) => {
    if (c.some((x) => !Number.isInteger(x) || x < 1) || minLength(c) > maxLen || key(c) === key(base)) return;
    if (delta !== null && sum(c) - sum(base) !== delta) return;
    out.set(key(c), c);
  };
  const replaced = (i: number, vs: number[]) => [...base.slice(0, i), ...vs, ...base.slice(i + 1)];
  for (const r of line.readings) add(r);
  for (const [i, v] of line.alternates) if (i < base.length) add(replaced(i, [v]));
  // A blurred line can have several cells the other crop read right.
  if (line.alternates.length > 1) {
    const all = [...base];
    for (const [i, v] of line.alternates) if (i < all.length) all[i] = v;
    add(all);
  }
  base.forEach((v, i) => {
    if (delta !== null) add(replaced(i, [v + delta]));
    else for (const w of confusions(v)) add(replaced(i, [w]));
    const s = String(v);
    for (let k = 1; k < s.length; k++) add(replaced(i, [Number(s.slice(0, k)), Number(s.slice(k))]));
    add(replaced(i, []));
    if (i + 1 < base.length) {
      add([...base.slice(0, i), Number(`${v}${base[i + 1]}`), ...base.slice(i + 2)]);
      add([...base.slice(0, i), base[i + 1], v, ...base.slice(i + 2)]);
    }
  });
  if (delta !== null && delta > 0) for (let i = 0; i <= base.length; i++) add([...base.slice(0, i), delta, ...base.slice(i)]);
  return [...out.values()];
}

/** One line's cells of a row-major grid. */
function lineCells(grid: Int8Array, id: LineId, R: number, C: number): number[] {
  const k = Number(id.slice(1));
  return id[0] === "r"
    ? Array.from(grid.subarray(k * C, (k + 1) * C))
    : Array.from({ length: R }, (_, t) => grid[t * C + k]);
}

/** The clues a fully settled line of the grid shows, or null if any cell is open. */
function lineRuns(grid: Int8Array, id: LineId, R: number, C: number): number[] | null {
  const k = Number(id.slice(1));
  const isRow = id[0] === "r";
  const n = isRow ? C : R;
  const runs: number[] = [];
  let len = 0;
  for (let t = 0; t < n; t++) {
    const v = isRow ? grid[k * C + t] : grid[t * C + k];
    if (v === -1) return null;
    if (v === 1) len++;
    else if (len) {
      runs.push(len);
      len = 0;
    }
  }
  if (len) runs.push(len);
  return runs;
}

const lineIds = (n: number, p: "r" | "c") => Array.from({ length: n }, (_, i) => `${p}${i}` as LineId);
const pause = () => new Promise((r) => setTimeout(r, 0));

/**
 * Repair the clue set: settle lines the strips disagree on, then find and fix
 * misread lines. Every change it keeps is the only one of its kind that makes
 * line logic solve the whole board. `budgetMs` bounds the two-line search.
 */
export async function autoRepair(
  rows: RepairLine[],
  cols: RepairLine[],
  onProgress?: (what: string) => void,
  budgetMs = 60_000,
): Promise<RepairResult> {
  const R = rows.length, C = cols.length;
  const get = (id: LineId) => (id[0] === "r" ? rows : cols)[Number(id.slice(1))];
  const maxLen = (id: LineId) => (id[0] === "r" ? C : R);
  const ids = [...lineIds(R, "r"), ...lineIds(C, "c")];
  const missing = ids.filter((id) => get(id).clues === null && !get(id).readings.length);
  if (missing.length)
    return { kind: "stuck", fixes: [], reason: `${missing.length} line(s) no strip covers: type their clues`, suspects: missing, options: [], grid: null };

  // Current clue set; lines the strips disagree on start from their first reading.
  const cur = new Map<LineId, number[]>();
  const fixes: Fix[] = [];
  for (const id of ids) {
    const l = get(id);
    cur.set(id, l.clues ?? l.readings[0]);
  }
  const conflicts = ids.filter((id) => get(id).clues === null);
  const clueSets = (over: Map<LineId, number[]> = new Map()) => {
    const pick = (id: LineId) => over.get(id) ?? cur.get(id)!;
    return [lineIds(R, "r").map(pick), lineIds(C, "c").map(pick)] as const;
  };
  const run = (over?: Map<LineId, number[]>, skip?: Set<LineId>) => {
    const [rc, cc] = clueSets(over);
    return propagate(rc, cc, skip);
  };
  const solves = (p: Propagation) => !p.contradiction && p.settled === p.total;
  let evals = 0;
  const tick = async (what: string) => {
    if (++evals % 4 === 0) {
      onProgress?.(what);
      await pause();
    }
  };

  // 1. Lines the strips disagree on: the reading that lets the board solve.
  if (conflicts.length) {
    onProgress?.("choosing between disagreeing strips…");
    const options = conflicts.map((id) => get(id).readings);
    const combos = options.reduce((a, o) => a * o.length, 1);
    if (combos <= 64) {
      const good: Map<LineId, number[]>[] = [];
      for (let n = 0; n < combos; n++) {
        let k = n;
        const over = new Map<LineId, number[]>();
        conflicts.forEach((id, i) => {
          over.set(id, options[i][k % options[i].length]);
          k = Math.floor(k / options[i].length);
        });
        if (solves(run(over))) good.push(over);
        await tick("choosing between disagreeing strips…");
      }
      if (good.length === 1) {
        for (const [id, c] of good[0]) {
          cur.set(id, c);
          fixes.push({ id, from: null, to: c, why: "the strips disagree; only this reading lets the board solve" });
        }
        const p = run();
        return { kind: "solved", fixes, grid: p.grid };
      }
      if (good.length > 1)
        return {
          kind: "stuck",
          fixes: [],
          reason: "more than one choice between the disagreeing strips lets the board solve: pick what the scan shows",
          suspects: conflicts,
          options: good.flatMap((g) => [...g].map(([id, c]) => ({ id, from: null, to: c, why: "" }))),
          grid: null,
        };
    }
    // Otherwise keep the first readings and let the search below sort them out.
    for (const id of conflicts) fixes.push({ id, from: null, to: cur.get(id)!, why: "the strips disagree; picked one reading" });
  }

  const base = run();
  const [rc0, cc0] = clueSets();
  const totalsGap = sum(rc0.flat()) - sum(cc0.flat());
  if (!base.contradiction && totalsGap === 0) {
    if (base.settled === base.total) return { kind: "solved", fixes, grid: base.grid };
    return { kind: "consistent", fixes, settled: base.settled, total: base.total, grid: base.grid };
  }

  const editable = ids.filter((id) => !get(id).locked);
  const finish = (chosen: Fix[], why: string): RepairResult => {
    for (const f of chosen) {
      cur.set(f.id, f.to);
      const prior = fixes.findIndex((x) => x.id === f.id);
      const entry = { ...f, from: prior >= 0 ? null : f.from, why };
      if (prior >= 0) fixes[prior] = entry;
      else fixes.push(entry);
    }
    const p = run();
    return solves(p)
      ? { kind: "solved", fixes, grid: p.grid }
      : { kind: "consistent", fixes, settled: p.settled, total: p.total, grid: p.grid };
  };

  // 2. Set the doubtful lines aside, and while the rest still contradict
  // each other, also the line whose absence lets line logic settle the most
  // (a misread the reader didn't notice). Put back every line the picture
  // agrees with, and read the others off the picture the clean lines draw.
  // Kept only if the result solves the whole board.
  let stuckHere: { open: LineId[]; grid: Int8Array; fixes: Fix[] } | null = null;
  if (base.contradiction || totalsGap !== 0) {
    const aside = new Set(editable.filter((id) => get(id).doubtful || conflicts.includes(id)));
    if (aside.size <= 0.3 * ids.length) {
      onProgress?.(`solving without the ${aside.size} doubtful lines…`);
      await pause();
      let p = run(undefined, aside);
      for (let round = 0; p.contradiction && round < 6; round++) {
        let best: { id: LineId; settled: number } | null = null;
        const rest = editable.filter((id) => !aside.has(id));
        for (let i = 0; i < rest.length; i++) {
          const q = run(undefined, new Set([...aside, rest[i]]));
          if (!q.contradiction && (!best || q.settled > best.settled)) best = { id: rest[i], settled: q.settled };
          if (i % 8 === 7) {
            onProgress?.(`looking for misread lines (${aside.size} set aside)… ${i + 1}/${rest.length}`);
            await pause();
          }
        }
        if (!best) break;
        aside.add(best.id);
        p = run(undefined, aside);
      }
      // The set-aside lines as the picture draws them: all of them, or null.
      const readOff = (grid: Int8Array, lines: Set<LineId>) => {
        const derived = new Map<LineId, number[]>();
        const open: LineId[] = [];
        for (const id of lines) {
          const runs = lineRuns(grid, id, R, C);
          if (!runs) open.push(id);
          else if (key(runs) !== key(cur.get(id)!)) derived.set(id, runs);
        }
        return { derived, open };
      };
      const accept = (derived: Map<LineId, number[]>) =>
        finish(
          [...derived].map(([id, to]) => ({ id, from: cur.get(id)!, to, why: "" })),
          "read off the picture the other lines draw; the scan's reading contradicts it",
        );
      if (!p.contradiction) {
        let r = readOff(p.grid, aside);
        if (!r.open.length && r.derived.size && solves(run(r.derived))) return accept(r.derived);
        // The clean lines leave some cells open: put back each set-aside
        // line the picture agrees with, to settle more.
        onProgress?.("putting back the lines the picture agrees with…");
        for (const id of [...aside]) {
          const without = new Set(aside);
          without.delete(id);
          const q = run(undefined, without);
          if (!q.contradiction) {
            aside.delete(id);
            p = q;
          }
          await tick("putting back the lines the picture agrees with…");
        }
        r = readOff(p.grid, aside);
        if (!r.open.length && r.derived.size && solves(run(r.derived))) return accept(r.derived);
        // Lines the picture doesn't settle yet: of their likely readings,
        // the one that fits the cells it does settle. Each one taken settles
        // more of the picture for the next.
        const adopted = new Map<LineId, number[]>();
        for (let pass = 0; pass < 4 && r.open.length; pass++) {
          let took = false;
          for (const id of r.open) {
            const cells = lineCells(p.grid, id, R, C);
            const from = cur.get(id)!;
            const fits = [from, ...candidates(get(id), from, null, maxLen(id))].filter(
              (c) => nonogramSolveLine(cells, c) !== null,
            );
            if (fits.length === 1) {
              adopted.set(id, fits[0]);
              aside.delete(id);
              took = true;
            }
            await tick("matching doubtful lines to the picture…");
          }
          if (!took) break;
          const q = run(adopted, aside);
          if (q.contradiction) break;
          p = q;
          r = readOff(p.grid, aside);
        }
        if (!r.open.length) {
          const all = new Map([...adopted, ...r.derived]);
          for (const [id, c] of all) if (key(c) === key(cur.get(id)!)) all.delete(id);
          if (all.size && solves(run(all))) {
            return finish(
              [...all].map(([id, to]) => ({ id, from: cur.get(id)!, to, why: "" })),
              "the reading that fits the picture the other lines draw",
            );
          }
        }
        if (r.open.length) {
          const found = new Map([...adopted, ...r.derived]);
          stuckHere = {
            open: r.open,
            grid: p.grid,
            fixes: [...found]
              .filter(([id, c]) => key(c) !== key(cur.get(id)!))
              .map(([id, to]) => ({
                id, from: get(id).clues === null ? null : cur.get(id)!, to,
                why: "fits the picture the other lines draw (confirmed once the board solves)",
              })),
          };
        }
      }
    }
  }

  // 3. The misread line: the one whose removal clears the contradiction.
  let suspects: LineId[];
  if (base.contradiction) {
    suspects = await findSuspects(rc0, cc0, (d, t) => onProgress?.(`looking for the misread line… ${d}/${t}`), editable);
  } else {
    suspects = editable.filter((id) => get(id).doubtful); // totals off, but nothing contradicts yet
  }

  // 4. One line wrong: try its likely readings, with the totals' change.
  const solved: Fix[] = [];
  const clean: { fix: Fix; settled: number }[] = [];
  for (const id of suspects) {
    const delta = id[0] === "r" ? -totalsGap : totalsGap;
    const from = cur.get(id)!;
    for (const c of candidates(get(id), from, delta, maxLen(id))) {
      const p = run(new Map([[id, c]]));
      const fix: Fix = { id, from, to: c, why: "" };
      if (solves(p)) solved.push(fix);
      else if (!p.contradiction) clean.push({ fix, settled: p.settled });
      await tick(`trying fixes for ${lineLabel(id)}…`);
    }
  }
  if (solved.length === 1) return finish(solved, "the only change to this line that lets the board solve");
  if (solved.length > 1)
    return { kind: "stuck", fixes: [], reason: "more than one fix lets the board solve: pick the one the scan shows", suspects, options: solved, grid: base.grid };
  if (clean.length === 1)
    return finish([clean[0].fix], "the only change to this line that clears the contradiction (line logic doesn't finish the board: check the picture)");
  if (clean.length > 1)
    return { kind: "stuck", fixes: [], reason: "several fixes clear the contradiction: pick the one the scan shows", suspects, options: clean.map((c) => c.fix), grid: base.grid };

  // 5. Two lines wrong: pairs of doubtful lines whose removal clears it.
  const doubtful = editable.filter((id) => get(id).doubtful).slice(0, 40);
  const started = Date.now();
  const pairFixes: Fix[][] = [];
  outer: for (let a = 0; a < doubtful.length; a++) {
    for (let b = a + 1; b < doubtful.length; b++) {
      if (Date.now() - started > budgetMs) break outer;
      const [x, y] = [doubtful[a], doubtful[b]];
      await tick(`looking for two misread lines… ${a + 1}/${doubtful.length}`);
      if (run(undefined, new Set([x, y])).contradiction) continue;
      const cx = candidates(get(x), cur.get(x)!, null, maxLen(x));
      const cy = candidates(get(y), cur.get(y)!, null, maxLen(y));
      const sx = sum(cur.get(x)!), sy = sum(cur.get(y)!);
      for (const p of cx) {
        for (const q of cy) {
          // The pair must close the totals' gap.
          const dr = (x[0] === "r" ? sum(p) - sx : 0) + (y[0] === "r" ? sum(q) - sy : 0);
          const dc = (x[0] === "c" ? sum(p) - sx : 0) + (y[0] === "c" ? sum(q) - sy : 0);
          if (totalsGap + dr - dc !== 0) continue;
          if (solves(run(new Map([[x, p], [y, q]]))))
            pairFixes.push([{ id: x, from: cur.get(x)!, to: p, why: "" }, { id: y, from: cur.get(y)!, to: q, why: "" }]);
          await tick(`trying fixes for ${lineLabel(x)} and ${lineLabel(y)}…`);
        }
      }
    }
  }
  if (pairFixes.length === 1) return finish(pairFixes[0], "the only change to these two lines that lets the board solve");
  if (stuckHere && !pairFixes.length)
    return {
      kind: "stuck",
      fixes: stuckHere.fixes,
      reason: `${stuckHere.open.length} line(s) contradict the rest, and the other lines don't settle them: read their clues from the scan`,
      suspects: stuckHere.open,
      options: [],
      grid: stuckHere.grid,
    };
  return {
    kind: "stuck",
    fixes: [],
    reason: pairFixes.length > 1
      ? "more than one pair of fixes lets the board solve: pick what the scan shows"
      : suspects.length
        ? `no likely misreading of ${suspects.slice(0, 4).map(lineLabel).join(", ")} lets the board solve: read the scan and type the clues`
        : "the clues contradict each other and no one or two doubtful lines explain it: check the lines marked doubtful",
    suspects,
    options: pairFixes.flat(),
    grid: base.grid,
  };
}
