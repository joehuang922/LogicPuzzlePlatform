import { ConstraintModel } from "./types";

/**
 * A ceiling on how much the backtracking search may do before it gives up. Needed because
 * proving uniqueness is NP-hard in general, so a malformed puzzle (e.g. a mis-parsed clue
 * grid) can blow the search up without bound. The cap fails only in the safe direction: an
 * aborted search is reported as `"unknown"` (not proven), never as a wrong `unique`.
 *
 * `deadline` is an absolute wall-clock instant (`Date.now()` basis); it is the primary
 * guard because wall-clock is independent of board size, so it protects the Lambda no
 * matter how large the grid. `maxNodes` caps branch expansions for a size-independent,
 * deterministic bound (handy in tests). Either, both, or neither may be set.
 */
export interface SearchBudget {
  /** Abort once `Date.now()` reaches this instant. */
  deadline?: number;
  /** Abort after this many branch expansions (search-tree nodes). */
  maxNodes?: number;
}

/** Thrown by the drivers when a {@link SearchBudget} is exhausted mid-search. */
export class SearchBudgetExceeded extends Error {
  constructor(public readonly nodes: number) {
    super(`search budget exceeded after ${nodes} nodes`);
    this.name = "SearchBudgetExceeded";
  }
}

const NOOP = () => {};

/**
 * Build a per-search "tick" closure called once at every node. Returns a no-op when no
 * budget (or an empty one) is given, so unbudgeted searches pay nothing. The deadline is
 * polled on the first node and every 2048 nodes thereafter — a `Date.now()` per node would
 * dominate the hot loop, 2048 nodes is well under a millisecond of slack against a
 * multi-second deadline, and the first-node check fast-fails an already-expired deadline.
 * (`n & 2047 === 1` is true at n = 1, 2049, 4097, …)
 */
function makeTicker(budget?: SearchBudget): () => void {
  if (!budget || (budget.deadline === undefined && budget.maxNodes === undefined)) {
    return NOOP;
  }
  const { deadline, maxNodes } = budget;
  let nodes = 0;
  return () => {
    nodes++;
    if (maxNodes !== undefined && nodes > maxNodes) throw new SearchBudgetExceeded(nodes);
    if (deadline !== undefined && (nodes & 2047) === 1 && Date.now() >= deadline) {
      throw new SearchBudgetExceeded(nodes);
    }
  };
}

/**
 * Count solutions up to `cap`, stopping early. Returns 0 (unsatisfiable), 1 (unique),
 * or `cap` meaning "at least `cap`". The gate calls this with cap=2: a return of 2
 * means "ambiguous / multiple solutions".
 *
 * Depth-first backtracking over the model's own propagation. Because each `assign`
 * propagates and each model reports `isDead`/`isSolved`, this driver is fully generic —
 * it knows nothing about the puzzle type.
 *
 * With a `budget`, the search throws {@link SearchBudgetExceeded} once it is exhausted;
 * callers that want a verdict (see {@link classify}) catch it. Omit `budget` for an
 * unbounded search (the default — unchanged for existing callers).
 */
export function countSolutions<S>(model: ConstraintModel<S>, cap = 2, budget?: SearchBudget): number {
  return countFrom(model, cap, makeTicker(budget));
}

function countFrom<S>(model: ConstraintModel<S>, cap: number, tick: () => void): number {
  tick();
  if (model.isDead()) return 0;
  if (model.isSolved()) return 1;

  const branch = model.selectBranch();
  // A live, unsolved model must always yield a branch.
  if (!branch) return model.isSolved() ? 1 : 0;

  let found = 0;
  for (const value of branch.candidates) {
    const next = model.assign(branch.id, value);
    if (next.isDead()) continue;
    found += countFrom(next, cap - found, tick);
    if (found >= cap) return cap;
  }
  return found;
}

/**
 * Return one full solution in the model's own solution shape, or null if none exists.
 * Assumes the caller wants any solution (at registration the model is already known
 * unique via countSolutions). Generic over the solution shape — the driver only forwards
 * it, never inspects it. Honors an optional `budget` the same way `countSolutions` does.
 */
export function solve<S>(model: ConstraintModel<S>, budget?: SearchBudget): S | null {
  return solveFrom(model, makeTicker(budget));
}

function solveFrom<S>(model: ConstraintModel<S>, tick: () => void): S | null {
  tick();
  if (model.isDead()) return null;
  if (model.isSolved()) return model.solution();

  const branch = model.selectBranch();
  if (!branch) return null;

  for (const value of branch.candidates) {
    const next = model.assign(branch.id, value);
    if (next.isDead()) continue;
    const result = solveFrom(next, tick);
    if (result !== null) return result;
  }
  return null;
}

/**
 * Gate verdicts. `"unknown"` means the search was cut off by its {@link SearchBudget}
 * before it could prove the puzzle unique — distinct from `"none"`/`"multiple"`, which
 * are proven. The gate stores a solution only for `"unique"`, so `"unknown"` is always
 * safe (never a wrong answer) and should be surfaced for human review.
 */
export type Verdict = "unique" | "multiple" | "none" | "unknown";

/**
 * Classify a model for the registration gate. With a `budget`, a search that exhausts it
 * yields `"unknown"` instead of hanging; without one the search runs to completion.
 */
export function classify<S>(model: ConstraintModel<S>, budget?: SearchBudget): Verdict {
  try {
    const n = countSolutions(model, 2, budget);
    return n === 0 ? "none" : n === 1 ? "unique" : "multiple";
  } catch (err) {
    if (err instanceof SearchBudgetExceeded) return "unknown";
    throw err;
  }
}
