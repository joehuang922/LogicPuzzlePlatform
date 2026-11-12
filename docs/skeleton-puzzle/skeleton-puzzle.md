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

Implemented in `parsers/src/puzzle_parsers/skeleton_puzzle/`. Lines are **solid**: thick on the outline, thin inside.

1. **Board.** All of a board's grid lines are joined, so the board is the largest connected ink component.
   - Only that component goes to `rectify_board`, as `border_image`, with its rotated bounding box drawn round it as a frame.
   - With the ragged outline alone, the border finder took an inner rectangle on board 1 and the page's decorative frame line on board 2.
   - `rectify_board` flattens the board as it does every board.
2. **Lattice.** `find_grid_lines` on the flattened board.
3. **Walls.** The shared `grid_utils.classify_border_lines` reads every wall, the outer edges included, as no line, thin or thick.
   - It samples walls as `classify_border_thickness` does, but a sample point that sees no ruling-width run counts against the wall instead of being skipped.
   - That matters next to a non-cell: there the end points catch the crossing outline, which alone used to read as a line.
   - Runs over 0.2 cell wide are shading (the grey disc behind boards 2 and 3), not lines.
4. **Cells.** Squares joined by a non-thick wall share a class, so they form regions.
   - Each region votes from its own walls: thin inside means cells, no line inside means non-cells, and a lined outer edge means cells.
   - A region with no vote takes the opposite of its thick-walled neighbours.
   - A local pass then lets each square follow its four walls.
   - Voting per region keeps a misread local. One parity flood from a corner flipped whole bands of board 1.
5. **Repair.** Every cell is in a slot, so a lone cell gets the square that joins it to the cell straight beyond filled in, unless a thick wall is in the way.
6. **Word list.** The area below the board goes to Gemini (`recognize_image`) in one call. It returns each word as printed, small kana included, with its parenthesised hint.
   - The word list is free text, not cell clues, so EasyOCR and `_OCR_TYPES` don't apply.
   - The editor's slot/word check catches a dropped or merged word.
7. **Marks.** Not read. The admin adds the double-framed cells in the editor.

**Accuracy.** The canons (`skeleton-puzzle-board-{1,2,3}.canon.json`) were checked by matching the slot counts against the printed word list, length by length.
- **Boards 2 and 3:** parse exactly at full size and 2000 px.
- **Board 1:** a washed-out photo of a curled page.
  - Its thin lines are faint, and flattening falls back to the plain warp: the hole in its middle leaves three vertical lines in a row too sparse to trace.
  - It reads 5 squares wrong at full size and 7 at 2000 px, out of 400.
  - Allowing a 4-line gap in `flatten.py` cut that to 1, but on the Hitori 17x17 photo it lost two digits, so the change was dropped.
- **Below 2000 px:** at 1080 px the thin lines are 1–2 px and every board degrades.
- **Words:** Gemini read all three lists with every word and the right lengths. On board 1, ニシユタカ came back as ニシュタカ, which writes the same on the board.
- `tests/test_skeleton_puzzle_parser.py` pins the masks, board 1's known misreads included, with the word reads stubbed.
- The parser validates `cells` (rectangular, 0/1), the words (kana and ー, at least 2 letters) and the slot/word counts by length.

# Misc

## Coordinate convention

Canon `cells[row][col]` is row-major, with (0, 0) the top-left lattice square.
- Slots are numbered in a fixed order from the canon alone: every across slot in reading order (row by row, left to right by starting cell), then every down slot in the same order.
- Player-entered values are keyed `"p:<slot>"`, and the value is the placed word's index + 1, for example `"p:3": 5`. So userValues stay numbers, as every board's do.
- The persisted answer is `{placements: [...]}` as above.
