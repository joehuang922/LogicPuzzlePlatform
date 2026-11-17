import { classifyAndSolve, SearchBudget, Verdict } from "./drivers";
import { getPlugin } from "./registry";

export interface GateResult {
  verdict: Verdict; // 'unique' | 'multiple' | 'none' | 'unknown'
  /** Canonical solution repr, present only when verdict === 'unique'. */
  solution: unknown | null;
}

/**
 * Default wall-clock ceiling for a single gate call, in milliseconds. The gate runs
 * synchronously inside the create/update Lambda (29s API-Gateway timeout) and in the
 * backfill, so proving uniqueness must never run unbounded: a malformed puzzle can blow
 * the search up without limit. 15s leaves ample headroom under the Lambda timeout for the
 * DB write that follows. Most real puzzles classify in well under a second; the largest
 * (a 50x64 Slitherlink, ~1.4s of probing on a laptop) runs several times slower on the
 * 1-vCPU Lambda, so 10s was too tight for it. On timeout the verdict is `"unknown"` — the
 * puzzle is flagged for human review, never silently accepted. Override via `gate`'s arg.
 */
export const DEFAULT_GATE_BUDGET_MS = 15_000;

/**
 * Registration gate for a puzzle. Returns null when no solver plugin is registered
 * for `puzzleType` (D8: unsupported types bypass the gate). Otherwise classifies the
 * puzzle and, when uniquely solvable, returns its solution in the type's canonical
 * repr shape (ready to persist in `solution_repr`).
 *
 * The classification runs under a wall-clock {@link SearchBudget} (default
 * {@link DEFAULT_GATE_BUDGET_MS}) so a pathological board yields `"unknown"` instead of
 * hanging the caller. Pass `budget` to override (e.g. a longer offline backfill budget,
 * or an explicit `maxNodes` for a deterministic bound in tests).
 *
 * `canon` must already be schema-valid (callers run validateCanon first).
 */
export function gate(puzzleType: number, canon: unknown, budget?: SearchBudget): GateResult | null {
  const plugin = getPlugin(puzzleType);
  if (!plugin) return null;

  const effective: SearchBudget = budget ?? { deadline: Date.now() + DEFAULT_GATE_BUDGET_MS };
  // One search both proves uniqueness and yields the grid, so the model (and any
  // construction-time deduction) is built once.
  const { verdict, solution: grid } = classifyAndSolve(plugin.buildModel(canon), effective);
  if (verdict !== "unique") return { verdict, solution: null };
  const solution = grid && plugin.serializeSolution ? plugin.serializeSolution(grid) : grid;
  return { verdict, solution };
}
