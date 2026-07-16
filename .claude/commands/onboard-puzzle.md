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
4. Draft the full documentation file following the template in existing docs (e.g., `docs/nurimaze/nurimaze.md`). Must include all sections:
   - Puzzle Type ID
   - Question structure description + Canonical JSON structure + Sample images
   - Answer structure description + Canonical JSON structure
   - Rules + Success finishing criteria
   - Puzzle Player > Interactions + Progress calculation (leave empty)
   - Puzzle Editor > Interactions
   - Puzzle Parser (notes on visual parsing challenges)
   - Misc > Coordinate convention
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
2. Must accept props: `canon`, `initialUserValues` or `initialAnswer`, `onValuesChange`, `onComplete`, `readonly`.
3. Must implement solution validation internally and fire `onComplete()` when solved.
4. Follow the interaction model from the doc.

## Phase 5: Editor component

1. Create `player/frontend/src/components/<PuzzleName>Editor.tsx`.
2. Must accept `initialJson`, `onComplete`, `onCancel`.
3. Show a visual editor alongside a JSON textarea (source of truth, bidirectional sync).

## Phase 6: Admin integration

1. Add the new Board component to `player/frontend/src/components/CanonPreview.tsx`:
   - Import the Board component and canon type.
   - Add a `puzzleType === <ID>` branch that renders the board in readonly mode.
2. Add the new Editor component to `player/frontend/src/pages/Admin.tsx`:
   - Import the Editor component.
   - In both `QuestionForm` and `PuzzleEditRow`: add the type to `isXxx`/`hasEditor` checks, and add an editor branch in the ternary chain.
3. Add the new Editor component to `player/frontend/src/components/BatchUploadForm.tsx`:
   - Import the Editor component.
   - Add the type name to the `hasEditor` array.
   - Add a branch in `InlineEditor` that renders the new editor.
4. If the new type uses `cells` for dimension computation, verify `computeDimensions` in `BatchUploadForm.tsx` handles the new type ID (it may already be covered by the generic `cells` branch).

## Phase 7: Renderer

1. Create `player/frontend/src/renderers/<puzzleName>.tsx`.
2. Register it in `player/frontend/src/components/PuzzleBoard.tsx`.
3. Must pass `onComplete` through to the board component.

## Phase 8: Extractor

1. Create `player/frontend/src/extractors/<puzzleName>.ts`.
2. Register it in `player/frontend/src/extractors/index.ts`.
3. The extracted answer JSON shape must match the "Answer structure" from the doc.

## Phase 9: Parser

1. Create `parsers/src/puzzle_parsers/<puzzle_name>/` with `__init__.py`, `__main__.py`, `models.py`, `grid_detector.py`, `parser.py`.
2. Parser class must extend `PuzzleParser` and implement `_parse()` (base class handles schema validation automatically).
3. Implement `validate()` method.
4. Register the new parser in `lambda_handler.py`: import it and add a `<type_id>: <Parser>(ocr_backend=_ocr)` entry to the `_parsers` dict inside `_init_parsers()`.

## Phase 10: Database

1. Add an `INSERT INTO puzzle_types` entry in `player/api/seed.sql` with the new ID, name, and rule text.

## Phase 11: Verify

1. Run `npx tsc --noEmit` in `player/frontend/` to verify no type errors.
2. Run `pytest` in `parsers/` to verify no test regressions.
3. Summarize what was created and any remaining manual steps (e.g., deploying, adding real puzzles).

## Guidelines

- After each phase, briefly state what was done before moving to the next.
- If a phase produces a question or ambiguity, ask before proceeding.
- Use existing puzzle implementations as reference — match conventions exactly.
- Do NOT skip phases or combine them silently.
