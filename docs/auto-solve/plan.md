# Auto-Solve: Implementation Plan

Companion to [`auto-solve.md`](./auto-solve.md). Pilot: **Sudoku (type 1)**.
Status: **proposed** — sequenced, file-level tasks with acceptance criteria.

## Guiding principles

- **Interface before breadth.** Get `SolverPlugin` / `ConstraintModel` / `Step` right on
  Sudoku; do not generalize to other types in the pilot.
- **Gate before hints.** The gate (backend, higher correctness payoff) is the load-bearing
  half and unblocks the DB + backfill work. Hints layer on top.
- **Every phase is independently shippable and verified.** No phase leaves the tree broken.
- **Feature-flag by registry** (D8): only type 1 is affected until its plugin lands.

## Prerequisite decisions (assumptions baked into this plan)

| Topic | Decision for the pilot | Note |
|---|---|---|
| Package consumption | `@puzzle/solver` is consumed as **TS source** via npm workspace; esbuild (`api`) and Vite (`frontend`) each compile it. No pre-build/publish step. | Fallback if bundlers choke: emit `dist` + declarations (base tsconfig already has `declaration: true`) and import built output — adds a build-order dep. |
| Test runner | **Vitest** in `@puzzle/solver`. Fast, native TS/ESM, zero-config. | The `api` package's declared-but-unwired `jest` is out of scope; we don't touch it. |
| Backfill home | A script in **`player/api`** (`src/scripts/backfill-solver.ts`), run manually. | `api` already has DB access (`lib/db.ts`) and will already depend on the solver for the gate. |
| Hint input | `nextHint` reasons from **committed values only** (ignores player pencil-marks) for v1. | Changing this later alters the `nextHint` signature — decide before Phase 3 if you disagree. |
| DB migration | Apply `ALTER TABLE ADD COLUMN` directly via `db.sh` (idempotent, MySQL), and update `schema.sql` for the record. Do **not** run full `schema.sql`. | Per the `onboard-puzzle` convention. Columns are nullable → safe on live rows. |

## Dependency graph

```
Phase 0 (scaffold) ─┬─> Phase 1 (model + gate drivers) ─┬─> Phase 2 (DB + gate wiring)
                    │                                    └─> Phase 3 (ladder + nextHint) ─> Phase 4 (web hint UI)
                    │                                                                       └─> Phase 6 (Android port)
                    └────────────────────────────────────> Phase 2 ─> Phase 5 (backfill + admin)
```

Phase 2 depends on Phase 1 (needs `countSolutions`/`solve`). Phase 5 depends on Phase 2 (needs
the columns). Phase 3 depends on Phase 1 (needs the model). Phases 4 and 6 depend on Phase 3.

---

## Phase 0 — Package scaffold + test tooling

**Goal:** an empty, tested, importable `@puzzle/solver` workspace package.

Tasks:
1. Create `player/solver/` with `package.json` (`"name": "@puzzle/solver"`, `"type": "module"`),
   `tsconfig.json` extending `../tsconfig.base.json`, `src/index.ts`.
2. Add `"solver"` to `workspaces` in `player/package.json`.
3. Add Vitest as a devDependency in `player/solver`; add `"test": "vitest run"` script.
4. Define the core interfaces from `auto-solve.md` §4.1 in `src/types.ts`:
   `SolverPlugin`, `ConstraintModel`, `Step`, `Technique`, id/board helper types.
5. Registry module `src/registry.ts` mirroring `progress/index.ts`: `register(plugin)` +
   `getPlugin(puzzleType)`.
6. Generic driver stubs `src/drivers.ts`: `countSolutions`, `solve`, `nextHint` (signatures
   only, throwing "not implemented" — filled in Phases 1 & 3).
7. One trivial passing test to prove the runner works.

**Acceptance:** `npm test -w solver` passes; `npx tsc --noEmit` clean in the package;
`import { getPlugin } from "@puzzle/solver"` resolves from both `api` and `frontend` typechecks.

---

## Phase 1 — Sudoku constraint model + gate drivers

**Goal:** given a Sudoku canon, decide `unique | multiple | none` and produce the solution.

Tasks:
1. `src/plugins/sudoku/model.ts` — `buildModel(canon: SudokuCanon)`: 81 vars, domain 1–9,
   row/col/box all-different constraints; `assign`, `isComplete`.
2. `src/drivers.ts` — implement `countSolutions(model, cap = 2)` (backtracking with
   constraint propagation, stop at 2) and `solve(model)` (returns the single completion).
3. `src/plugins/sudoku/index.ts` — register the plugin (empty `techniques: []` for now).
4. Tests in `src/plugins/sudoku/model.test.ts`:
   - Known **unique** puzzle → `countSolutions === 1`, `solve` matches expected grid.
   - Known **multiple**-solution grid (e.g. minimal/under-clued) → `countSolutions === 2`.
   - Known **no**-solution grid (contradictory givens) → `countSolutions === 0`.
   - Empty grid → `2` (many solutions), fast (propagation prunes).

**Acceptance:** all three verdicts correct on fixtures; `countSolutions` on a hard 17-clue
puzzle returns in well under the 29s Lambda budget (target: milliseconds).

---

## Phase 2 — DB columns + gate wiring + ship solution

**Goal:** registration rejects non-unique puzzles; the solution is stored and shipped.

Tasks:
1. **Schema:** add to `player/api/schema.sql` `puzzle_questions`:
   `solution_repr JSON NULL`, `validation_status VARCHAR(16) NULL`.
   Apply live via `db.sh`: `ALTER TABLE puzzle_questions ADD COLUMN solution_repr JSON NULL,
   ADD COLUMN validation_status VARCHAR(16) NULL;` (verify with a `DESCRIBE`).
2. **Create gate** — `puzzles.ts` `createPuzzle`, right after `validateCanon` (line ~115):
   if `getPlugin(puzzleType)` exists → `countSolutions`. `1` → compute `solve`, set
   `validation_status='unique'`, persist `solution_repr`. `0`→reject `400 "no solution"`;
   `2`→reject `400 "multiple solutions"`. No plugin → skip (unchanged behavior).
3. **Update gate** — same logic in the update path (line ~177) when `canonRepr` changes;
   recompute/repersist. Add the two columns to the `INSERT`/`UPDATE` column lists.
4. **Ship to clients** — add `solution_repr`, `validation_status` to `PUZZLE_SELECT` and let
   `mapRecord` carry them (`solutionRepr`, `validationStatus`) into the payload.
5. Extend `CreatePuzzleRequest`/response types in `models/types.ts` as needed.
6. Handler-level test (or a documented manual `db.sh` + curl check) for the three verdicts.

**Acceptance:** creating a unique Sudoku succeeds and stores a solution; creating a
multi/no-solution Sudoku is rejected with a clear message; other puzzle types create exactly
as before; `npx tsc --noEmit` clean in `api`.

---

## Phase 3 — Sudoku technique ladder + nextHint

**Goal:** given a player's current board, return the shallowest teachable next step.

Tasks:
1. `src/plugins/sudoku/techniques.ts` — v1 ladder, ordered by `depth`:
   naked single → hidden single → locked candidates (pointing/claiming) → naked/hidden pairs.
   Each returns a `Step` (`focusCells`, `placement`/`eliminations`, `explanation`, `depth`) or `null`.
2. Attach the ladder to the Sudoku plugin's `techniques`.
3. `src/drivers.ts` — implement `nextHint(model, currentBoard)`: build candidates from
   committed values, walk `techniques` in `depth` order, return first firing `Step`, else
   `null` (caller falls back to reveal via `solution_repr`).
4. Tests: crafted boards where the shallowest available step is exactly a naked single /
   hidden single / locked candidate / pair; assert the returned technique, cell, and value.
   A board where no rung fires → `null`.

**Acceptance:** each ladder rung is provably selected on a fixture that isolates it; hints
never point at an already-filled cell; explanations reference the correct cells.

---

## Phase 4 — Web hint UI

**Goal:** a "Hint" affordance in the Sudoku player.

Tasks:
1. `renderers/sudoku.tsx` — build the model from canon + current `userValues`, expose a hint
   action; on click call `nextHint`, else fall back to a reveal from `solutionRepr`.
2. `SudokuBoard.tsx` — a Hint button; highlight `Step.focusCells` (reuse the existing
   `conflictCells` highlight machinery / color path at lines ~331, ~403); surface
   `explanation` text. Optionally auto-fill on a second tap for a placement step.
3. Handle the "give up" case: no hint + no solution → friendly "no simple next step" message.

**Acceptance:** on a stuck board the button highlights a correct next cell with a readable
reason; works entirely client-side; `npx tsc --noEmit` clean in `frontend`.

---

## Phase 5 — Backfill batch + editorial review surface

**Goal:** classify the existing library and route bad puzzles to human review.

Tasks:
1. `player/api/src/scripts/backfill-solver.ts` — page through `puzzle_questions` where a
   plugin is registered (type 1 for now); for each, `countSolutions` + `solve`; write
   `validation_status` and `solution_repr` via `db.sh`/Data API. **Dry-run mode first**
   (report counts by verdict, write nothing), then a `--commit` pass.
2. `log()` a summary: `{unique, multiple, none}` counts; explicitly list `multiple`/`none` ids.
3. **Admin surface** — `player/frontend/src/pages/Admin.tsx`: a filter/badge for
   `validationStatus IN ('multiple','none')` so editors can find and re-review them. Backfill
   **flags only**, never hides/deletes live puzzles (D9).

**Acceptance:** dry-run prints a correct verdict histogram over live Sudoku; commit populates
the columns; Admin shows the flagged set. Non-registered types are untouched.

---

## Phase 6 — Android Kotlin port (offline hints)

**Goal:** offline hint + reveal on device, matching web behavior.

Tasks:
1. Port propagation + the v1 technique ladder + `nextHint` into `SudokuEngine.kt` (or a new
   `SudokuHinter.kt` alongside it). **No backtracker, no gate on device** (D6).
2. Consume the shipped `solutionRepr` for reveal fallback + optional early
   mistake-detection; wire it through the Android puzzle payload model.
3. Hint button in the Sudoku board UI (parallels the `conflicts`/`liveValidate` rendering in
   `SudokuBoard.kt`); highlight focus cell + show explanation.
4. Kotlin unit tests mirroring the Phase 3 fixtures (extend `SudokuEngineTest.kt`).

**Acceptance:** hints work with airplane mode on; the same fixtures produce the same
technique/cell selections as the TS engine; reveal works from stored solution.

---

## Phase 7 — Follow-on (out of pilot scope, tracked)

- Deeper Sudoku rungs (X-Wing, Swordfish, coloring, XY-Wing) — each a new `Technique`.
- **Second puzzle type** — the real test of the `ConstraintModel` abstraction against a
  non-grid shape (e.g. Slitherlink edges/loop). Expect interface churn here, not in the pilot.
- Revisit a SAT/CP engine (OR-tools/python-sat) only if a hard type's backtracking gate is
  too slow (D5).
- Surface computed **difficulty** (deepest rung reached) — product decision on whether it
  overrides the hand-set `difficulty` column.

---

## Definition of done (pilot)

- Registering a Sudoku runs the uniqueness gate; non-unique puzzles are rejected with a clear
  reason; unique puzzles store their solution.
- The existing library is backfilled; ambiguous/broken Sudoku are flagged for editorial review.
- Web and Android both offer an offline pedagogical hint that points at a cell and explains
  the shallowest applicable technique, with a solution-backed reveal fallback.
- All new logic is unit-tested; `tsc --noEmit` clean across `solver`, `api`, `frontend`;
  Android tests green.
```
