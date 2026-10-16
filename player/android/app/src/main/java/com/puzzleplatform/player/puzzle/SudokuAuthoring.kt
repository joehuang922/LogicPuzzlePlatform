package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Pure mapping helpers for authoring a sudoku question in the Admin screen.
 *
 * The review step reuses the player's [com.puzzleplatform.player.ui.board.SudokuBoard]
 * verbatim. To make *every* cell editable (so a mis-OCR'd given can be fixed) the
 * board is handed a synthetic [blankPuzzle] whose canon hints are all zero — nothing
 * is locked — and the parsed givens ride in as the player-input `userValues` map
 * ("col,row" -> digit), exactly the shape the board already renders and validates.
 *
 * Kept free of Android/Compose types so the hints↔userValues round-trip is unit-testable.
 */
object SudokuAuthoring {

    const val SIZE = 9
    const val PUZZLE_TYPE = 1

    /**
     * A 9×9 puzzle with an all-zero hint grid: handed to the review board so no cell
     * is locked and the whole grid is editable. The parsed digits are supplied
     * separately via [userValuesFromCanon].
     */
    fun blankPuzzle(): Puzzle = Puzzle(
        id = "admin-sudoku-draft",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "sudoku",
        puzzleTypeJpLabel = "数独",
        difficulty = 1,
        width = SIZE,
        height = SIZE,
        canonRepr = JsonObject(mapOf("hints" to zeroGrid())),
    )

    /**
     * Seed a `userValues` map ("col,row" -> digit) from a parser canon `{ hints }`
     * grid, keeping only the positive givens. Tolerates ragged/missing rows (0).
     */
    fun userValuesFromCanon(canon: JsonObject): Map<String, Int> {
        val grid = SudokuEngine.parseHints(blankPuzzle().copy(canonRepr = canon))
        val result = mutableMapOf<String, Int>()
        for (row in 0 until SIZE) {
            for (col in 0 until SIZE) {
                val v = grid[row][col]
                if (v in 1..9) result["$col,$row"] = v
            }
        }
        return result
    }

    /**
     * Rebuild the canon `{ hints: Int[9][9] }` JSON from an edited `userValues` map,
     * ready to POST as a new puzzle's canonRepr. Empty / out-of-range cells become 0.
     */
    fun canonFromUserValues(userValues: Map<String, Int>): JsonObject {
        val rows = buildList {
            for (row in 0 until SIZE) {
                add(JsonArray(buildList {
                    for (col in 0 until SIZE) {
                        val v = userValues["$col,$row"] ?: 0
                        add(JsonPrimitive(if (v in 1..9) v else 0))
                    }
                }))
            }
        }
        return JsonObject(mapOf("hints" to JsonArray(rows)))
    }

    private fun zeroGrid(): JsonArray =
        JsonArray(List(SIZE) { JsonArray(List(SIZE) { JsonPrimitive(0) }) })
}
