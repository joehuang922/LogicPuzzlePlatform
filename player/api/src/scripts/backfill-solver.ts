/**
 * Backfill `validation_status` and `solution_repr` for existing puzzles whose type
 * has a registered solver plugin (see player/solver/src/registry.ts). See docs/auto-solve
 * (D9): the backfill only *flags* puzzles — it never hides or deletes live ones.
 * Multiple/none verdicts are listed explicitly so editors can re-review them.
 *
 * The same sweep runs after every deploy, from the SolverBackfill Lambda
 * (handlers/backfill.ts) with --commit --only-missing, so a newly registered solver's
 * existing puzzles are classified without running this by hand.
 *
 * Usage (from player/api):
 *   npx tsx src/scripts/backfill-solver.ts            # dry run: classify, write nothing
 *   npx tsx src/scripts/backfill-solver.ts --commit   # write validation_status + solution_repr
 *   npx tsx src/scripts/backfill-solver.ts --type 1   # restrict to one puzzle type
 *   npx tsx src/scripts/backfill-solver.ts --only-missing   # skip rows already classified
 *   npx tsx src/scripts/backfill-solver.ts --retry-unknown --type 5   # retry timed-out rows
 *   npx tsx src/scripts/backfill-solver.ts --retry-unknown --budget-ms 120000   # longer per puzzle
 *
 * Loads the same Aurora credentials the Lambda uses from player/api/.env.local, so
 * db.ts (which reads the ARNs at import time) must be imported *after* env is loaded.
 */
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

/**
 * Load .env.local making the file authoritative, overriding any ambient shell env.
 * `process.loadEnvFile` only sets vars that are *absent*, so a shell `AWS_REGION`
 * would otherwise shadow the file's region and point db.ts at the wrong cluster.
 * This mirrors db.sh, which `source`s the file (overriding) before each query.
 */
function loadEnvOverriding(path: string): void {
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

interface Args {
  commit: boolean;
  type: number | null;
  onlyMissing: boolean;
  retryUnknown: boolean;
  budgetMs?: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { commit: false, type: null, onlyMissing: false, retryUnknown: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--commit") args.commit = true;
    else if (a === "--only-missing") args.onlyMissing = true;
    else if (a === "--type") args.type = Number(argv[++i]);
    else if (a === "--retry-unknown") args.retryUnknown = true;
    else if (a === "--budget-ms") args.budgetMs = Number(argv[++i]);
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Env must be loaded before db.ts reads CLUSTER_ARN/SECRET_ARN at module init.
  // Run under tsx in CommonJS mode (api package has no "type":"module"), so __dirname
  // is the script's own directory regardless of the caller's cwd.
  loadEnvOverriding(resolve(__dirname, "../../.env.local"));
  const { backfillSolver, formatSummary } = await import("../lib/backfillSolver");

  console.log(
    `Mode: ${args.commit ? "COMMIT" : "DRY RUN"}${args.onlyMissing ? " (only unclassified)" : ""}` +
      `${args.retryUnknown ? " (retrying timed-out)" : ""}` +
      `${args.type != null ? ` | type=${args.type}` : ""}\n`
  );
  const summary = await backfillSolver({ ...args, log: (line) => console.log(line) });
  for (const line of formatSummary(summary, args.commit)) console.log(line);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
