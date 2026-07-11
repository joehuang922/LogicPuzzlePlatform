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
3. Ask the user targeted questions to fill any gaps:
   - Is this cell-based input (player fills cells) or edge-based input (player draws on borders)?
   - What symbols or elements appear in cells?
   - What constitutes a valid solution (finishing criteria)?
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

## Phase 6: Renderer

1. Create `player/frontend/src/renderers/<puzzleName>.tsx`.
2. Register it in `player/frontend/src/components/PuzzleBoard.tsx`.
3. Must pass `onComplete` through to the board component.

## Phase 7: Extractor

1. Create `player/frontend/src/extractors/<puzzleName>.ts`.
2. Register it in `player/frontend/src/extractors/index.ts`.
3. The extracted answer JSON shape must match the "Answer structure" from the doc.

## Phase 8: Parser

1. Create `parsers/src/puzzle_parsers/<puzzle_name>/` with `__init__.py`, `__main__.py`, `models.py`, `grid_detector.py`, `parser.py`.
2. Parser class must extend `PuzzleParser` and implement `_parse()` (base class handles schema validation automatically).
3. Implement `validate()` method.

## Phase 9: Database

1. Add an `INSERT INTO puzzle_types` entry in `player/api/seed.sql` with the new ID, name, and rule text.

## Phase 10: Verify

1. Run `npx tsc --noEmit` in `player/frontend/` to verify no type errors.
2. Run `pytest` in `parsers/` to verify no test regressions.
3. Summarize what was created and any remaining manual steps (e.g., deploying, adding real puzzles).

## Guidelines

- After each phase, briefly state what was done before moving to the next.
- If a phase produces a question or ambiguity, ask before proceeding.
- Use existing puzzle implementations as reference — match conventions exactly.
- Do NOT skip phases or combine them silently.
