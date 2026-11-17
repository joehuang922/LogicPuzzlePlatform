Onboard a new puzzle type into the platform end-to-end.

## Inputs

The user should provide:
- Puzzle name
- 1-2 sample images (paths)
- A description of the rules (can be rough/informal)

If any of these are missing, ask before proceeding.

## Phase 1: Document

1. Determine the next puzzle type ID by reading `player/api/seed.sql` and finding the highest existing ID.
2. Look at the sample images to understand the visual structure.
3. Ask the user to specify any details they care about for the following (they may leave any blank and you'll infer from images/rules):
   - **Player interaction** — how the player solves (click, drag, erase mode, toggle, etc.)
   - **Player appearance** — grid styling, colors, line types (solid/dashed), layering, sizing
   - **Editor interaction** — how the editor creates/edits puzzles (click to cycle, resize controls, etc.)
   - **Editor appearance** — any differences from the player view (dots for empty cells, extra controls, etc.)
   - **Grid line style** — are the grid lines in the sample images solid or dashed/dotted? This determines whether the parser uses `detect_grid_lines` (solid) or `auto_detect_grid_lines` (dashed — auto-sweeps erode sizes for optimal detection).
   - **Picture puzzle?** — does the solution draw a picture (Nonogram, Tentaishow, Picto Link, Zebra Rope)? If so the player gets a live preview panel above the board and the Android collection shows a solved thumbnail (Phase 12).
4. Draft the full documentation file following the template in existing docs (e.g., `docs/nurimaze/nurimaze.md`). Must include all sections:
   - Puzzle Type ID
   - Question structure description + Canonical JSON structure + Sample images
   - Answer structure description + Canonical JSON structure
   - Rules + Success finishing criteria
   - Puzzle Player > Interactions + Progress calculation (ask the user what metric indicates progress — e.g., "cells touched by a trail segment", "edges drawn", "cells filled in". This will be implemented in a later phase.)
   - Puzzle Editor > Interactions
   - Puzzle Parser (notes on visual parsing challenges)
   - Misc > Coordinate convention
   - The Android port (Phase 12): its player interaction, its admin review editor (how a parsed board is corrected on the phone), and the solved thumbnail for a picture puzzle
5. Copy sample images to `docs/<puzzle-name>/`.
6. Present the full doc to the user for review. Do NOT proceed until approved.

## Phase 2: Schema

1. Create `schemas/canon/<puzzle-name>.json` — JSON Schema for the canonical representation.
2. Validate it against the sample JSON from the doc.
3. Register the schema in `player/api/src/lib/schema.ts`:
   - Import the new schema JSON.
   - Add a `<type_id>: ajv.compile(<schema>)` entry to the `validators` map.

## Phase 3: Frontend types

1. Add canon and answer interfaces to `player/frontend/src/types/canon.ts`.

## Phase 4: Board component

1. Create `player/frontend/src/components/<PuzzleName>Board.tsx`.
2. Must accept props: `canon`, `initialUserValues` or `initialAnswer`, `onValuesChange`, `onComplete`, `readonly`, and `liveValidate` (the player's "Errors: On" toggle: outline clues the player's decided cells already break).
3. Must implement solution validation internally and fire `onComplete()` when solved. Put non-trivial rule logic in a pure `<puzzleName>Rules.ts` with a vitest `<puzzleName>Rules.test.ts` beside it (see `sinkaminoRules.ts`, `zebraRopeRules.ts`); the Android engine ports the same functions.
4. Follow the interaction model from the doc.
5. If the grid is divided into rooms by thick borders and the player shades cells, fill shaded cells with `ROOM_SHADE` from `player/frontend/src/components/boardColors.ts`, never a near-black like `#333` (it hides the room borders). Draw text on shaded cells in black.
6. Picture puzzle: draw a small preview above the board when not `readonly` (the solved picture's cells, black on `#d9d9d9`, cells 3-8px, ~160px max), as `PictoLinkBoard.tsx` and `ZebraRopeBoard.tsx` do.

## Phase 5: Editor component

1. Create `player/frontend/src/components/<PuzzleName>Editor.tsx`.
2. Must accept `initialJson` and `onChange(json)`; emit the canon JSON on every edit (and once on mount). The surrounding modal holds the JSON textarea; the editor shows its own textarea only when the JSON doesn't parse.
3. List format problems (the same ones the API's `semanticChecks` rejects) above the board and block saving on them; see `SinkaminoEditor.tsx`.

## Phase 6: Admin integration

1. Add the new Board component to `player/frontend/src/components/CanonPreview.tsx`:
   - Import the Board component and canon type.
   - Add a `puzzleType === <ID>` branch that renders the board in readonly mode.
2. Register the Editor in `player/frontend/src/components/PuzzleEditorModal.tsx`: import it, add the type name to `EDITOR_TYPE_NAMES`, and add a `case` to `CanonEditor`. Admin and batch upload both pick it up through `hasVisualEditor`.
3. If the canon has fields the API can't check with JSON Schema alone (paths, positions, uniqueness), add a `semanticChecks[<type_id>]` entry in `player/api/src/lib/schema.ts`.
4. **Dimension detection**: Add the new type ID to the dimension computation in `player/frontend/src/pages/Admin.tsx` (in the `handleSubmit` function's `if/else if` chain that extracts `w` and `h` from canon). Also verify `computeDimensions` in `BatchUploadForm.tsx` handles the new type ID (it may already be covered by the generic `cells` branch).

## Phase 7: Renderer

1. Create `player/frontend/src/renderers/<puzzleName>.tsx`.
2. Register it in `player/frontend/src/main.tsx` (`registerRenderer(...)`).
3. Must pass `onComplete` and `liveValidate` through to the board component, and seed it from `state.restoreValues ?? <values from the saved answer>` so undo/redo restores work (see `renderers/lits.tsx`).

## Phase 8: Extractor

1. Create `player/frontend/src/extractors/<puzzleName>.ts`.
2. Register it in `player/frontend/src/extractors/index.ts`.
3. The extracted answer JSON shape must match the "Answer structure" from the doc.

## Phase 9: Progress calculator

1. Create `player/frontend/src/progress/<puzzleName>.ts`.
2. Implement a `ProgressCalculator` with `puzzleType` set to the new type ID.
3. The `compute` method should return 0–100 based on the progress metric agreed upon in Phase 1 (e.g., percentage of cells touched by trails/edges/fills). Use the same user-value key prefixes as the extractor and board component.
4. Register it in `player/frontend/src/progress/index.ts`: import and call `register(...)`.
5. Reference existing calculators (e.g., `slitherlink.ts`, `pencils.ts`) for the pattern.

## Phase 10: Parser

1. Create `parsers/src/puzzle_parsers/<puzzle_name>/` with `__init__.py`, `__main__.py`, `models.py`, `grid_detector.py`, `parser.py`.
2. Parser class must extend `PuzzleParser` and implement `_parse()` (base class handles schema validation automatically). Its `puzzle_type` must equal the schema's file name (`zebra-rope`, not `zebra_rope`): that's how the schema is found. Set `locates_board = True` and call `self._board_located(image, quad)` once the board is found.
3. Implement `validate()` method. Add the pydantic model to `MODELS` in `tests/test_schema_consistency.py`.
4. If the puzzle has number clues in grid cells, read them with EasyOCR through the shared component — never crop cells or call the OCR backend yourself:
   ```python
   from puzzle_parsers.cell_ocr import read_grid_clues
   cells = read_grid_clues(self._ocr, warped_gray, h_lines, v_lines, allow_multi_digits=True)
   ```
   `allow_multi_digits=True` for every puzzle except sudoku-style 1-9 boards. Crop margins and the confidence floor are shared (all sources use the same Nikoli font); don't add per-puzzle values. Use `read_cells(self._ocr, rois, allow_multi_digits=...)` only when cells don't come from a line grid. `tests/test_cell_ocr_contract.py` enforces this.
5. Register the new parser in `lambda_handler.py`: import it and add an `if puzzle_type == <type_id>: return <Parser>(...)` branch to `_build_parser()`. If it reads clues with EasyOCR, pass `ocr_backend=ocr` **and add the type id to `_OCR_TYPES`** — otherwise production builds it with `ocr_backend=None` and every clue reads as empty (the contract test catches this).
6. Hand-check each sample's parse against the photo (write a debug overlay), save it as `docs/<puzzle-name>/<sample>.canon.json`, and pin it in `tests/test_<puzzle_name>_parser.py` at full size and at the Android upload size (2000px long side). If the rules allow, solve each canon (e.g. CP-SAT via `ortools` in `parsers/.venv`) and check the solution is unique: that confirms both the parse and your reading of the rules.

## Phase 11: Database

1. Add an `INSERT INTO puzzle_types` entry in `player/api/seed.sql` with the new ID, name, and rule text.
2. Apply just the new row to the live DB (do NOT run the whole `seed.sql` via `--file` — it is a destructive reset + sample seed). Use the idempotent MySQL upsert with `player/api/db.sh`:
   ```
   ./player/api/db.sh "INSERT INTO puzzle_types (id, name, jp_label, rule) VALUES (<id>, '<name>', '<jp label>', '<rule>') ON DUPLICATE KEY UPDATE name = VALUES(name), jp_label = VALUES(jp_label), rule = VALUES(rule)"
   ```
   Notes: escape single quotes in the rule text by doubling them (`''`). The DB is MySQL (RDS Data API), so use `ON DUPLICATE KEY UPDATE`, not Postgres `ON CONFLICT`. Aurora Serverless auto-pauses — if the first call returns `DatabaseResumingException`, wait ~12s and retry. Verify with `./player/api/db.sh "SELECT id, name FROM puzzle_types WHERE id = <id>"`.

## Phase 12: Android port

Every new type is ported to Android by default: the player, and the admin authoring flow that uploads photos, parses them and lets the board be corrected before it's created. Without authoring the type is missing from the Android admin's type dropdown. Sources live under `player/android/app/src/main/java/com/puzzleplatform/player/`.

### Player

1. Create `puzzle/<PuzzleName>Engine.kt`, an `object` implementing `PuzzleEngine` that ports the web extractor, progress calculator and completion check exactly (same `userValues` keys, so answers sync cross-platform). Register it in `PuzzleEngines` in `puzzle/PuzzleEngine.kt`.
2. If player input is "shade or mark cells", the engine implements `ShadeMarkEngine` (`puzzle/ShadeCycle.kt`) and the board's `onTapCell` goes to `vm::tapShadeCell`; see CLAUDE.md. Don't hand-roll a cycle.
3. Create `ui/board/<PuzzleName>Board.kt`, a Compose Canvas board on `ZoomableBoard`, matching the web board's look (same colours, `BoardColors.ROOM_SHADE` for room boards) and supporting `liveValidate` if the web board does.
4. Add a `<type_id> -> <PuzzleName>Board(...)` branch to the board `when` in `ui/screens/PlayScreen.kt`.
5. Picture puzzle: override `renderThumbnail` to return a `PuzzleThumbnail` of the solved picture (the collection's solved thumbnails come from it through the engine registry), and draw `PicturePreview` above the board from the same cells (see `PictoLinkEngine.pictureCells`, `ZebraRopeEngine`).
6. Add `app/src/test/java/com/puzzleplatform/player/puzzle/<PuzzleName>EngineTest.kt` covering extract/restore, progress, completion and the thumbnail.
7. A board whose targets aren't cells (dots, edge midpoints) reads fractional positions from `ZoomableBoard`: `onTapPrecise` for taps, `onDrawStartPrecise` / `onDrawToPrecise` for drags (see `WhimsicalKnightBoard`).

### Admin authoring

The Android analog of the web editor, used to review a parsed board (batch upload) and to edit a stored question. Model it on the closest existing type (`KuralinAuthoring` for points on grid lines, `SinkaminoAuthoring` for dragged paths, `ZebraRopeAuthoring` / `WhimsicalKnightAuthoring` for both).

8. Create `puzzle/<PuzzleName>Authoring.kt`, a pure object (no Android types): `PUZZLE_TYPE`, `draftFromCanon`, `canonFromDraft`, `previewPuzzle` (a throwaway `Puzzle` for the review board, its id keyed on the size), the edit operations (cycle/toggle a clue, extend/add/remove a path, add/remove a row or column at the bottom/right), `formatProblems` (port of the web editor's, which the API rejects too) and `problems` (format problems plus overridable misread warnings, e.g. "No clues"). The draft can be the engine's own board type.
9. Add the type to `AuthoringType` in `puzzle/BatchAuthoring.kt` (label, the `jp_label` from `seed.sql`, `PUZZLE_TYPE`); `AuthoringTypeTest` checks the label.
10. Wire it into `puzzle/BoardDraft.kt`: a draft field, and a branch in `problems`, `formatProblems`, `toCanon` and `fromCanon`.
11. Create `ui/screens/<PuzzleName>Editor.kt`: the draft on the player board with edit hooks (the board takes optional callbacks, e.g. `onTapPoint`, `onEditTap`, precise drags; in edit mode taps don't play and a picture preview is hidden), the problems list, mode chips if taps and drags edit different things, and add/remove row/column buttons. Add a branch for it in `ui/screens/BoardDraftEditor.kt`.
12. Create `ui/board/<PuzzleName>MiniBoard.kt`, the batch tile's thumbnail (framed red when `hasProblems`), and add it to `BoardDraftMiniBoard` in `BoardDraftEditor.kt`.
13. Add the batch hint and the review hint for the type to the two `when (type)` blocks in `ui/screens/AdminQuestionScreen.kt`.
14. Add `<PuzzleName>AuthoringTest.kt`: round-trip each `docs/<puzzle-name>/*.canon.json` sample through `BoardDraft.fromCanon(...).toCanon(...)` with no problems (tests run from the app module, so the path is `../../../docs/...`), plus the edit operations and format problems.

### Ship

15. Run `./gradlew --offline -q :app:testDebugUnitTest` in `player/android/`.
16. Android ships only through `/cut-release`, not by pushing `main`. Tell the user the port is waiting for the next release.

## Phase 13: Verify

Tools are installed in the `player/` workspace and in `parsers/.venv` (system python's OpenCV fails unrelated tests).

1. `player/node_modules/.bin/tsc --noEmit -p player/frontend` and `-p player/api` (no type errors).
2. `player/node_modules/.bin/vitest run` in `player/frontend/`.
3. `parsers/.venv/bin/python -m pytest -q` in `parsers/`.
4. `./gradlew --offline -q :app:testDebugUnitTest` in `player/android/`.
5. Summarize what was created and any remaining manual steps (adding real puzzles; Android release).

## Guidelines

- After each phase, briefly state what was done before moving to the next.
- If a phase produces a question or ambiguity, ask before proceeding.
- Use existing puzzle implementations as reference — match conventions exactly.
- Do NOT skip phases or combine them silently.
