import { classify, solve, Verdict } from "./drivers";
import { getPlugin } from "./registry";

export interface GateResult {
  verdict: Verdict; // 'unique' | 'multiple' | 'none'
  /** Canonical solution repr, present only when verdict === 'unique'. */
  solution: unknown | null;
}

/**
 * Registration gate for a puzzle. Returns null when no solver plugin is registered
 * for `puzzleType` (D8: unsupported types bypass the gate). Otherwise classifies the
 * puzzle and, when uniquely solvable, returns its solution in the type's canonical
 * repr shape (ready to persist in `solution_repr`).
 *
 * `canon` must already be schema-valid (callers run validateCanon first).
 */
export function gate(puzzleType: number, canon: unknown): GateResult | null {
  const plugin = getPlugin(puzzleType);
  if (!plugin) return null;

  const verdict = classify(plugin.buildModel(canon));
  if (verdict !== "unique") return { verdict, solution: null };

  // Re-solve the unique puzzle to extract its full grid (fast; both passes are cheap).
  const grid = solve(plugin.buildModel(canon));
  const solution = grid && plugin.serializeSolution ? plugin.serializeSolution(grid) : grid;
  return { verdict, solution };
}
