/**
 * Self-check for a nonogram read by the parser: the big-nonogram strip repair
 * (autoRepair in nonogramStrips.ts) run on a whole parsed board. Line logic
 * finds contradicting clues; a change is kept only when it is the one likely
 * misreading (a digit mixed up, dropped, split or merged) that lets the board
 * solve. Anything less certain is left to the person, with the suspect lines
 * and the candidate fixes.
 *
 * The parse reads each clue once, so unlike strips there are no second
 * readings or alternates: candidates come from the misreading table and the
 * row/column totals alone.
 */
import { NonogramCanon } from "../types/canon";
import type { Fix, LineId, RepairLine, RepairOptions, RepairResult } from "./nonogramStrips";

/** How a parsed board is repaired: it was read once (see RepairOptions.singleReading). */
export const PARSED_REPAIR_OPTIONS: RepairOptions = { singleReading: true };

/** The outcome shown beside the parsed board. */
export type NonogramCheck =
  | { kind: "running"; progress: string }
  /** Line logic solves the board as read. */
  | { kind: "clean" }
  /** No contradiction, but line logic alone doesn't finish the board. */
  | { kind: "unfinished" }
  /** Fixes applied. `complete`: the fixed board solves by line logic. */
  | { kind: "fixed"; fixes: Fix[]; complete: boolean }
  /** The clues contradict and no single fix is certain. */
  | { kind: "stuck"; reason: string; suspects: LineId[]; options: Fix[] }
  | { kind: "error"; message: string };

/** The parsed board as the repair takes it: every line read once, none locked. */
export function toRepairLines(canon: NonogramCanon): { rows: RepairLine[]; cols: RepairLine[] } {
  const line = (raw: number[]): RepairLine => {
    // The canon writes an empty line as [] or [0]; the repair wants [].
    const clues = raw.filter((n) => n > 0);
    return { clues, readings: [clues], alternates: [], doubtful: false, locked: false };
  };
  return { rows: canon.rowClues.map(line), cols: canon.colClues.map(line) };
}

/** The canon with line `id` set to `clues` (an empty line written as [0], like the parser). */
export function setLine(canon: NonogramCanon, id: LineId, clues: number[]): NonogramCanon {
  const k = Number(id.slice(1));
  const value = clues.length ? clues : [0];
  return id[0] === "r"
    ? { ...canon, rowClues: canon.rowClues.map((c, i) => (i === k ? value : c)) }
    : { ...canon, colClues: canon.colClues.map((c, i) => (i === k ? value : c)) };
}

/**
 * What to show for a repair result, and the canon to use: fixes are applied
 * only when the repair settled on them ("solved" or "consistent"); a stuck
 * repair changes nothing and offers its options instead.
 */
export function applyRepair(canon: NonogramCanon, result: RepairResult): { canon: NonogramCanon; check: NonogramCheck } {
  if (result.kind === "stuck") {
    return { canon, check: { kind: "stuck", reason: result.reason, suspects: result.suspects, options: result.options } };
  }
  if (result.fixes.length === 0) {
    return { canon, check: { kind: result.kind === "solved" ? "clean" : "unfinished" } };
  }
  let next = canon;
  for (const f of result.fixes) next = setLine(next, f.id, f.to);
  return { canon: next, check: { kind: "fixed", fixes: result.fixes, complete: result.kind === "solved" } };
}

/** Clues as written in a fix: "3 1 12", or "0" for an empty line. */
export const clueText = (c: number[] | null) => (c && c.length ? c.join(" ") : "0");

/**
 * Run the check off the page's thread (big boards take seconds). Resolves with
 * the canon to use and what to show; `onProgress` gets the running status.
 */
export function checkParsedNonogram(
  canon: NonogramCanon,
  onProgress?: (what: string) => void,
): Promise<{ canon: NonogramCanon; check: NonogramCheck }> {
  return new Promise((resolve) => {
    const w = new Worker(new URL("../workers/nonogramRepair.worker.ts", import.meta.url), { type: "module" });
    const done = (value: { canon: NonogramCanon; check: NonogramCheck }) => {
      w.terminate();
      resolve(value);
    };
    w.onmessage = (e: MessageEvent<{ progress?: string; result?: RepairResult; error?: string }>) => {
      if (e.data.progress) onProgress?.(e.data.progress);
      else if (e.data.result) done(applyRepair(canon, e.data.result));
      else done({ canon, check: { kind: "error", message: e.data.error ?? "the check failed" } });
    };
    w.onerror = (e) => done({ canon, check: { kind: "error", message: e.message || "the check failed" } });
    w.postMessage({ ...toRepairLines(canon), options: PARSED_REPAIR_OPTIONS });
  });
}

/** The parsed canon as a NonogramCanon, or null when it isn't one. */
export function asNonogramCanon(canon: unknown): NonogramCanon | null {
  const c = canon as Partial<NonogramCanon> | null;
  const ok = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every((l) => Array.isArray(l) && l.every((n) => Number.isInteger(n)));
  return c && ok(c.rowClues) && ok(c.colClues) ? (c as NonogramCanon) : null;
}
