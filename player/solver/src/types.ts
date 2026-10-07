// Core solver interfaces. See docs/auto-solve/auto-solve.md §4.1.
//
// The pilot (Sudoku) is grid-shaped, so a number grid is the natural solution shape and
// stays the default. But the solution type is a model/plugin type parameter (`Solution`),
// so a non-grid type can return its own shape directly — Slitherlink's two edge grids
// `{ h, v }` are the first such case. Grid-shaped types (Sudoku, Kakuro, LITS) take the
// `number[][]` default and are unaffected.

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
 *
 * `Solution` is the shape `solution()` returns; it defaults to `number[][]` for the
 * common grid case. The drivers never inspect it — they only forward it out of `solve`
 * — so a model is free to pick any shape (e.g. Slitherlink's `{ h, v }` edge grids).
 */
export interface ConstraintModel<Solution = number[][]> {
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
  assign(id: number, value: number): ConstraintModel<Solution>;
  /** The fully-assigned solution. Only meaningful when `isSolved()`. */
  solution(): Solution;
}

/** Player-entered values, keyed `"col,row"` to match the client convention. */
export type CellValues = Record<string, number>;

/**
 * A single pedagogical hint: the shallowest technique that makes progress on the
 * player's current board. Cell ids are opaque per-type integers (Sudoku: row * 9 + col;
 * decode with the plugin's helper). This shape is expected to churn at the second
 * puzzle type — a non-grid type may not have a single placement cell.
 */
export interface Step {
  /** Technique name, e.g. "naked-single". */
  technique: string;
  /** Cell(s) the player should look at. */
  focusCells: number[];
  /** Candidate eliminations this technique justifies (no placement yet). */
  eliminations?: { cell: number; digits: number[] }[];
  /** A forced placement, when the technique determines one. */
  placement?: { cell: number; value: number };
  /** Human-readable "why", referencing the focus cells. */
  explanation: string;
  /** Ladder index: 0 = easiest. Also the difficulty signal. */
  depth: number;
}

/**
 * A hint rule over a per-type candidate board. Returns the step it justifies, or null
 * when it does not apply to the current board.
 */
export interface Technique<Board = unknown> {
  name: string;
  depth: number;
  apply(board: Board): Step | null;
}

/**
 * The per-type asset. `buildModel` is required (feeds the gate). The hint pieces
 * (`buildBoard` + `techniques`) are optional and grown over time; a plugin with
 * neither is gate-only.
 *
 * `Solution` is the model's solution shape (defaults to `number[][]`); `serializeSolution`
 * receives exactly that, so each plugin types its own solution precisely instead of
 * everything funneling through `number[][]`.
 */
export interface SolverPlugin<Canon = unknown, Board = unknown, Solution = number[][]> {
  puzzleType: number;
  buildModel(canon: Canon): ConstraintModel<Solution>;
  /**
   * Convert a solved solution into the type's canonical `solution_repr` shape for
   * storage. Defaults to the raw solution when omitted. Sudoku wraps it as
   * `{ hints: grid }` to mirror its answer shape; Slitherlink wraps as `{ edges }`.
   */
  serializeSolution?(solution: Solution): unknown;
  /** Build the candidate board the technique ladder reasons over, from current play. */
  buildBoard?(canon: Canon, values: CellValues): Board;
  /** Ordered hint ladder (easiest first by `depth`). */
  techniques?: Technique<Board>[];
}
