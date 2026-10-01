/**
 * Backfill `validation_status` and `solution_repr` for existing puzzles whose type
 * has a registered solver plugin (currently Sudoku, type 1). See docs/auto-solve
 * (D9): the backfill only *flags* puzzles — it never hides or deletes live ones.
 * Multiple/none verdicts are listed explicitly so editors can re-review them.
 *
 * Usage (from player/api):
 *   npx tsx src/scripts/backfill-solver.ts            # dry run: classify, write nothing
 *   npx tsx src/scripts/backfill-solver.ts --commit   # write validation_status + solution_repr
 *   npx tsx src/scripts/backfill-solver.ts --type 1   # restrict to one puzzle type
 *   npx tsx src/scripts/backfill-solver.ts --only-missing   # skip rows already classified
 *
 * Loads the same Aurora credentials the Lambda uses from player/api/.env.local, so
 * db.ts (which reads the ARNs at import time) must be imported *after* env is loaded.
 */
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

type Verdict = "unique" | "multiple" | "none";

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
}

function parseArgs(argv: string[]): Args {
  const args: Args = { commit: false, type: null, onlyMissing: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--commit") args.commit = true;
    else if (a === "--only-missing") args.onlyMissing = true;
    else if (a === "--type") args.type = Number(argv[++i]);
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
  const { executeStatement } = await import("../lib/db");
  const { gate, getPlugin } = await import("@puzzle/solver");

  // Which registered types to process. Default: every type with a plugin that we
  // find in the library; `--type` narrows to one.
  const typeFilter = args.type != null ? [args.type] : null;

  // Pull candidate rows. We classify in-process, so we only need id/type/canon.
  const conditions = ["deleted_at IS NULL"];
  const params: { name: string; value: { longValue: number } }[] = [];
  if (typeFilter) {
    conditions.push("puzzle_type = :pt");
    params.push({ name: "pt", value: { longValue: typeFilter[0] } });
  }
  if (args.onlyMissing) conditions.push("validation_status IS NULL");

  const rows = await executeStatement(
    `SELECT id, puzzle_type, canon_repr FROM puzzle_questions
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at ASC`,
    params
  );

  console.log(
    `Mode: ${args.commit ? "COMMIT" : "DRY RUN"}${args.onlyMissing ? " (only unclassified)" : ""}` +
      `${typeFilter ? ` | type=${typeFilter[0]}` : ""}`
  );
  console.log(`Fetched ${rows.records.length} candidate puzzle(s).\n`);

  const counts: Record<Verdict, number> = { unique: 0, multiple: 0, none: 0 };
  const flagged: { id: string; type: number; verdict: Verdict }[] = [];
  let skippedNoPlugin = 0;
  let written = 0;

  for (const row of rows.records) {
    const id = row.id as string;
    const puzzleType = Number(row.puzzle_type);
    if (!getPlugin(puzzleType)) {
      skippedNoPlugin++;
      continue; // D8: types without a solver bypass the gate.
    }

    let canon: unknown;
    try {
      const raw = row.canon_repr;
      canon = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      console.error(`  ! ${id}: canon_repr is not valid JSON — skipping`);
      continue;
    }

    const result = gate(puzzleType, canon);
    if (!result) {
      skippedNoPlugin++;
      continue;
    }

    const verdict = result.verdict;
    counts[verdict]++;
    if (verdict !== "unique") flagged.push({ id, type: puzzleType, verdict });

    if (args.commit) {
      const solution = verdict === "unique" ? JSON.stringify(result.solution) : null;
      await executeStatement(
        `UPDATE puzzle_questions
         SET validation_status = :status, solution_repr = :solution
         WHERE id = :id`,
        [
          { name: "id", value: { stringValue: id } },
          { name: "status", value: { stringValue: verdict } },
          {
            name: "solution",
            value: solution != null ? { stringValue: solution } : { isNull: true },
          },
        ]
      );
      written++;
    }
  }

  console.log("Verdict histogram:");
  console.log(`  unique:   ${counts.unique}`);
  console.log(`  multiple: ${counts.multiple}`);
  console.log(`  none:     ${counts.none}`);
  if (skippedNoPlugin > 0) {
    console.log(`  (skipped ${skippedNoPlugin} with no registered solver)`);
  }

  if (flagged.length > 0) {
    console.log(`\nFlagged for editorial review (${flagged.length}):`);
    for (const f of flagged) {
      console.log(`  ${f.verdict.padEnd(8)} type=${f.type}  ${f.id}`);
    }
  } else {
    console.log("\nNo puzzles flagged — all registered puzzles have a unique solution.");
  }

  if (args.commit) {
    console.log(`\nWrote ${written} row(s).`);
  } else {
    console.log("\nDry run — no rows written. Re-run with --commit to persist.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
