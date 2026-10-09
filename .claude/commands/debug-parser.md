Debug and refine a puzzle image parser, with the human in the loop.

## Inputs

- **Puzzle name** — simple English, e.g. `nurikabe`, `number-link`, `kakuro`.
- **Source image path** — the scan that parses poorly.

If either is missing, ask. Nothing else is needed — the puzzle name maps to a
type id and parser via `parsers/tools/debug_parser.py`.

## What this workflow is

A repeatable loop for the recurring task of making a parser read a specific
image correctly. A parse is a pipeline — **geometry → clue classification →
board render** — and bugs live in exactly one stage at a time. We look at the
three views in that order (a geometry bug corrupts every downstream cell, so
never debug OCR before confirming the grid is right), form a hypothesis, and —
critically — **pause for the user's heuristic insight** before prototyping a
fix. The user knows the puzzle conventions (clue ranges, glyph quirks, grid
style) and will often hand you the key observation.

## Phase 1: Generate the three views

Run the committed harness (never re-derive crop margins or re-write montage
scripts by hand — the harness captures the *exact* ROIs the parser extracted):

```
make debug-parser NAME=<name> IMG="<path>"
```

Outputs land in `/tmp/parser_debug/<name>/`:
- **Geometry**: `01_border.png`, `02_warped.png`, `03_gridlines.png` (names vary
  by parser — slitherlink emits `01_dots_raw.png`, etc.). These show whether
  quadrilateral contour detection and grid-line fitting are correct.
- **Clue montage**: `byclass.png` — every clue-predicted crop grouped by
  predicted value. Reading glyphs against their bucket exposes systematic
  misclassification independent of grid alignment.
- **Board**: the parser's final overlay (`04_cells.png` / `05_parsed.png`),
  `board.json`, and `histogram.txt`.

Non-OCR parsers (e.g. akari, lits, kakuro) have no clue montage — the harness
says so and emits geometry + board only.

## Phase 2: Read the views in order and diagnose

Read the images with the Read tool and report what you see, **in this order**.
Stop at the first stage that is clearly broken — fixing it may change
everything downstream.

1. **Geometry** (`03_gridlines.png`, `02_warped.png`): Is the grid rectified
   square? Does the detected row/column count match the real board? Ghost rows /
   columns, skew, or a mis-cropped border are grid-detection bugs — report the
   detected `rows x cols` from `board.json` vs. what you count in the image.
2. **Clue classification** (`byclass.png`, `histogram.txt`): For each predicted
   value, do the grouped crops actually show that digit? Flag systematic
   confusions (a bucket full of the wrong glyph) and implausible histograms
   (e.g. far too many of one value). Note multi-digit or non-integer clue types
   (directed arrows, dual ints) the single-digit path can't represent.
3. **Board render** (`04_cells.png`): Overall, how many clues are right / wrong /
   missing / ghost? Give a rough count, not just an impression.

Name the **single most impactful** failure mode and which stage owns it.

## Phase 3: Pause for the user's heuristics

Present the diagnosis and **explicitly ask the user for their insight** before
coding a fix. They may know, e.g., "clues here never exceed the grid dimension",
"this font's 9 has a closed loop", "those are dashed grid lines". Incorporate
what they give you. Do not skip this step — it is the point of the workflow.

### Optional: objective confusion matrix

If the visual audit is inconclusive (is that a 3 or a 5?), offer to run the
Gemini oracle — it re-reads the same crops and prints an EasyOCR-vs-Gemini
confusion matrix:

```
make debug-parser NAME=<name> IMG="<path>" ORACLE=1
```

Needs `GEMINI_API_KEY`. Costs one batch of API calls, so it is opt-in, not
default. Treat it as a *second opinion*, not ground truth — the oracle can
hallucinate on a mis-tiled montage.

## Phase 4: Prototype, measure, then fix

1. Prototype the fix in a throwaway `/tmp` script against the real crops and
   **measure** it — accuracy on a hand-labelled disputed set, before/after
   histogram, ghost count. Do not ship an unmeasured change.
2. When sweeping a parameter (e.g. a confidence floor), sweep it against truth
   and pick the value by the data, not by guess. Report the trade-off.
3. Apply the fix to the real parser. Respect shared code: `recognize_cells` /
   `_recognize_single_cell` back ~14 OCR types, and single-digit types rely on
   the default behaviour — make new behaviour **opt-in via kwargs** and have
   only the relevant parser opt in. Verify the default path is byte-for-byte
   unchanged (diff old vs new predictions on the same crops).
4. Re-run `make debug-parser` and confirm the targeted view improved and nothing
   regressed. Run `cd parsers && .venv/bin/python -m pytest -q`.

## Phase 5: Honest wrap-up and ship

- State what improved **with numbers**, and name the **residual** failures you
  did not fix (and why — e.g. genuinely ambiguous low-contrast glyphs are the
  editor's job by design).
- Accuracy is the bar, not speed: 1–2 wrong clues on a dense board is shippable
  because the Admin editor is the intended backstop.
- Ask before committing. When approved, commit the parser change (and any
  harness improvement) with a message that records the mechanism and the
  measured before/after. Push per the repo's ship convention.

## Notes

- The harness never writes to the repo or DB — only to `/tmp/parser_debug/`.
- Add newly-discovered, non-obvious parser quirks to memory so future sessions
  start ahead (e.g. [[parser-accuracy-metric]], [[tentaishow-parser-metric]]).
