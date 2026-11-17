import { Context } from "aws-lambda";
import { backfillSolver, formatSummary, BackfillCursor, BackfillSummary } from "../lib/backfillSolver";

// Leave this much of the Lambda's time unused: no new puzzle starts after it, so the one
// in flight (up to its gate budget plus its DB write) finishes before the timeout.
const SAFETY_MARGIN_MS = 60_000;
// Ceiling on a caller's per-puzzle budget, so one board can't eat the whole invocation.
const MAX_BUDGET_MS = 300_000;

/** Optional payload; the post-deploy call sends `{}`. */
interface BackfillEvent {
  /** Also retry puzzles whose verdict is "unknown" (timed out). */
  retryUnknown?: boolean;
  /** Restrict to one puzzle type. */
  type?: number | null;
  /** Per-puzzle search budget in ms (default 30s, at most 5 minutes). */
  budgetMs?: number;
  /** Resume a sweep after a previous invocation's `cursor`. */
  after?: BackfillCursor | null;
}

/**
 * Solver backfill, not behind API Gateway. With `{}` (the post-deploy call in
 * .github/workflows/deploy.yml) it classifies every puzzle of a solver-backed type that
 * has no verdict yet, so registering a new solver also covers the puzzles already in the
 * library. With `retryUnknown` (.github/workflows/solver-rerun.yml) it also retries the
 * ones that timed out, e.g. after a solver got stronger. Idempotent; a run that stops
 * early returns a `cursor` to resume from.
 */
export async function handler(event: BackfillEvent | null, context: Context): Promise<BackfillSummary & { report: string[] }> {
  const e = event ?? {};
  const budgetMs = e.budgetMs != null ? Math.min(Math.max(Number(e.budgetMs), 1_000), MAX_BUDGET_MS) : undefined;
  const summary = await backfillSolver({
    commit: true,
    type: e.type != null ? Number(e.type) : null,
    onlyMissing: true,
    retryUnknown: !!e.retryUnknown,
    budgetMs,
    after: e.after ?? null,
    stopBy: Date.now() + context.getRemainingTimeInMillis() - SAFETY_MARGIN_MS - (budgetMs ?? 0),
    log: (line) => console.log(line),
  });
  const report = formatSummary(summary, true);
  for (const line of report) console.log(line);
  return { ...summary, report };
}
