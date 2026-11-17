/**
 * Backfill `validation_status` and `solution_repr` for existing puzzles whose type has a
 * registered solver plugin (see player/solver/src/registry.ts). See docs/auto-solve (D9):
 * the backfill only *flags* puzzles — it never hides or deletes live ones. Multiple/none/
 * unknown verdicts are listed explicitly so editors can re-review them.
 *
 * Shared by the CLI (scripts/backfill-solver.ts) and the post-deploy Lambda
 * (handlers/backfill.ts). Callers must load the DB env (CLUSTER_ARN, ...) before importing
 * this module, since db.ts reads it at import time.
 */
import { executeStatement } from "./db";
import { gate, registeredPuzzleTypes } from "@puzzle/solver";

export type Verdict = "unique" | "multiple" | "none" | "unknown";

// Offline budget per puzzle. Longer than the interactive gate's default (the backfill is
// not behind the 29s API timeout), but still bounded so one pathological board can't
// stall a whole-table sweep. Boards that still time out are recorded as "unknown".
export const BACKFILL_GATE_BUDGET_MS = 30_000;

export interface BackfillOptions {
  /** Write verdicts and solutions; otherwise classify only (dry run). */
  commit: boolean;
  /** Restrict to one puzzle type. */
  type: number | null;
  /** Skip rows that already have a verdict. */
  onlyMissing: boolean;
  /**
   * Also retry rows whose verdict is "unknown" (the gate timed out, or an editor saved past
   * a timeout), e.g. after a solver got stronger. Widens `onlyMissing`; on its own it
   * selects only the "unknown" rows.
   */
  retryUnknown?: boolean;
  /** Per-puzzle search budget; defaults to BACKFILL_GATE_BUDGET_MS. */
  budgetMs?: number;
  /** Resume after this row (a previous run's `cursor`), in (created_at, id) order. */
  after?: BackfillCursor | null;
  /**
   * Wall-clock time (ms since epoch) after which no new puzzle is started, so a Lambda
   * stops before its timeout. Pass the summary's `cursor` as `after` to carry on.
   */
  stopBy?: number;
  log?: (line: string) => void;
}

/** A position in the (created_at, id) order the backfill walks. */
export interface BackfillCursor {
  createdAt: string;
  id: string;
}

export interface BackfillSummary {
  candidates: number;
  processed: number;
  /** Rows left unprocessed because `stopBy` was reached. */
  remaining: number;
  /** Where to resume (`after`) when rows remain; null once the sweep is done. */
  cursor: BackfillCursor | null;
  written: number;
  counts: Record<Verdict, number>;
  flagged: { id: string; type: number; verdict: Verdict }[];
}

export async function backfillSolver(opts: BackfillOptions): Promise<BackfillSummary> {
  const log = opts.log ?? (() => {});
  const types = registeredPuzzleTypes().filter((t) => opts.type == null || t === opts.type);
  const summary: BackfillSummary = {
    candidates: 0,
    processed: 0,
    remaining: 0,
    cursor: null,
    written: 0,
    counts: { unique: 0, multiple: 0, none: 0, unknown: 0 },
    flagged: [],
  };
  if (types.length === 0) return summary;

  // Only types with a solver (D8: the rest bypass the gate). The type ids are integers
  // from the registry, so inlining them is safe.
  const conditions = ["deleted_at IS NULL", `puzzle_type IN (${types.map(Number).join(", ")})`];
  if (opts.retryUnknown) {
    conditions.push(opts.onlyMissing ? "(validation_status IS NULL OR validation_status = 'unknown')" : "validation_status = 'unknown'");
  } else if (opts.onlyMissing) {
    conditions.push("validation_status IS NULL");
  }
  const params: { name: string; value: { stringValue: string } }[] = [];
  if (opts.after) {
    // Rows a retry leaves "unknown" still match, so a resumed sweep moves past them by
    // position rather than by status.
    conditions.push("(created_at > :afterAt OR (created_at = :afterAtEq AND id > :afterId))");
    params.push({ name: "afterAt", value: { stringValue: opts.after.createdAt } });
    params.push({ name: "afterAtEq", value: { stringValue: opts.after.createdAt } });
    params.push({ name: "afterId", value: { stringValue: opts.after.id } });
  }
  const budgetMs = opts.budgetMs ?? BACKFILL_GATE_BUDGET_MS;

  // List ids first and fetch each canon on its own: the Data API caps a result set at
  // 1MB, which a whole table of large canons can exceed.
  const rows = await executeStatement(
    `SELECT id, puzzle_type, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS created_at
     FROM puzzle_questions
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at ASC, id ASC`,
    params
  );
  summary.candidates = rows.records.length;

  for (const [i, row] of rows.records.entries()) {
    if (opts.stopBy != null && Date.now() >= opts.stopBy) {
      summary.remaining = rows.records.length - i;
      const prev = rows.records[i - 1];
      summary.cursor = prev ? { createdAt: String(prev.created_at), id: String(prev.id) } : opts.after ?? null;
      log(`Stopping early: ${summary.remaining} puzzle(s) left for the next run.`);
      break;
    }
    const id = row.id as string;
    const puzzleType = Number(row.puzzle_type);

    const canonRow = await executeStatement(`SELECT canon_repr FROM puzzle_questions WHERE id = :id`, [
      { name: "id", value: { stringValue: id } },
    ]);
    let canon: unknown;
    try {
      const raw = canonRow.records[0]?.canon_repr;
      canon = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      log(`  ! ${id}: canon_repr is not valid JSON — skipping`);
      continue;
    }

    let verdict: Verdict;
    let solution: unknown = null;
    try {
      const result = gate(puzzleType, canon, { deadline: Date.now() + budgetMs });
      if (!result) continue;
      verdict = result.verdict as Verdict;
      solution = result.solution;
    } catch (err) {
      // A canon the model can't read (malformed shape): flag it rather than abort the sweep.
      log(`  ! ${id}: solver error (${(err as Error).message}) — recording 'unknown'`);
      verdict = "unknown";
    }
    summary.processed++;
    summary.counts[verdict]++;
    if (verdict !== "unique") summary.flagged.push({ id, type: puzzleType, verdict });

    if (opts.commit) {
      const stored = verdict === "unique" && solution != null ? JSON.stringify(solution) : null;
      await executeStatement(
        `UPDATE puzzle_questions
         SET validation_status = :status, solution_repr = :solution
         WHERE id = :id`,
        [
          { name: "id", value: { stringValue: id } },
          { name: "status", value: { stringValue: verdict } },
          { name: "solution", value: stored != null ? { stringValue: stored } : { isNull: true } },
        ]
      );
      summary.written++;
    }
  }
  return summary;
}

/** Human-readable report of a run, one line per entry. */
export function formatSummary(s: BackfillSummary, commit: boolean): string[] {
  const lines = [
    `Candidates: ${s.candidates}, processed: ${s.processed}${s.remaining ? `, left for the next run: ${s.remaining}` : ""}`,
    "Verdict histogram:",
    `  unique:   ${s.counts.unique}`,
    `  multiple: ${s.counts.multiple}`,
    `  none:     ${s.counts.none}`,
    `  unknown:  ${s.counts.unknown}`,
  ];
  if (s.flagged.length > 0) {
    lines.push(`Flagged for editorial review (${s.flagged.length}):`);
    for (const f of s.flagged) lines.push(`  ${f.verdict.padEnd(8)} type=${f.type}  ${f.id}`);
  } else {
    lines.push("No puzzles flagged — every processed puzzle has a unique solution.");
  }
  lines.push(commit ? `Wrote ${s.written} row(s).` : "Dry run — no rows written. Re-run with --commit to persist.");
  return lines;
}
