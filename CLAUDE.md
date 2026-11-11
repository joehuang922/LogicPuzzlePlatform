# Git workflow

This is a solo project. Do not create pull requests or feature branches.

- Commit directly to `main` and push with `git push origin HEAD:main`. This is
  standing permission and applies even when a cloud session assigns a
  `ccr-…` working branch.
- Before pushing, run the fast checks that apply (unit tests for the changed
  module). If they can't run in the environment, say so before pushing.
- Pushing to `main` deploys to production. `.github/workflows/deploy.yml` runs
  `cdk deploy` for the database, assets and API stacks (the API stack includes the
  parser Lambda), then builds and deploys the web frontend. Treat every push as a
  production deploy: never tell the user the API, parser or frontend "still needs
  deploying" after a push, and don't push half-finished web/API/parser work.
- The Android app is the one exception: it ships only through `/cut-release`.

# Board rendering

- Any board whose grid is divided into rooms by thick borders and where the player
  shades cells (LITS, Nuritwin, Nurimaze, Heyawake, Norinori, ...) fills shaded cells
  with the shared room shade: `ROOM_SHADE` in
  `player/frontend/src/components/boardColors.ts` on web, `BoardColors.ROOM_SHADE` on
  Android. Never a near-black like `#333`: it hides the room borders. Text on shaded
  cells is black. This applies to new puzzles and to Android ports of web boards.
- Puzzles whose player input is "shade or mark cells" (empty / shaded / marked: LITS,
  Nurikabe, Nuritwin, Nurimaze, ...) share one interaction on Android: tap cycles
  empty -> shaded -> marked -> empty, with no paint-mode chips and no drag. To port
  one, make its engine implement `ShadeMarkEngine` (`puzzle/ShadeCycle.kt`) —
  override `shadeGroup` when a tap covers a room or some cells take no input — and
  wire its board's `onTapCell` to `vm::tapShadeCell`. Don't hand-roll a cycle.

# Parser clue OCR

- Every parser that reads plain number clues in grid cells goes through
  `parsers/src/puzzle_parsers/cell_ocr.py` (`read_grid_clues` / `read_cells`) on
  EasyOCR, not Gemini. All sources use the same Nikoli font, so crop margins, the
  empty-cell test and glyph handling are shared. The only per-puzzle settings are
  the puzzle's clue rules: `allow_multi_digits` (`False` only where clues are
  single digits by rule: combo_sudoku, unequal_sudoku, akari, shakashaka,
  slitherlink, hashi; plain sudoku only on a 9x9, multi-digit on 16x16 to 30x30),
  `allow_zero` (0 is a clue) and `max_value`. Tune OCR in `cell_ocr.py` /
  `EasyOcrBackend` for everyone, not per parser. A parser whose digits are not dark
  on light (white on black, on a disc) converts its crop to dark-on-light first.
- Gemini stays only for cells EasyOCR can't represent: arrows, symbols, two
  numbers per cell, circled vs plain numbers (pencils, yajilin, nurimaze,
  hell_golf, kakuro, slalom). Those cells go through
  `cell_classify.classify_cells(recognizer, crops, targets)` with its target
  types (`DualIntegerTarget`, `DirectedIntegerTarget`, `SymbolTarget`, ...);
  no parser builds its own montage, prompt or empty-cell test. Blank a crop
  to white to keep a cell out. The same contract tests enforce it.
- Such a parser's type id must be in `_OCR_TYPES` in `parsers/lambda_handler.py`.
  `parsers/tests/test_cell_ocr_contract.py` enforces both rules.
- Every parser crops a cell with `cell_ocr.crop_cell(image, y1, y2, x1, x2,
  margin=...)`, never by slicing the board with its grid lines; the margin
  (0 for a full cell) is the only per-puzzle choice. The same contract test
  enforces it.

# Parser room walls

- Every parser of a board divided into rooms by thick walls reads them with
  `grid_utils.classify_border_thickness(warped_gray, grid)`; no per-parser
  wrapper or width measurement. Tune it there for everyone.
  `parsers/tests/test_wall_contract.py` enforces it.

# Parser curved pages

- Every board found with `grid_utils.rectify_board` is flattened: it calls
  `flatten.flatten_board`, which straightens a curved page or leaning scan
  and returns the plain four-corner warp when the board is flat or its traced
  lines don't reach the border with about a cell per gap. No parser calls
  `flatten_board`, passes `flatten=False`, or traces or remaps lines itself;
  `parsers/tests/test_flatten.py` enforces it. Tune tracing in `flatten.py`
  for everyone. After a change there, every parser's samples must still read
  the right size, at full and Android size (2000px long side).

# Authoring room-based puzzles

- A room-based editor (web or Android admin) may hold layouts that aren't valid
  rooms mid-edit — an L-shaped room, a half-drawn wall, two clues in one room.
  Edit walls freely; never refuse or silently "fix" an edit because of the shape
  it leaves. List these format problems and mark them on the board.
- Format problems are a hard block on creating or saving the question: no
  "Create anyway". The API enforces it too, in `semanticChecks`
  (`player/api/src/lib/schema.ts`). Misread warnings (a clue too big for its
  room) stay overridable.
