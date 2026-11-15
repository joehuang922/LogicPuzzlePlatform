import { Context } from "aws-lambda";
import { backfillSolver, formatSummary, BackfillSummary } from "../lib/backfillSolver";

// Leave this much of the Lambda's time unused: no new puzzle starts after it, so the one
// in flight (up to the 30s gate budget plus its DB write) finishes before the timeout.
const SAFETY_MARGIN_MS = 60_000;

/**
 * Post-deploy solver backfill, invoked by .github/workflows/deploy.yml after the API stack
 * deploys (not behind API Gateway). Classifies every puzzle of a solver-backed type that
 * has no verdict yet and stores its verdict and solution — so registering a new solver
 * (e.g. Masyu) also covers the puzzles already in the library. Idempotent: rows with a
 * verdict are skipped, so a run that stops early is finished by the next one.
 */
export async function handler(_event: unknown, context: Context): Promise<BackfillSummary & { report: string[] }> {
  const summary = await backfillSolver({
    commit: true,
    type: null,
    onlyMissing: true,
    stopBy: Date.now() + context.getRemainingTimeInMillis() - SAFETY_MARGIN_MS,
    log: (line) => console.log(line),
  });
  const report = formatSummary(summary, true);
  for (const line of report) console.log(line);
  return { ...summary, report };
}
