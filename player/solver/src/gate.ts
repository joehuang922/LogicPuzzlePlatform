import { classify, solve, SearchBudget, Verdict } from "./drivers";
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
 * the search up without limit. 10s leaves ample headroom under the Lambda timeout for the
 * DB write that follows, while being far longer than any well-formed board needs (real
 * puzzles classify in well under a second). On timeout the verdict is `"unknown"` — the
 * puzzle is flagged for human review, never silently accepted. Override via `gate`'s arg.
 */
export const DEFAULT_GATE_BUDGET_MS = 10_000;

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
  const verdict = classify(plugin.buildModel(canon), effective);
  if (verdict !== "unique") return { verdict, solution: null };

  // Re-solve the unique puzzle to extract its full grid. The puzzle is already proven
  // unique within budget, so this pass is fast; it reuses the same budget as a backstop.
  const grid = solve(plugin.buildModel(canon), effective);
  const solution = grid && plugin.serializeSolution ? plugin.serializeSolution(grid) : grid;
  return { verdict, solution };
}
