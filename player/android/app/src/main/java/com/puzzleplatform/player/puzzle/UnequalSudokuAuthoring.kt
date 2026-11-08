package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.UnequalSudokuEngine.Gap
import com.puzzleplatform.player.puzzle.UnequalSudokuEngine.SIZE
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * An unequal sudoku being reviewed in the Admin screen: the givens as "col,row" ->
 * digit (the map the player board renders, so every cell stays editable on an all-zero
 * preview canon) and the signs, right 9x8 and down 8x9 (0 none, 1 this cell smaller,
 * 2 this cell larger).
 */
data class UnequalSudokuDraft(
    val givens: Map<String, Int> = emptyMap(),
    val right: List<List<Int>> = List(SIZE) { List(SIZE - 1) { 0 } },
    val down: List<List<Int>> = List(SIZE - 1) { List(SIZE) { 0 } },
)

/**
 * Pure mapping and checks for authoring unequal sudoku (type 29), the Android analog of
 * the web UnequalSudokuEditor. The board is always 9x9, so nothing can make it
 * unrepresentable: there are no format problems, only overridable misread warnings
 * (givens that repeat or break a sign, gaps with no sign).
 */
object UnequalSudokuAuthoring {
    const val PUZZLE_TYPE = 29

    fun draftFromCanon(canon: JsonObject): UnequalSudokuDraft {
        val hints = UnequalSudokuEngine.parseGrid(canon["hints"], SIZE, SIZE)
        val signs = UnequalSudokuEngine.parseSigns(canon)
        val givens = buildMap {
            for (r in 0 until SIZE) for (c in 0 until SIZE) {
                if (hints[r][c] in 1..9) put("$c,$r", hints[r][c])
            }
        }
        return UnequalSudokuDraft(
            givens = givens,
            right = signs.right.map { row -> row.map { if (it in 0..2) it else 0 } },
            down = signs.down.map { row -> row.map { if (it in 0..2) it else 0 } },
        )
    }

    fun canonFromDraft(draft: UnequalSudokuDraft): JsonObject = JsonObject(
        mapOf(
            "hints" to grid(List(SIZE) { r -> List(SIZE) { c -> draft.givens["$c,$r"]?.takeIf { it in 1..9 } ?: 0 } }),
            "right" to grid(draft.right),
            "down" to grid(draft.down),
        ),
    )

    /** The board to review on: the draft's signs with all-zero hints, so no cell is locked. */
    fun previewPuzzle(draft: UnequalSudokuDraft): Puzzle = Puzzle(
        id = "admin-unequal-sudoku-draft",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "unequal-sudoku",
        puzzleTypeJpLabel = "不等号ナンプレ",
        difficulty = 1,
        width = SIZE,
        height = SIZE,
        canonRepr = canonFromDraft(draft.copy(givens = emptyMap())),
    )

    /** Cycle a gap's sign: none -> < (∧) -> > (∨) -> none. */
    fun cycleSign(draft: UnequalSudokuDraft, gap: Gap): UnequalSudokuDraft {
        fun cycled(rows: List<List<Int>>) = rows.mapIndexed { r, row ->
            if (r != gap.row) row else row.mapIndexed { c, v -> if (c == gap.col) (v + 1) % 3 else v }
        }
        return if (gap.horizontal) draft.copy(right = cycled(draft.right)) else draft.copy(down = cycled(draft.down))
    }

    /** Set (1-9) or clear (null) the given at "col,row". */
    fun setGiven(draft: UnequalSudokuDraft, cell: String, digit: Int?): UnequalSudokuDraft =
        draft.copy(givens = if (digit != null && digit in 1..9) draft.givens + (cell to digit) else draft.givens - cell)

    /** Overridable misread warnings: the list that turns a batch tile red. */
    fun problems(draft: UnequalSudokuDraft): List<String> {
        val puzzle = previewPuzzle(draft)
        val repeats = SudokuEngine.findConflicts(puzzle, draft.givens)
        val broken = UnequalSudokuEngine.findBrokenSigns(puzzle, draft.givens)
        val blank = draft.right.sumOf { row -> row.count { it == 0 } } + draft.down.sumOf { row -> row.count { it == 0 } }
        return buildList {
            if (repeats.isNotEmpty()) {
                add("${repeats.size} givens repeat a digit in a row, column or box (red on the board).")
            }
            if (broken.isNotEmpty()) {
                add("${broken.size} signs are broken by the givens (red on the board).")
            }
            if (blank > 0) {
                add("$blank gaps have no sign; a printed board has one in every gap.")
            }
        }
    }

    private fun grid(rows: List<List<Int>>): JsonArray =
        JsonArray(rows.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })
}
