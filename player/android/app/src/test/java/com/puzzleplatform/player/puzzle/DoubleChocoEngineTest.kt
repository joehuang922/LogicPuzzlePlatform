package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DoubleChocoEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "dc1",
        puzzleType = 4,
        puzzleTypeName = "double-choco",
        puzzleTypeJpLabel = "ダブルチョコ",
        difficulty = 1,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 2x4 board, two 2x2 rooms (W = white, G = gray, clue 2 on (0,0)):
    //   W2 G | W W
    //   W  G | G G
    private val canon2x4 = """
        {"cells":[
          [[0,2],[1,0],[0,0],[0,0]],
          [[0,0],[1,0],[1,0],[1,0]]
        ]}
    """.trimIndent()

    private val solved = mapOf("v:0,1" to 1, "v:1,1" to 1)

    // -- parseBoard ---------------------------------------------------------

    @Test
    fun parseBoard_readsColorsAndClues() {
        val board = DoubleChocoEngine.parseBoard(puzzle(canon2x4))
        assertEquals(2, board.rows)
        assertEquals(4, board.cols)
        assertEquals(DoubleChocoEngine.Cell(gray = false, number = 2), board.cells[0][0])
        assertEquals(DoubleChocoEngine.Cell(gray = true, number = 0), board.cells[1][3])
    }

    @Test
    fun parseBoard_raggedCanonIsEmpty() {
        val board = DoubleChocoEngine.parseBoard(puzzle("""{"cells":[[[0,0],[1,0]],[[0,0]]]}"""))
        assertEquals(0, board.rows)
    }

    // -- extractAnswer / restoreUserValues ----------------------------------

    private fun JsonObject.grid(kind: String): List<List<Int>> =
        this["grids"]!!.jsonObject[kind]!!.jsonArray.map { row -> row.jsonArray.map { it.jsonPrimitive.int } }

    @Test
    fun extractAnswer_buildsBorderGrids() {
        val answer = DoubleChocoEngine.extractAnswer(puzzle(canon2x4), solved + ("h:0,3" to 1))
        assertEquals(listOf(listOf(0, 0, 0, 1)), answer.grid("h"))
        assertEquals(listOf(listOf(0, 1, 0), listOf(0, 1, 0)), answer.grid("v"))
    }

    @Test
    fun extractAnswer_ignoresOutOfRangeAndZeroKeys() {
        val answer = DoubleChocoEngine.extractAnswer(puzzle(canon2x4), mapOf("h:1,0" to 1, "v:0,3" to 1, "v:0,0" to 0))
        assertEquals(listOf(listOf(0, 0, 0, 0)), answer.grid("h"))
        assertEquals(listOf(listOf(0, 0, 0), listOf(0, 0, 0)), answer.grid("v"))
    }

    @Test
    fun restoreUserValues_roundTrips() {
        val p = puzzle(canon2x4)
        assertEquals(solved, DoubleChocoEngine.restoreUserValues(p, DoubleChocoEngine.extractAnswer(p, solved)))
    }

    @Test
    fun restoreUserValues_readsWebAnswer() {
        val web = Json.parseToJsonElement("""{"grids":{"h":[[0,0,0,0]],"v":[[0,1,0],[0,1,0]]}}""") as JsonObject
        assertEquals(solved, DoubleChocoEngine.restoreUserValues(puzzle(canon2x4), web))
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun progress_wholeBoardBalancedCountsFully() {
        // No borders: one room of 4 white + 4 gray is already balanced (web parity).
        assertEquals(100.0, DoubleChocoEngine.computeProgress(puzzle(canon2x4), emptyMap()), 1e-9)
    }

    @Test
    fun progress_countsOnlyBalancedRooms() {
        // Split off (0,0) alone: it's unbalanced, and so is the remaining 7-cell room.
        val values = mapOf("v:0,0" to 1, "h:0,0" to 1)
        assertEquals(0.0, DoubleChocoEngine.computeProgress(puzzle(canon2x4), values), 1e-9)
        // Left 2x2 room balanced (4 cells); right room still the balanced 2x2.
        assertEquals(100.0, DoubleChocoEngine.computeProgress(puzzle(canon2x4), solved), 1e-9)
        // Cut the right room in half horizontally: (0,2),(0,3) all white, (1,2),(1,3) all gray.
        val split = solved + ("h:0,2" to 1) + ("h:0,3" to 1)
        assertEquals(50.0, DoubleChocoEngine.computeProgress(puzzle(canon2x4), split), 1e-9)
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_solved() {
        assertTrue(DoubleChocoEngine.isComplete(puzzle(canon2x4), solved))
    }

    @Test
    fun isComplete_requiresAtLeastOneBorder() {
        assertFalse(DoubleChocoEngine.isComplete(puzzle(canon2x4), emptyMap()))
    }

    @Test
    fun isComplete_rejectsRedundantBorder() {
        // h:0,0 sits inside the left room (both sides still connect around it).
        assertFalse(DoubleChocoEngine.isComplete(puzzle(canon2x4), solved + ("h:0,0" to 1)))
    }

    @Test
    fun isComplete_rejectsWrongClue() {
        val wrong = canon2x4.replace("[[0,2],", "[[0,3],")
        assertFalse(DoubleChocoEngine.isComplete(puzzle(wrong), solved))
    }

    @Test
    fun isComplete_rejectsUnbalancedRooms() {
        // Single column split: the left column is all white.
        assertFalse(DoubleChocoEngine.isComplete(puzzle(canon2x4), mapOf("v:0,0" to 1, "v:1,0" to 1)))
    }

    @Test
    fun isComplete_rejectsShapeMismatch() {
        // 3x6: a 3x4 room whose 6 whites (a U) and 6 grays are each connected but differ in
        // shape, next to a valid 3x2 room of vertical white/gray triominoes.
        //   W W W W | W G
        //   W G G W | W G
        //   G G G G | W G
        val canon = """
            {"cells":[
              [[0,0],[0,0],[0,0],[0,0],[0,0],[1,0]],
              [[0,0],[1,0],[1,0],[0,0],[0,0],[1,0]],
              [[1,0],[1,0],[1,0],[1,0],[0,0],[1,0]]
            ]}
        """.trimIndent()
        val borders = mapOf("v:0,3" to 1, "v:1,3" to 1, "v:2,3" to 1)
        assertFalse(DoubleChocoEngine.isComplete(puzzle(canon), borders))
        // Same borders, but the left room recolored to two matching 3x2 halves: valid.
        val matching = canon
            .replace("[[0,0],[0,0],[0,0],[0,0],[0,0],[1,0]]", "[[0,0],[0,0],[1,0],[1,0],[0,0],[1,0]]")
            .replace("[[0,0],[1,0],[1,0],[0,0],[0,0],[1,0]]", "[[0,0],[0,0],[1,0],[1,0],[0,0],[1,0]]")
            .replace("[[1,0],[1,0],[1,0],[1,0],[0,0],[1,0]]", "[[0,0],[0,0],[1,0],[1,0],[0,0],[1,0]]")
        assertTrue(DoubleChocoEngine.isComplete(puzzle(matching), borders))
    }
}
