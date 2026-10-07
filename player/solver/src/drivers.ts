import { ConstraintModel } from "./types";

/**
 * Count solutions up to `cap`, stopping early. Returns 0 (unsatisfiable), 1 (unique),
 * or `cap` meaning "at least `cap`". The gate calls this with cap=2: a return of 2
 * means "ambiguous / multiple solutions".
 *
 * Depth-first backtracking over the model's own propagation. Because each `assign`
 * propagates and each model reports `isDead`/`isSolved`, this driver is fully generic —
 * it knows nothing about the puzzle type.
 */
export function countSolutions<S>(model: ConstraintModel<S>, cap = 2): number {
  if (model.isDead()) return 0;
  if (model.isSolved()) return 1;

  const branch = model.selectBranch();
  // A live, unsolved model must always yield a branch.
  if (!branch) return model.isSolved() ? 1 : 0;

  let found = 0;
  for (const value of branch.candidates) {
    const next = model.assign(branch.id, value);
    if (next.isDead()) continue;
    found += countSolutions(next, cap - found);
    if (found >= cap) return cap;
  }
  return found;
}

/**
 * Return one full solution in the model's own solution shape, or null if none exists.
 * Assumes the caller wants any solution (at registration the model is already known
 * unique via countSolutions). Generic over the solution shape — the driver only forwards
 * it, never inspects it.
 */
export function solve<S>(model: ConstraintModel<S>): S | null {
  if (model.isDead()) return null;
  if (model.isSolved()) return model.solution();

  const branch = model.selectBranch();
  if (!branch) return null;

  for (const value of branch.candidates) {
    const next = model.assign(branch.id, value);
    if (next.isDead()) continue;
    const result = solve(next);
    if (result !== null) return result;
  }
  return null;
}

export type Verdict = "unique" | "multiple" | "none";

/** Classify a model for the registration gate. */
export function classify<S>(model: ConstraintModel<S>): Verdict {
  const n = countSolutions(model, 2);
  return n === 0 ? "none" : n === 1 ? "unique" : "multiple";
}
