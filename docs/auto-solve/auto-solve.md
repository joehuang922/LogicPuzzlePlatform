# Auto-Solve: Registration Gate + Pedagogical Hints

Design doc. Status: **proposed**. Pilot puzzle type: **Sudoku (type 1)**.

## 1. Motivation

Two features, one shared foundation:

1. **Registration gate** — a puzzle that does not have exactly one solution must not be
   registrable. This catches broken puzzles (no solution) and ambiguous puzzles (multiple
   solutions) at onboarding time, and as a batch backfill over the existing library.
2. **Pedagogical hint** — when a player is stuck, suggest the *shallowest* next logical step
   on their **current** board, with an explanation ("R4C7 must be 4 — only candidate left in
   its box"), not just the answer.

These are **two decoupled systems** that share one per-type asset (the constraint model).

## 2. Background: how the platform works today (relevant facts)

- **Canon is question-only.** `schemas/canon/sudoku.json` and `SudokuCanon` are
  `{ hints: number[][] }` (9×9, `0` = empty). No solution is stored anywhere.
- **"Solved" today = full + no conflicts**, *not* "correct". Web: `SudokuBoard.tsx:154`.
  Android: `SudokuEngine.isComplete`. Neither checks against an intended solution, so a
  multi-solution puzzle would accept *any* valid completion.
- **Registration is structural-only.** `createPuzzle` (`player/api/src/handlers/puzzles.ts:102`)
  calls `validateCanon` (`player/api/src/lib/schema.ts:58`) — an AJV JSON-Schema check. Nothing
  verifies solvability or uniqueness.
- **Three languages.** API + web frontend are TypeScript; Android is Kotlin
  (`SudokuEngine.kt`); parsers are Python (Lambda).
- **Established per-type registry idiom** (the framework mirrors this exactly):
  - `player/frontend/src/progress/index.ts` — `ProgressCalculator` keyed by `puzzleType`.
  - `player/frontend/src/components/PuzzleBoard.tsx` — renderer registry keyed by `puzzleType`.
  - `parsers/lambda_handler.py` — `_parsers` dict keyed by type id.
- **Solver-adjacent infra already present:** conflict detection (`conflictCells`,
  `SudokuEngine.findConflicts`), candidate/pencil marks (`SudokuAnswer.notes`), and renderer
  prop-threading for `onComplete` / `liveValidate` (`renderers/sudoku.tsx`).

## 3. Design decisions (converged)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Two decoupled systems** — generic uniqueness gate + per-type hint ladder. | The gate generalizes (one engine, per-type encodings); teachable techniques do not (per-type vocabulary). |
| D2 | Gate does **not** require logical solvability. Uniqueness via search is enough. | User is comfortable with rare "give up" hints; don't reject valid-but-hard puzzles. |
| D3 | Hint = **shallowest firing technique** on the *current* board. Deepest rung needed = free difficulty score. | A good hint points at a cell *and* explains why; depth is a natural difficulty signal. |
| D4 | **Solver framework lives in TypeScript**, as a shared workspace package. | Gate runs at puzzle-create (TS Lambda); web hints import it directly (offline in-browser). Both share the constraint model + propagation. |
| D5 | Gate uses **count-to-2 backtracking** for the pilot. No SAT library yet (YAGNI). | Sudoku's space is trivial. Defer OR-tools/SAT until a hard type proves backtracking too slow. The *interface* is what must be right now. |
| D6 | **Hints run client-side** (web: TS import; Android: hand-written Kotlin port). | Offline + instant; matches Android's local-first model. Cost: propagation+ladder ported to Kotlin (not the gate, not the backtracker). |
| D7 | **Store the computed solution** in a new nullable `solution_repr JSON` column. | It's a free byproduct of the gate. Enables offline reveals + correctness checking on clients *without* porting a backtracker to Kotlin. Accept client-side extractability (casual platform). |
| D8 | **Feature-flag by registry.** A type with a registered solver plugin is gated; others bypass until their plugin lands. | Lets us ship Sudoku without touching the other 24 types. |
| D9 | **Backfill** writes `validation_status` + `solution_repr`; admin surfaces flagged puzzles for editorial review. Backfill *flags*, never blocks (can't un-ship live puzzles). | Existing library predates the gate. Distinguish `multiple` vs `none` — different editorial fixes. |

### Consequence worth banking (D2 + gate)

For a puzzle the gate certified **unique**, "full + no conflicts" *is* the one solution by
definition — so the existing completion check becomes **correct with zero client changes**.
The stored solution (D7) is therefore not needed for completion; its narrow jobs are
(a) offline reveal fallback and (b) early "you've made a mistake" detection.

## 4. Architecture

```
                         ┌───────────────────────────────────────────┐
                         │  @puzzle/solver  (new TS workspace package) │
                         │                                             │
                         │  SolverPlugin registry, keyed by puzzleType │
                         │   ├─ buildModel(canon) -> ConstraintModel   │  REQUIRED per type
                         │   └─ techniques: Technique[] (ordered ladder)│  GROWN over time
                         │                                             │
                         │  generic drivers:                           │
                         │   ├─ countSolutions(model, cap=2)  (gate)   │
                         │   ├─ solve(model) -> full solution          │
                         │   └─ nextHint(model, currentBoard) -> Step? │
                         └───────────────┬─────────────────┬───────────┘
                                         │ imported by      │ imported by
                          ┌──────────────▼──────┐   ┌───────▼───────────────┐
                          │ API Lambda (TS)      │   │ Web frontend (TS)     │
                          │  gate @ createPuzzle │   │  "Hint" button        │
                          │  backfill batch      │   │  offline, in-browser  │
                          └──────────────────────┘   └───────────────────────┘

                          ┌───────────────────────────────────────────────┐
                          │ Android (Kotlin) — hand-written port            │
                          │  propagation + technique ladder + nextHint()    │
                          │  reveal/correctness via shipped solution_repr   │
                          │  (NO backtracker, NO gate on device)            │
                          └───────────────────────────────────────────────┘
```

### 4.1 Core interfaces (`@puzzle/solver`)

```ts
// The per-type asset. buildModel is required; techniques grow over time.
interface SolverPlugin<Canon = unknown> {
  puzzleType: number;
  buildModel(canon: Canon): ConstraintModel;
  techniques: Technique[];            // ordered easiest -> hardest; [] is valid (gate-only)
}

// A constraint model the generic drivers understand. Kept deliberately abstract so
// non-grid types (Slitherlink edges, etc.) can implement it later.
interface ConstraintModel {
  variables(): Variable[];            // each with a finite candidate domain
  constraints(): Constraint[];        // predicates over variables
  // convenience for the pilot; generalized later:
  assign(v: VarId, value: number): ConstraintModel;
  isComplete(): boolean;
}

// A hint. Returned by the shallowest technique that fires on the current board.
interface Step {
  technique: string;                  // "naked-single", "hidden-single", ...
  focusCells: VarId[];                // which cell(s) to highlight
  eliminations?: { cell: VarId; digits: number[] }[];
  placement?: { cell: VarId; value: number };
  explanation: string;                // human-readable "why"
  depth: number;                      // ladder index -> difficulty signal
}

interface Technique {
  name: string;
  depth: number;
  apply(model: ConstraintModel, board: CurrentBoard): Step | null;
}
```

Generic drivers:

- `countSolutions(model, cap = 2)` → `0 | 1 | 2` (2 means "≥2, stopped early"). **Gate.**
- `solve(model)` → full solution (used at registration to produce `solution_repr`).
- `nextHint(model, currentBoard)` → run propagation, then walk `techniques` in `depth`
  order; return the first `Step` that fires, else `null` ("give up" / reveal fallback).

### 4.2 Sudoku plugin (pilot)

- `buildModel`: 81 variables, domain 1–9, constraints = 9 rows + 9 cols + 9 boxes all-different.
- `techniques` (initial ladder): naked single → hidden single → locked candidates
  (pointing/claiming) → naked/hidden pairs. X-Wing and beyond are follow-on rungs.
- Difficulty = max `depth` reached by `solve`-via-techniques (backtracking is the gate, not
  the difficulty measure).

## 5. Data model changes

Add two nullable columns to `puzzle_questions` (`player/api/schema.sql`):

```sql
solution_repr     JSON        NULL,   -- computed at registration; shipped to clients
validation_status VARCHAR(16) NULL    -- 'unique' | 'multiple' | 'none' | 'unsupported' | NULL(unchecked)
```

- Nullable + additive → no migration pain; legacy rows read as `NULL` (unchecked).
- `solution_repr` shape mirrors the answer shape per type (Sudoku: `{ hints: number[][] }` fully filled).
- Ships to clients in the existing puzzle payload (extend `PUZZLE_SELECT` / `mapRecord`).

## 6. Integration points (exact)

| Concern | File / anchor | Change |
|---|---|---|
| Gate at create | `player/api/src/handlers/puzzles.ts:115` (after `validateCanon`) | If a plugin is registered for `puzzleType`: `countSolutions`. `1` → compute + store `solution_repr`, `validation_status='unique'`. `0`/`2` → **reject** create (`400`). No plugin → skip (D8). |
| Gate on edit | `puzzles.ts:177` (update path, after `validateCanon`) | Same check when `canonRepr` changes; recompute `solution_repr`. |
| Solver registry | new `player/solver/` package | Mirrors `progress/index.ts` registry idiom. |
| Ship solution | `PUZZLE_SELECT` + `mapRecord` in `puzzles.ts` | Include `solution_repr`, `validation_status` in the puzzle payload. |
| Web hint UI | `player/frontend/src/renderers/sudoku.tsx` + `SudokuBoard.tsx` | "Hint" button → `nextHint(model, currentBoard)` → highlight `focusCells`, show `explanation`. Reuses existing `conflictCells` highlight machinery. |
| Android hint | `SudokuEngine.kt` (+ board UI) | Port propagation + ladder; `nextHint` on device; reveal via shipped `solution_repr`. |
| Backfill | new batch script (TS, uses `db.sh` / Data API) | Iterate registered types; write `validation_status` + `solution_repr`. |
| Editorial review | `player/frontend/src/pages/Admin.tsx` | Filter/flag list on `validation_status IN ('multiple','none')`. |

## 7. Rollout plan (phased)

1. **Scaffold `@puzzle/solver`** — interfaces, generic drivers, empty registry, tests.
2. **Sudoku plugin** — `buildModel` + `countSolutions` + `solve`. Unit tests incl. known
   multi-solution and no-solution grids.
3. **Gate wiring** — `puzzles.ts` create/update; DB columns; feature-flag by registry.
4. **Sudoku technique ladder** (v1 rungs) + `nextHint` + tests.
5. **Web hint UI** — button, highlight, explanation.
6. **Backfill batch** — dry-run report first, then write; surface flagged puzzles in Admin.
7. **Android port** — Kotlin propagation + ladder + reveal; offline hint UI.
8. **Follow-on** — deeper Sudoku rungs; second puzzle type to validate the interface;
   revisit SAT engine only if a hard type needs it (D5).

## 8. Open questions / risks

- **Non-grid `ConstraintModel`.** The abstract interface must survive first contact with a
  non-grid type (Slitherlink edges, loop constraints). Sudoku alone won't stress it — the
  *second* type is the real interface test (step 8).
- **Backtracking scale for hard types.** Fine for Sudoku; some Nikoli types have large search
  spaces. D5 defers SAT deliberately; watch gate latency at registration.
- **Solution extractability.** Shipping `solution_repr` to clients means a determined user can
  read it. Accepted for a casual platform (D7). Anti-cheat would require API-gated reveals,
  which breaks offline — explicit either/or, not chosen now.
- **`nextHint` vs. player's pencil marks.** Decide whether hints reason purely from committed
  values or also consider the player's `notes`. Pilot: reason from committed values only.
- **Difficulty backfill.** The gate can also emit a computed difficulty; whether to overwrite
  the existing hand-set `difficulty` column or store separately is a product call (deferred).
```
