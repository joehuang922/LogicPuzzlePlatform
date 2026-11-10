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
 * The board is N x N with room_width x room_height rooms (default 3x3, a 9x9; up to
 * 30x30): the room size comes from the parsed canon and goes back out with the edits.
 *
 * Kept free of Android/Compose types so the hints↔userValues round-trip is unit-testable.
 */
object SudokuAuthoring {

    /** Side of the standard board. */
    const val SIZE = 9
    const val PUZZLE_TYPE = 1

    /** The room size a canon declares (default 3x3). */
    fun dims(canon: JsonObject): SudokuEngine.Dims = SudokuEngine.dims(blankPuzzle().copy(canonRepr = canon))

    /**
     * A puzzle with an all-zero hint grid at [dims]: handed to the review board so no
     * cell is locked and the whole grid is editable. The parsed digits are supplied
     * separately via [userValuesFromCanon].
     */
    fun blankPuzzle(dims: SudokuEngine.Dims = SudokuEngine.Dims()): Puzzle = Puzzle(
        id = "admin-sudoku-draft-${dims.roomWidth}x${dims.roomHeight}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "sudoku",
        puzzleTypeJpLabel = "数独",
        difficulty = 1,
        width = dims.size,
        height = dims.size,
        canonRepr = JsonObject(roomFields(dims) + ("hints" to zeroGrid(dims.size))),
    )

    /**
     * Seed a `userValues` map ("col,row" -> digit) from a parser canon `{ hints }`
     * grid, keeping only the givens 1..N. Tolerates ragged/missing rows (0).
     */
    fun userValuesFromCanon(canon: JsonObject): Map<String, Int> {
        val n = dims(canon).size
        val grid = SudokuEngine.parseHints(blankPuzzle(dims(canon)).copy(canonRepr = canon))
        val result = mutableMapOf<String, Int>()
        for (row in 0 until n) {
            for (col in 0 until n) {
                val v = grid[row][col]
                if (v in 1..n) result["$col,$row"] = v
            }
        }
        return result
    }

    /**
     * Rebuild the canon `{ room_width?, room_height?, hints: Int[N][N] }` JSON from an
     * edited `userValues` map, ready to POST as a new puzzle's canonRepr. Empty /
     * out-of-range cells become 0. A 9x9 leaves the room size out, as before sizes.
     */
    fun canonFromUserValues(userValues: Map<String, Int>, dims: SudokuEngine.Dims = SudokuEngine.Dims()): JsonObject {
        val n = dims.size
        val rows = buildList {
            for (row in 0 until n) {
                add(JsonArray(buildList {
                    for (col in 0 until n) {
                        val v = userValues["$col,$row"] ?: 0
                        add(JsonPrimitive(if (v in 1..n) v else 0))
                    }
                }))
            }
        }
        return JsonObject(roomFields(dims) + ("hints" to JsonArray(rows)))
    }

    private fun roomFields(dims: SudokuEngine.Dims): Map<String, JsonPrimitive> =
        if (dims == SudokuEngine.Dims()) emptyMap()
        else mapOf("room_width" to JsonPrimitive(dims.roomWidth), "room_height" to JsonPrimitive(dims.roomHeight))

    private fun zeroGrid(n: Int): JsonArray =
        JsonArray(List(n) { JsonArray(List(n) { JsonPrimitive(0) }) })
}
