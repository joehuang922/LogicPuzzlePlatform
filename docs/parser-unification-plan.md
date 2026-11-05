# Parser unification plan

## Goal

When a parser needs to do a specific job — find the board, find the grid lines,
tell whether a cell is black, read a number, measure a room wall — it calls the
one shared implementation of that job. A fix to that job then reaches every
parser that depends on it.

This is **not** a framework. There is no "universal parser" and no pipeline
class that every puzzle must fit. Parsers stay small scripts that compose
shared functions in whatever order their puzzle needs. The only rule is:
**one job, one implementation.**

Reference: `parsers/src/puzzle_parsers/cell_ocr.py` (commit 59bee79) is the
model to copy. Ten parsers used to crop and OCR cells their own way; now they
all call `read_grid_clues`, with one parameter (`allow_multi_digits`), and a
contract test (`tests/test_cell_ocr_contract.py`) stops a parser from
hand-rolling it again.

## Scope

The 25 rectangular-grid parsers: akari, choco_banana, double_choco, fillomino,
hell_golf, heyawake, hitori, kakuro, kuralin, lits, masyu, norinori,
number_link, nurikabe, nurimaze, nuritwin, pencils, picto_link, ripple_effect,
shakashaka, shikaku, slalom, sudoku, tentaishow, yajilin.

Out of scope: nonogram (clue strips outside the grid), combo_sudoku
(overlapping sub-boards), slitherlink (dot lattice, clues between dots).

## Shared jobs

Each row is one job. "Home" is the module that owns it; "Duplicates" are the
places that do the same job their own way today and should switch to the home.

| # | Job | Home | Duplicates today | Status |
|---|-----|------|------------------|--------|
| 1 | Find the board outline | `grid_utils.find_quadrilateral_border` | none (kakuro's Hough-grid border and sudoku's own finder removed; same grids, kakuro black-cell maps identical, sudoku 0 errors) | **done** |
| 2 | Warp the board to a rectangle | `grid_utils.warp_to_rectangle` | none (sudoku's fixed 540×540 warp replaced by `rectify_board`) | **done** |
| 3 | Normalise to a standard cell size | `grid_utils.rectify_board` / `normalize_cell_scale` (72–160 px/cell band; grid found on the normalised board, clues read at native resolution via `RectifiedBoard.to_native`) | none (masyu's own 180 px rescale removed with row 8) | **done** |
| 4 | Find the grid lines | `grid_utils.find_grid_lines` (lattice candidates chosen by the autocorrelation pitch, at exactly 72 px/cell; lines follow the ink) | batch 1 (dashed: fillomino, hell_golf, norinori, number_link, nurikabe, pencils, ripple_effect, shakashaka, shikaku) and batch 2 (solid: akari, choco_banana, heyawake, hitori, lits, nurimaze, nuritwin, picto_link, slalom, yajilin) and batch 3 (dots/circles: tentaishow, kuralin) and batch 4 (double_choco, sudoku) migrated, then kakuro and masyu after `flatten_board` (row 8); outer lines sit on the border's ink and inner lines are tracked one pitch at a time from each border | **done** |
| 5 | Count cells when lines are unreliable | `find_grid_lines` (lattice fit) | `tentaishow._count_cells` deleted with batch 3 | **done** |
| 6 | Make an evenly spaced line list | `grid_utils.uniform_grid` | none in parsers (double_choco's and slalom's copies removed with row 4; pencils' removed) | **done** |
| 7 | Enforce square-ish cells | `find_grid_lines` (`_square_cell_recount`: an axis whose cells come out >15% larger than the other's lost lines and is recounted at its own autocorrelation pitch; one axis with no count takes the other's) | none (`reconcile_square_lines` and its five helpers deleted; nonogram's playable grid moved to `find_grid_lines`; `tests/test_nonogram_grid.py`) | **done** |
| 8 | Follow a curved page | `flatten.flatten_board(image, board)` (traces every line through strips, remaps so they come out straight and even; flat boards pass through unchanged), called by kakuro, masyu, picto_link, fillomino | none (masyu's tracer moved here; `grid_utils.detect_uniform_grid` and its pitch + snap fallback deleted; `tests/test_flatten.py`) | **done** |
| 9 | Trim a neighbouring puzzle's title band | `flatten._dominant_extent` (on traced lines only) | — | in flatten; straight boards rely on the border finder |
| 10 | Hold the grid result | `board_grid.BoardGrid` | none (kuralin and tentaishow geometries now hold a `BoardGrid` plus their circles/dots) | **done** for 24 detectors |
| 11 | Crop a cell | `cell_ocr.crop_cell(image, y1, y2, x1, x2, margin=)` (margin is where the puzzle puts content: 0 = full cell for kakuro's corner numbers, pencils, slalom; 0.1-0.25 for symbols and centre fill tests; default = the OCR crop) | none (17 hand slices in akari, double_choco, hell_golf, kakuro, masyu, nurimaze, pencils, shakashaka, shikaku, slalom, yajilin moved; nonogram's clue strips and slitherlink's dot lattice are out of scope; `tests/test_cell_ocr_contract.py`) | **done** |
| 12 | Is this cell empty? | `recognition._is_blank` (contrast of a blurred 64 px copy; empty ≤ ~50, faintest digit ~127, cutoff 90) for every OCR cell | heyawake's ink fraction removed; shikaku dark fraction (clue disc detection) | done for OCR cells |
| 13 | Is this cell black / filled? | `cell_fill.is_filled` (dark fraction > 0.35): akari, shakashaka, slalom | none. Kakuro's clue cells are grey-shaded, not black (13-31% black-dark), so it keeps mean < 200 (shaded <= ~171, plain >= ~241); "is this cell shaded" is a separate job, see row 13b | **done** |
| 13b | Is this cell shaded (light grey vs white)? | `cell_fill.shaded_cells(crops)` (60th percentile of each crop averaged to 24 px, i.e. the paper and not the digit; Otsu split alternating with a plane fit of the white-paper lighting): double_choco | none. Kakuro keeps its fixed mean < 200: its clue cells are dark grey, separated by ~70 grey levels, and the adaptive split broke on its big photo | **done** |
| 14 | Read a plain number in a cell | `cell_ocr.read_grid_clues` / `read_cells` (EasyOCR recogniser on a located glyph; clue rules `allow_multi_digits`, `allow_zero`, `max_value`) | none: akari, heyawake, nuritwin, shakashaka, shikaku, slitherlink moved off Gemini | **done** for 17 |
| 15 | Read composite cell content (arrows, two numbers, symbols, white-on-black) | `recognition.GeminiRecognizer` montage + `cell_classify` + prompts in `recognition_schemas.py` | — | shared; confirm all callers |
| 16 | Measure room-wall thickness | `grid_utils.classify_border_thickness(gray, grid)` (width of the run through the line, sub-pixel, 40th percentile of 7 points; Otsu split; dead-end repair) | none (the six `classify_borders` wrappers deleted; `tests/test_wall_contract.py`) | **done** |
| 17 | Find circles and dots | `ring_probe.probe_ring` / `fill_ratio` (ring test at lattice points; kuralin and tentaishow) | masyu `_detect_circles` (3x3 ink topology per cell) | 2 done; masyu next |
| 18 | Address cells, edges and corners | `BoardGrid.point(dr, dc)` / `BoardGrid.doubled(x, y)` (doubled coordinates through the found lines; kuralin, tentaishow, slalom's overlay) | none in parsing: slalom finds gates cell by cell (`detect_gate_cells`), and the remaining hand-computed centres are debug overlays (row 19) | **done** |
| 19 | Draw debug overlays | — | 9 copies of the `04_cells.png` digit overlay | to extract |
| 20 | Read title/author around the board | `PuzzleParser` + `metadata_extract` | — | shared |
| 21 | Report parse-quality problems | — | none (see "Sanity checks") | new |

Notes on specific rows:

- **Row 4.** Line style decides the method today, but every parser already
  knows its own line style. The shared entry should take the style as an
  argument (`solid` / `dashed`) rather than every parser picking among five
  functions. It must also cope with non-grid ink: dense clue columns, black
  cells, halftone grey, circles and dots all look like lines to a projection.
- **Row 3 (shipped).** Known regressions from lines shifting a few pixels:
  heyawake-medium and nuritwin each read one thin wall as thick; EasyOCR on
  fillomino-big flips `1`/`7` both ways (+15/−14). Fix under rows 4 and 16.
- **Batch 2 (row 4, shipped).** On answer keys: shakashaka 15/2/1 → 0/0/0,
  pencils-big 9 → 0, lits-medium 3 → 2, hitori 17×17 2 → 3 (one `1`/`7` flip),
  the rest unchanged. On unkeyed samples, judged by eye: 7 fixed, 19 broken,
  mostly EasyOCR `1`/`7` and `2`/`9` flips on fillomino-big (small shifts of
  the crop flip this font), ripple_effect-medium's two edge walls back to thick
  (one shared thick/thin threshold), and picto_link-big whose printed columns
  are slanted (~5 px across the board) so no straight line fits — row 8.
  Next targets: shift-robust EasyOCR (row 14) and wall thickness (row 16).
- **Batch 3 (rows 4, 17, 18).** The grid move alone left all 8 tentaishow and
  kuralin parses (2 sizes each) identical. Tentaishow's HoughCircles then
  turned out to miss dots: 24/38 found on the Easy board (16 as JPEG), 74–83
  of 91 on Medium. Kuralin's lattice ring test, now shared as `ring_probe`,
  finds 38/38 and 91/91 with no ghosts or colour errors, down to 500 px
  images (weakest real dot 0.87 support vs 0.24 for the strongest empty
  point; cutoff 0.75). Kuralin stays exact on both keys and is ~6x faster
  (vectorised). The committed Easy key had 3 dots not printed on the board;
  removed.
- **Batch 4 (row 4).** double_choco and sudoku: identical boards on every
  sample at both sizes; sudoku key 0 errors, double_choco keys unchanged (its
  20 and 15 errors are cell-colour reads). double_choco's 4000px photo of
  halftone grey had no trustworthy pitch (the threshold turned every halftone
  dot into ink), so `estimate_cell_pitch` now retries on halved copies; no
  other parser's geometry changed (118 of 124 samples identical, the rest are
  double_choco's own lines). Kakuro was tried and held back: its big scan
  (one page, three crops) leans ~0.36 cell top to bottom and its border sits
  up to 0.4 cell outside the grid behind a heavy frame, so no straight-line
  fit beats its current finder (line error 7-12 px at top and bottom with
  either), and every count/placement fallback that fixed it moved
  fillomino, picto_link or kakuro's own edge cells. Masyu's line finder is
  its flattening step. Both move with row 8.
- **Row 13 (shipped).** Slalom's wall test (dark < 128 over 40%) moved to
  `is_filled`: walls measure 0.57+ dark and empty cells 0.33 or less, so
  every slalom run (and every kakuro run, untouched) is identical. Kakuro
  can't use `is_filled`: its clue cells are grey shading with white discs
  and diagonal, so `is_filled` flipped 12-100 cells per board.
- **Row 13b (shipped).** Double_choco's Otsu over cell means read white
  cells holding a large digit as grey: the digit's ink pulls the mean down.
  `shaded_cells` reads each cell's paper instead (60th percentile after
  averaging to 24 px, which also blurs halftone dots on 4000 px photos) and
  divides out the lighting (a plane fitted to the white cells, alternating
  with the split; the small board's paper runs 219-259 across it). Keys at
  full and Android size: small 15 -> 0, medium 20 -> 7; medium-2 (no key):
  14 cells change, all white digit cells that had read grey. The 7 left on
  medium are a faintly printed grey patch in its top-left corner, as bright
  as white paper within a few %; colour tint and halftone texture were tried
  and are not reliable (tint varies per photo, digits swamp texture).
- **Row 11 (shipped).** Every hand slice computed the same box (a fixed
  fraction in from the cell's lines) with its own margin, so the margins stay
  per puzzle and only the arithmetic is shared. Every crop handed to a reader
  is byte-identical: hashed montages sent to Gemini (kakuro, nurimaze,
  pencils, yajilin, slalom, hell_golf) and all 68 parser outputs over the 11
  touched parsers at full and Android size match HEAD, so no Gemini run was
  needed. Whether those margins are the best ones (nurimaze 0.2 vs yajilin
  0.1) is a separate, Gemini-measured question.
- **Row 7 (shipped).** `reconcile_square_lines` (nonogram only) worked from
  detected peaks and mostly guarded that input's flaws (median gaps on a
  curled page, bold every-5 lines posing as a full comb); its one idea the
  shared finder lacked was the cross-axis check. Without it, `find_grid_lines`
  read nonogram's playable grid as 25x5 / 35x7 on 5 of 8 runs (only the bold
  separators passed the lattice test), the same trap as masyu-big's 5x31
  before flattening. With `_square_cell_recount` all 8 nonogram runs read
  right and its geometry is identical to before; the other 124 runs are
  identical and the recount never fires on them. `detect_grid_lines` (peak
  finder) stays only as `find_grid_lines`' last resort when no pitch and no
  lattice count exist; it fired on none of the 132 runs.
- **Row 8 (shipped).** Masyu's tracer, generalised, is now
  `flatten.flatten_board`: it works at 72 px/cell on a re-warp of the photo
  with a 0.75-cell margin, keeps only line-like ink (cell-sized blobs such as
  clue circles are erased; ink over 0.2 cell thick, i.e. black cells and
  filled discs, keeps only its rim), traces each line through ~8-cell strips,
  and remaps the native board so the traced lines are straight and even when
  they sit over 0.05 cell off a straight grid. Two fixes over masyu's version:
  a line drawn as several runs (frame plus page edge beside it) takes the run
  a cell from its neighbours instead of the strongest one, and a line needs
  only half the strips (a border merged with black cells drops out of some).
  Its own line count can be wrong on boards with a title band in the border,
  halftone or a heavy frame (double_choco, shakashaka, slalom, lits... in a
  survey of every sample), so parsers opt in: kakuro, masyu, picto_link and
  fillomino, whose 32 runs (16 samples x full/Android) all trace to the right
  size. The shared grid finder had read masyu-big and the curved photo as
  5x31 and 5x64 and kakuro big-2 as 33x22. Results: masyu's three keys exact
  at both sizes, with its 700-line detector gone and 2-4x faster (curved photo
  2.4 s -> 0.7 s). Kakuro big scans: cell edges more than 0.15 cell off the
  printed line ~340 -> ~20 per board; Gemini clue reads vs the DB key 21 -> 7
  (big.png) and 22 -> 6 (cropped-2, Android), and the three copies of the
  puzzle now agree to within 1 cell (6/12/16 before); four of the remaining
  differences are key errors. Black-cell maps unchanged (already exact).
  Picto link big: worst-5% line error 0.16 -> 0.02 cell; EasyOCR changes on
  picto and fillomino: 5 cells, all fixes (8->3, 1->4, 12->2, 712->12,
  16->10). Every other parser's geometry is identical (96/96 runs).
  Candidates to opt in later, flat scans whose lines sit 0.1-0.3 cell off a
  straight grid: yajilin-big, norinori-medium, nurimaze-big, pencils-big.
- **Row 14 (shipped).** EasyOCR's text detector was the weak link on single
  cells (nothing found in a lone `7`; this font's `1` read as `7`, `2` as `9`).
  The backend now finds the glyph itself (Otsu ink minus edge grid scraps and
  slanted lines in the outer 12%), renders it at 64 px with a white margin and
  calls the recogniser on that box. Answer-key cells: 8 errors -> 1 (806
  cells). Unkeyed bench changes: 50 fixed, 2 broken (picto big's slanted
  columns). ~10x faster (fillomino-big 7.1 s -> 0.7 s). The six Gemini digit
  parsers then moved to `cell_ocr`: five give boards identical to Gemini on
  all 11 samples, slitherlink-medium-1 fixes 18 cells Gemini's montage put one
  cell off; 0.05-0.8 s instead of 2.5-6.4 s, and no Gemini call. Shikaku lifts
  its white number off the disc first (`_disc_digit`). The fillomino-medium key
  had 3 wrong cells (r8c12 1, r8c13 11, r11c6 1); fixed.
- **Row 16 (shipped).** The old width was the longest dark run within
  +-30% of a cell, so the bottom stroke of a digit above a thin wall read as
  a thick wall (heyawake 13-16 per board), and whole-pixel widths left thick
  and thin a value apart (norinori-medium flipped ~157 walls between nearby
  settings). Now: the run through the line (seeded within 12% of a cell),
  sub-pixel edges, 40th percentile of the points (a digit covers the middle
  ones), then a repair step: rooms are closed, so a thick wall that ends
  mid-board flips the least certain wall at that corner. Keyed walls 31 -> 4
  (all four are two heyawake-titled walls the key has wrong: printed thin,
  measured 5 px like every thin wall); dead-end walls on all 13 samples x 2
  sizes 68 -> 0; full vs Android disagreements 42 -> 9. End to end,
  lits-medium 2 -> 0, nuritwin 3 -> 0, ripple_effect 1 -> 0. Unkeyed changes
  judged by eye: heyawake 20 fixed, norinori 6 fixed, ripple_effect-medium
  12 fixed, nurimaze-big ~10 fixed (full) / ~15 (Android); broken: nurimaze-big
  h7,30 (and h3,30, h41,25 on Android), narrow solid lines in its last column
  that measure between the classes and leave a valid layout either way.
- **Row 17.** Kuralin's comment records why it moved off HoughCircles: a gray
  circle with touching dashes defeated both Hough and the contour fallback,
  while a ring test at a known lattice point found it. That argues for the
  ring test as the shared method.

## Sanity checks (step 4)

Rule and format checks already exist in three places and run on hand-edited
boards too:

- the parser checks the output's shape against the canon schema
  (`validate_canon`);
- the API runs semantic checks for some types (`semanticChecks` in
  `player/api/src/lib/schema.ts`);
- the Android and web editors list format problems and misread warnings per
  type (for example "R7C9: 4 connected 1s can't fit in one 1-cell room").

Copying those rules into Python would mean three copies to keep in sync. The
parser's own check should be about **parse quality** instead — signals only
the parser has:

- cells that had ink but read as nothing (unreadable);
- low-confidence reads;
- the line count disagreeing with the pitch or dot-lattice count;
- the grid fit having fallen back (e.g. curved-page path, peak counting);
- a clue count far from what the board size suggests.

Shape: one shared `ParseReport` returned alongside the canon, with each
problem tied to a cell (`R{r}C{c}`) where possible, so the editors can mark it
on the board. Defined independently of the parsers; each parser only records
what it saw.

## How each change is made

Every row above is migrated the same way, one row (or one small group) per
commit:

1. **Baseline.** Run every affected parser on all of its `docs/<puzzle>/`
   samples and save the boards and timings.
2. **Move.** Point the duplicates at the home implementation; delete the copy.
   Where two duplicates disagree (e.g. mean brightness vs dark fraction),
   pick one by measurement, not by guess.
3. **Measure.** Re-run, diff against the baseline, and judge every changed
   cell by eye on a contact sheet. Report fixed / broken / still-wrong counts
   and the time change. Masyu's canon tests and
   `tests/test_fillomino_grid.py` are existing guardrails; add a pinned sample
   wherever a type has none.
4. **Guard.** Extend the contract test pattern (`test_cell_ocr_contract.py`):
   a test fails if a parser reimplements a job that has a home. Add one line
   to the relevant CLAUDE.md section and to `/onboard-puzzle` Phase 10.
5. **Ship.** Push only when nothing regressed or the trade-off is stated.
   Watch the parser Lambda's hard 29s limit, set by API Gateway (EasyOCR cold
   start is ~7s).

## Order

Ordered so each step is safe on its own and later steps build on earlier ones.

1. **One geometry type (row 10).** Pure refactor, no behaviour change, and
   every later step needs it. Verify byte-identical boards.
2. **Small dedupes (rows 6, 16, 19).** Delete copies of `uniform_grid`, the six
   `classify_borders` wrappers and the overlay copies. Byte-identical boards
   expected.
3. **Cell crop + empty + filled (rows 11, 12, 13).** Moves the Gemini parsers
   onto `crop_cell`; picks one empty-cell and one filled-cell rule by
   measurement. Changes boards, so measure.
4. **Board outline (rows 1, 2).** Make the black-edge border search a shared
   option of the border step; move sudoku onto the shared finder.
5. **Grid lines (rows 3, 4, 5, 7, 9).** The big one. Resolution
   normalisation first, then one entry per line style with square-cell and
   title-band handling built in. Migrate parsers in small batches.
6. **Curved pages (row 8).** Generalise masyu's flattening to dashed lines
   and digit clues, then retire the snap fallback.
7. **Circles, dots and edge/corner addressing (rows 17, 18).** Ring test at
   lattice points for masyu, kuralin and tentaishow.
8. **Number reading candidates (row 14).** Measure heyawake and nuritwin on
   `cell_ocr` against Gemini; switch only if accuracy holds.
9. **Parse-quality report (row 21).** Add `ParseReport`, then surface it in
   the editors.

## Non-goals

- No base class or pipeline that forces every puzzle through the same steps.
- No per-puzzle tuning knobs in shared code beyond what a job genuinely needs
  (e.g. `allow_multi_digits`, line style). If a puzzle needs a different
  margin, first ask whether the shared value is wrong for everyone.
- No rewrite of a parser that already uses the home implementation.

## Open questions

- Gemini crop margin: the Gemini parsers mostly crop at 20%, `cell_ocr` at
  15% / 10%. Does one margin serve both, or does the montage want more
  context? Measure in step 3.
- Should `ParseReport` problems be shown in the editors next to the existing
  format problems, or as a separate "check these cells" list?
