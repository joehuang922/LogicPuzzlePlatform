package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Sudoku above 9x9: the three magazine boards in docs/sudoku (16x16 with 4x4 rooms,
 * 25x25 with 5x5, 30x30 with rooms 6 wide and 5 tall), as the web and solver tests
 * use them (player/solver/src/plugins/sudoku/sizes.test.ts).
 */
class SudokuSizesTest {

    /** A sample's canon from docs/sudoku (tests run from the app module). */
    private fun sample(size: String): Puzzle = puzzle(
        Json.parseToJsonElement(File("../../../docs/sudoku/board-sudoku-$size.canon.json").readText()).jsonObject,
    )

    private fun puzzle(canon: JsonObject): Puzzle = Puzzle(
        id = "big",
        puzzleType = 1,
        puzzleTypeName = "sudoku",
        puzzleTypeJpLabel = "数独",
        difficulty = 3,
        canonRepr = canon,
    )

    private fun emptyCanon(roomWidth: Int, roomHeight: Int): JsonObject {
        val n = roomWidth * roomHeight
        return JsonObject(
            mapOf(
                "room_width" to JsonPrimitive(roomWidth),
                "room_height" to JsonPrimitive(roomHeight),
                "hints" to JsonArray(List(n) { JsonArray(List(n) { JsonPrimitive(0) }) }),
            ),
        )
    }

    @Test
    fun dims_defaultTo3x3() {
        assertEquals(SudokuEngine.Dims(3, 3), SudokuEngine.dims(puzzle(JsonObject(mapOf("hints" to JsonArray(emptyList()))))))
        assertEquals(SudokuEngine.Dims(6, 5), SudokuEngine.dims(sample("30x30")))
        assertEquals(30, SudokuEngine.dims(sample("30x30")).size)
        assertEquals(30, SudokuEngine.parseHints(sample("30x30")).size)
    }

    @Test
    fun hintLadder_solvesEachBigSampleFromEmpty() {
        for (size in listOf("16x16", "25x25", "30x30")) {
            val p = sample(size)
            val n = SudokuEngine.dims(p).size
            val values = mutableMapOf<String, Int>()
            val empties = SudokuEngine.parseHints(p).sumOf { row -> row.count { it == 0 } }
            repeat(empties) {
                val placement = SudokuHinter.nextPlacement(p, values)?.placement
                assertNotNull("$size: the hint ladder ran dry", placement)
                values[SudokuHinter.cellKey(placement!!.cell, n)] = placement.value
            }
            assertTrue("$size: solved with no conflicts", SudokuEngine.isComplete(p, values))
        }
    }

    @Test
    fun conflicts_useRectangularRooms() {
        val p = puzzle(emptyCanon(6, 5))
        // (0,0) and (5,4) share the top-left 6-wide, 5-tall room; (6,4) is in the next one.
        assertEquals(setOf("0,0", "5,4"), SudokuEngine.findConflicts(p, mapOf("0,0" to 27, "5,4" to 27)))
        assertTrue(SudokuEngine.findConflicts(p, mapOf("0,0" to 27, "6,4" to 27)).isEmpty())
    }

    @Test
    fun answer_roundTripsAt16x16WithNotesUpTo16() {
        val p = puzzle(emptyCanon(4, 4))
        val values = mapOf("15,15" to 16, "n:3,2:16" to 1, "n:3,2:12" to 1, "n:3,2:17" to 1)
        val answer = SudokuEngine.extractAnswer(p, values)
        val hints = answer["hints"]!!.jsonArray
        assertEquals(16, hints.size)
        assertEquals(16, hints[15].jsonArray[15].jsonPrimitive.int)
        assertEquals(listOf(12, 16), answer["notes"]!!.jsonArray[2].jsonArray[3].jsonArray.map { it.jsonPrimitive.int })
        assertEquals(values - "n:3,2:17", SudokuEngine.restoreUserValues(p, answer))
        assertEquals(100.0 / 256, SudokuEngine.computeProgress(p, values), 1e-9)
        assertFalse(SudokuEngine.isComplete(p, values))
    }

    @Test
    fun authoring_keepsTheRoomSize_andA9x9CanonUnchanged() {
        val canon = Json.parseToJsonElement(File("../../../docs/sudoku/board-sudoku-30x30.canon.json").readText()).jsonObject
        val draft = BoardDraft.fromCanon(AuthoringType.SUDOKU, canon)
        assertEquals(SudokuEngine.Dims(6, 5), draft.sudokuDims)
        val back = draft.toCanon(AuthoringType.SUDOKU)
        assertEquals(canon["room_width"], back.canon["room_width"])
        assertEquals(canon["room_height"], back.canon["room_height"])
        assertEquals(canon["hints"], back.canon["hints"])

        val nine = SudokuAuthoring.canonFromUserValues(mapOf("0,0" to 5))
        assertEquals(setOf("hints"), nine.keys)
    }
}
