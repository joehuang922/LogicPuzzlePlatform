# Skeleton Puzzle (スケルトンパズル)

**Puzzle Type ID:** 35

## Question structure description

A crossword-shaped board with no clue numbers. Some squares of a rectangular lattice are **cells**: white squares where the kana go. The others are **not cells**: blank paper, or the page's grey background showing through.
- The board's outline, between cells and non-cells, is drawn thick.
- Lines between two neighbouring cells are thin.
- Below the board is the **word list**, grouped by length (3文字, 4文字, …).
  - Each word is printed in katakana or hiragana, sometimes with a parenthesised hint after it, e.g. `アイコ (トマト)`. The hint is not placed on the board.
- Some boards mark a few cells with a double frame and a letter (board 2's A–F), for a separate prize question. They don't affect the rules.

A **slot** is a maximal straight run of 2 or more cells, across (left → right) or down (top → bottom). Every word goes in exactly one slot.

### Canonical JSON structure

A small example: サクラ across row 0, and ラッパ down column 2, sharing the ラ.

```json
{
  "cells": [
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1]
  ],
  "words": [
    { "word": "サクラ", "hint": "桜" },
    { "word": "ラッパ" }
  ],
  "marks": [
    { "r": 2, "c": 2, "label": "A" }
  ]
}
```

- `cells`: `rows x cols` integers. `1` = a cell, `0` = not a cell.
- `words`: the word list in print order. `word` is the kana as printed, small kana included (ッ, ゃ, ァ, …). `hint` (optional) is the parenthesised text, shown to the player but never placed. The same word may appear twice; each copy fills its own slot.
- `marks` (optional): double-framed cells, each with its `label` drawn in the cell's corner. Display only.

A board is well formed when its slots and words match: the number of slots of each length equals the number of words of that length. The editor marks a mismatch as a format problem.

Small kana are written full-size on the board (ッ → ツ, ゃ → や, ァ → ア, ヵ → カ, ゎ → わ). Words and letters are compared after this normalisation. Long-vowel marks (ー) and voiced kana (ガ, ヴ, パ) stay as they are.

### Sample images

- [skeleton-puzzle-board-1.jpg](skeleton-puzzle-board-1.jpg): 野菜の品種スケルトン, a large katakana board. The word list has hints and runs from 3 to 11 letters. A thumb covers part of the right edge.
- [skeleton-puzzle-board-2.jpg](skeleton-puzzle-board-2.jpg): a small katakana board, with double-framed cells A–F and the page's grey disc behind the board.
- [skeleton-puzzle-board-3.jpg](skeleton-puzzle-board-3.jpg): 和菓子スケルトン, a large hiragana board, with kanji hints in parentheses. The grey disc shows through some non-cell areas.

## Answer structure description

The words the player has placed, each with its slot.

### Canonical JSON structure

The answer to the example above:

```json
{
  "placements": [
    { "word": 0, "r": 0, "c": 0, "dir": "across" },
    { "word": 1, "r": 0, "c": 2, "dir": "down" }
  ]
}
```

- `word`: the index into the canon's `words`.
- `r`, `c`: the slot's first cell.
- `dir`: `"across"` or `"down"`.
- Each word index and each slot appears at most once.

## Rules

1. Place every word of the list on the board, one kana per cell, reading left → right or top → bottom.
2. Each slot holds exactly one word of its length, and each word fills exactly one slot.
3. Where an across slot and a down slot cross, both words have the same kana in the shared cell.
4. Small kana are written as full-size kana.

### Success finishing criteria

- Every word is placed, so every slot is filled.
- At every crossing cell, the across and down words agree after small-kana normalisation.

The puzzle intends one solution, but any placement meeting these rules counts as solved.

## Puzzle Player

### Interactions

- **Select a slot:** tap a cell to select a slot through it. A cell in both an across and a down slot selects across first; tapping it again switches to down.
  - The selected slot is highlighted.
- **Place a word:** the picker lists the words that could go in the selected slot. A word is listed when:
  - its length matches the slot;
  - it is still unused;
  - it agrees with every kana already in the slot from crossing words.

  Tapping a word places it, and its kana fill the slot. A placement never clashes with a crossing word.
- **Clear:** when the selected slot holds a word, the picker shows a **Clear** action that removes that word. Kana in crossing cells that belong to crossing words stay.
- Undo/Redo like the other boards.
- Appearance:
  - The board is drawn like the print: white cells with thin lines between them, a thick outline around the cells, and nothing in non-cells.
  - Kana are drawn full-size, centred in each cell, in black.
  - Double-framed marks show an inner frame and their label in the corner.
  - The **word list** sits below the board (beside it on wide screens), grouped by length like the print (3文字, 4文字, …). Each word is followed by its hint in small grey text. Placed words are struck through.
  - There is no Errors-mode colouring: placements can't clash, so there is nothing to mark red.

- Web rules live in `skeletonPuzzleRules.ts` (`findSlots`, `candidates`, `boardGrid`, `isSolved`, `formatProblems`).
- Android: `SkeletonRules` in `SkeletonPuzzleEngine.kt` ports `skeletonPuzzleRules.ts`, with the same slot order and `p:<slot>` keys.
  - `SkeletonPuzzleBoard` draws the board in a `ZoomableBoard`. Below it sit the picker chips (and Clear) and the grouped word list.
  - Each pick goes through `putUserValues` as one atomic change, which is also one undo step.
  - Authoring is `SkeletonPuzzleEditor` on the canon itself (`SkeletonRules.Board`). Tap a square to make it a cell or not, or to add or remove its mark. Words go in a text field, one per line as `word (hint)`. Rows and columns can be deleted or added.
  - Format problems block saving through `BoardDraft.formatProblems`.

### Progress calculation

`(cells holding a kana / all cells) * 100`. A cell holds a kana when at least one placed word covers it. A board with no cells reads 0.

## Puzzle Editor

### Interactions

- **Cells:** click a lattice square to toggle cell ↔ not a cell. Rows/Cols inputs resize the lattice, keeping squares that still fit.
- **Words:** a text area with one word per line. The word comes first, then an optional hint in parentheses, as printed: `アイコ (トマト)`. Full-width or half-width parentheses both work.
- **Marks:** right-click a cell to add a double-frame mark; the labels go A, B, C, … in the order the marks were added. Right-clicking a marked cell removes its mark.
- The editor shows every slot's length in a faint corner number, so slot/word mismatches are easy to find.
- **Format problems** block creating or saving, matching `semanticChecks` in the API:
  - slots and words don't match by length, e.g. "3 slots of length 5 but 4 words of 5 letters";
  - a word under 2 letters;
  - a word containing something other than kana and ー;
  - a mark on a square that isn't a cell.
- **Overridable misread warning:** a cell in no slot (an isolated single cell).
- The JSON textarea is the source of truth, synced both ways.

## Puzzle Parser

Implemented in `parsers/src/puzzle_parsers/skeleton_puzzle/`. Lines are **solid**: thick on the outline, thin inside. The pages curl: board 1's lines bow about 0.2 cell.

**No global warp.** The board has no rectangular border, and board 1's middle hole leaves three lines in a row too sparse for `flatten_board` to trace. So `rectify_board` / `flatten_board` aren't used. The first version used them: it fell back to the four-corner warp on board 1 and read 5–7 squares wrong. Allowing `flatten.py` a 4-line gap fixed that, but cost the Hitori 17x17 photo two digits. Instead the lattice is built locally, from the board itself:

1. **Regions.** At a fixed 2000 px long side, the page is binarized and only the largest ink component is kept. That's the grid, since every line is joined.
   - The white regions it encloses are single cells, runs of cells, or enclosed non-cell areas.
   - Runs form because faint thin lines often vanish in the binarization, merging neighbours.
   - An image of any size is scaled to 2000 px, so full size and the Android size read the same.
2. **Corners.** Each region is a rectilinear polygon whose vertices sit on lattice corners. The pitch is fitted to the polygon edges, per axis.
3. **Lattice.** Integer coordinates spread out from one corner by rounding each *local* offset to the pitch, shortest hops first, so a bowed page only bends things gradually.
   - A smooth cubic map from pixels to lattice is then fitted to every corner, and each corner is re-rounded through it.
   - That's needed because one badly rounded long edge can shift a whole cluster by a row (board 3 at 1280 px).
   - Corners no region touches are interpolated from their 6 nearest known ones.
4. **Walls.** Each square takes the region at its centre.
   - Squares in one region share a class: nothing visible separates them. Either there's no line (both non-cells) or a thin line too faint to binarize (both cells).
   - Between regions, the line is measured where it really is, with the shared `grid_utils.line_width_across`, then split thin / thick by Otsu.
5. **Cells.** Region labels minimise the walls' disagreement, each wall weighted by how far its width is from the cut:
   - a thin line wants both sides to be cells;
   - a thick line wants them different;
   - a line to the outside wants a cell.
6. **Repair.** Every cell is in a slot, so a lone cell gets the square that joins it to the cell straight beyond filled in. This guards against a lost wall; the samples don't need it.
7. **Word list.** The area below the board goes to Gemini (`recognize_image`) in one call. It returns each word as printed, small kana included, with its parenthesised hint.
   - The word list is free text, not cell clues, so EasyOCR and `_OCR_TYPES` don't apply.
   - The editor's slot/word check catches a dropped or merged word.
8. **Marks.** Not read. The admin adds the double-framed cells in the editor.

**Accuracy.**
- **Canons:** `skeleton-puzzle-board-{1,2,3}.canon.json` were checked by matching the slot counts against the printed word list, length by length.
- **Cell masks:** all three boards parse exactly at full size, 2000, 1600, 1280 and 1080 px. At 800 px they are 1–4 squares off.
- **Words:** Gemini read all three lists with every word and the right lengths. On board 1, ニシユタカ came back as ニシュタカ, which writes the same on the board.
- `tests/test_skeleton_puzzle_parser.py` pins the masks at full size, 2000 and 1080 px, with the word reads stubbed.
- The parser validates `cells` (rectangular, 0/1), the words (kana and ー, at least 2 letters) and the slot/word counts by length.

# Misc

## Coordinate convention

Canon `cells[row][col]` is row-major, with (0, 0) the top-left lattice square.
- Slots are numbered in a fixed order from the canon alone: every across slot in reading order (row by row, left to right by starting cell), then every down slot in the same order.
- Player-entered values are keyed `"p:<slot>"`, and the value is the placed word's index + 1, for example `"p:3": 5`. So userValues stay numbers, as every board's do.
- The persisted answer is `{placements: [...]}` as above.
