// Core solver interfaces. See docs/auto-solve/auto-solve.md §4.1.
//
// The pilot (Sudoku) is grid-shaped, so `solution()` returns a number grid. When the
// second puzzle type lands (Phase 7), this is the interface expected to churn — a
// non-grid type (e.g. Slitherlink edges) will need a more abstract solution shape.

/** A branch point for the backtracking search: an unassigned variable and its legal values. */
export interface Branch {
  /** Opaque variable id (Sudoku: row * 9 + col). */
  id: number;
  /** Legal values still available for this variable. Never empty for a live model. */
  candidates: number[];
}

/**
 * A constraint model the generic drivers can search. Models are immutable: `assign`
 * returns a new model with the assignment propagated. A model is either live, solved,
 * or dead (a constraint was violated / a domain was wiped out).
 */
export interface ConstraintModel {
  /** True when propagation has emptied some variable's domain — unsatisfiable. */
  isDead(): boolean;
  /** True when every variable is assigned and all constraints hold. */
  isSolved(): boolean;
  /**
   * The variable to branch on (min-remaining-values heuristic), or `null` when the
   * model is solved. Only called on a live, unsolved model.
   */
  selectBranch(): Branch | null;
  /** Assign `value` to variable `id` and propagate. Returns a new (possibly dead) model. */
  assign(id: number, value: number): ConstraintModel;
  /** The fully-assigned grid. Only meaningful when `isSolved()`. */
  solution(): number[][];
}

/**
 * The per-type asset. `buildModel` is required (feeds the gate); `techniques` is the
 * hint ladder, grown over time (Phase 3+). An empty ladder is valid — gate-only.
 */
export interface SolverPlugin<Canon = unknown> {
  puzzleType: number;
  buildModel(canon: Canon): ConstraintModel;
  /**
   * Convert a solved grid into the type's canonical `solution_repr` shape for storage.
   * Defaults to the raw grid when omitted. Sudoku wraps it as `{ hints: grid }` to
   * mirror its answer shape.
   */
  serializeSolution?(grid: number[][]): unknown;
  // techniques: Technique[];  // added in Phase 3
}
