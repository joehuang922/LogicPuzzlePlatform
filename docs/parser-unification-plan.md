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
| 2 | Warp the board to a rectangle | `grid_utils.warp_to_rectangle` | sudoku warps to a fixed 540×540 (to fold into row 3) | 24/25 shared |
| 3 | Normalise to a standard cell size | `grid_utils.rectify_board` / `normalize_cell_scale` (72–160 px/cell band; grid found on the normalised board, clues read at native resolution via `RectifiedBoard.to_native`) | masyu keeps its own 180 px rescale until its line finder moves to shared code (row 4) | **done** for 24 detectors |
| 4 | Find the grid lines | `grid_utils.find_grid_lines` (lattice candidates chosen by the autocorrelation pitch, at exactly 72 px/cell; lines follow the ink) | batch 1 (dashed: fillomino, hell_golf, norinori, number_link, nurikabe, pencils, ripple_effect, shakashaka, shikaku) and batch 2 (solid: akari, choco_banana, heyawake, hitori, lits, nurimaze, nuritwin, picto_link, slalom, yajilin) and batch 3 (dots/circles: tentaishow, kuralin) migrated; outer lines sit on the border's ink and inner lines are tracked one pitch at a time from each border; kakuro, masyu, double_choco, sudoku stay custom for now | in progress |
| 5 | Count cells when lines are unreliable | `find_grid_lines` (lattice fit) | `tentaishow._count_cells` deleted with batch 3 | **done** |
| 6 | Make an evenly spaced line list | `grid_utils.uniform_grid` | double_choco `_uniform_grid_snapped` (slalom's `_uniform_lines` removed with batch 2) (pencils' copy removed: it moved to `detect_uniform_grid`) | to dedupe |
| 7 | Enforce square-ish cells | `grid_utils.reconcile_square_lines` | used by 5 parsers; the lattice fit has its own square-cell rescue | to unify |
| 8 | Follow a curved page | masyu `_flatten_curved_board` (re-warps along traced lines) | `grid_utils` pitch + snap fallback (commit 9af6bd2) | two approaches, pick one |
| 9 | Trim a neighbouring puzzle's title band | masyu `_dominant_extent` | — | to extract |
| 10 | Hold the grid result | `board_grid.BoardGrid` | none (kuralin and tentaishow geometries now hold a `BoardGrid` plus their circles/dots) | **done** for 24 detectors |
| 11 | Crop a cell | `cell_ocr.crop_cell` | the Gemini parsers crop by hand (akari, heyawake, kakuro, nurimaze, nuritwin, pencils, shakashaka, shikaku, yajilin), mostly at a 20% margin | to migrate |
| 12 | Is this cell empty? | — | heyawake ink fraction; shikaku dark fraction; EasyOCR's 3% pixel-ratio check inside `recognition.py` | to extract |
| 13 | Is this cell black / filled? | `cell_fill.is_filled` (dark fraction > 0.35; akari and shakashaka use it — shakashaka keys went 15/2/1 → 0/0/0 errors) | kakuro mean brightness; slalom `classify_walls` dark ratio | 2 done; kakuro, slalom next |
| 14 | Read a plain number in a cell | `cell_ocr.read_grid_clues` / `read_cells` | heyawake and nuritwin read plain dark-on-light numbers through Gemini | done for 10; 2 candidates |
| 15 | Read composite cell content (arrows, two numbers, symbols, white-on-black) | `recognition.GeminiRecognizer` montage + `cell_classify` + prompts in `recognition_schemas.py` | — | shared; confirm all callers |
| 16 | Measure room-wall thickness | `grid_utils.classify_border_thickness` | six identical 27-line `classify_borders` wrappers (heyawake, lits, norinori, nurimaze, nuritwin, ripple_effect) | to delete wrappers |
| 17 | Find circles and dots | `ring_probe.probe_ring` / `fill_ratio` (ring test at lattice points; kuralin and tentaishow) | masyu `_detect_circles` (ring pooled over 8 tiles) | 2 done; masyu next |
| 18 | Address cells, edges and corners | `BoardGrid.point(dr, dc)` / `BoardGrid.doubled(x, y)` (doubled coordinates through the found lines; kuralin, tentaishow) | slalom works out edge/corner positions itself | 2 done; slalom next |
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
- **Row 8.** Masyu's flattening re-warps the photo along traced lines, so the
  grid ends up straight. The `grid_utils` fallback only snaps straight lines
  onto the ink, so a line that bends along its own length still drifts a few
  pixels (visible on the fillomino curved photo). Flattening is the better
  end state, but it currently erases masyu's circles and assumes solid lines.
- **Row 14.** Shikaku also uses Gemini, but its clues are white numbers on
  solid dark circles, which EasyOCR can't read as-is. Leave it on Gemini.
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
