package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShikakuEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "s1",
        puzzleType = 22,
        puzzleTypeName = "shikaku",
        puzzleTypeJpLabel = "四角に切れ",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 3x3 board with a unique tiling (brute-force-verified):
    //   3 . .
    //   6 . .
    //   . . .
    // The 3-clue's rectangle must be the whole top row — a vertical 3x1 down col 0 would
    // swallow the 6-clue — which forces the 6-clue's rectangle to be rows 1..2 (a 3x2).
    private val canon3x3 = """{"cells":[[3,0,0],[6,0,0],[0,0,0]]}"""

    // The verified solution, keyed "rect:r,c" -> encodeWH(w,h) (web convention).
    private val solved = mapOf(
        "rect:0,0" to ShikakuEngine.encodeWH(3, 1), // top row, area 3
        "rect:1,0" to ShikakuEngine.encodeWH(3, 2), // rows 1..2, area 6
    )

    /** Read the answer's rects as a set of (r,c,w,h) so order is irrelevant. */
    private fun JsonObject.rectSet(): Set<List<Int>> =
        (this["rects"] as JsonArray).map { el ->
            val o = el.jsonObject
            listOf(o["r"]!!.jsonPrimitive.int, o["c"]!!.jsonPrimitive.int, o["w"]!!.jsonPrimitive.int, o["h"]!!.jsonPrimitive.int)
        }.toSet()

    // -- parseCells ---------------------------------------------------------

    @Test
    fun parseCells_readsClueGrid() {
        val cells = ShikakuEngine.parseCells(puzzle(canon3x3))
        assertEquals(3, cells.size)
        assertEquals(3, cells[0][0])
        assertEquals(6, cells[1][0])
        assertEquals(0, cells[2][2])
    }

    // -- extractAnswer ------------------------------------------------------

    @Test
    fun extractAnswer_buildsRectsFromUserValues() {
        val answer = ShikakuEngine.extractAnswer(puzzle(canon3x3), solved)
        assertEquals(
            setOf(listOf(0, 0, 3, 1), listOf(1, 0, 3, 2)),
            answer.rectSet(),
        )
    }

    @Test
    fun extractAnswer_dropsOutOfBoundsRects() {
        // A rect that runs off the grid (c+w > cols) must not survive extraction.
        val values = solved + ("rect:0,2" to ShikakuEngine.encodeWH(3, 1))
        assertEquals(
            setOf(listOf(0, 0, 3, 1), listOf(1, 0, 3, 2)),
            ShikakuEngine.extractAnswer(puzzle(canon3x3), values).rectSet(),
        )
    }

    // -- restoreUserValues (round-trip) ------------------------------------

    @Test
    fun restore_roundTripsThroughExtract() {
        val p = puzzle(canon3x3)
        assertEquals(solved, ShikakuEngine.restoreUserValues(p, ShikakuEngine.extractAnswer(p, solved)))
    }

    @Test
    fun restore_dropsOutOfBoundsRects() {
        val p = puzzle(canon3x3)
        val answer = Json.parseToJsonElement(
            """{"rects":[{"r":0,"c":0,"w":3,"h":1},{"r":2,"c":2,"w":5,"h":5}]}""",
        ) as JsonObject
        assertEquals(mapOf("rect:0,0" to ShikakuEngine.encodeWH(3, 1)), ShikakuEngine.restoreUserValues(p, answer))
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_zeroForEmptyBoard() {
        assertEquals(0.0, ShikakuEngine.computeProgress(puzzle(canon3x3), emptyMap()), 0.0)
    }

    @Test
    fun computeProgress_hundredWhenFullyTiled() {
        assertEquals(100.0, ShikakuEngine.computeProgress(puzzle(canon3x3), solved), 1e-9)
    }

    @Test
    fun computeProgress_countsCoveredCells() {
        // Just the top-row 3x1 rect covers 3 of 9 cells.
        val values = mapOf("rect:0,0" to ShikakuEngine.encodeWH(3, 1))
        assertEquals(3.0 / 9.0 * 100.0, ShikakuEngine.computeProgress(puzzle(canon3x3), values), 1e-9)
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForValidSolution() {
        assertTrue(ShikakuEngine.isComplete(puzzle(canon3x3), solved))
    }

    @Test
    fun isComplete_falseForEmptyBoard() {
        assertFalse(ShikakuEngine.isComplete(puzzle(canon3x3), emptyMap()))
    }

    @Test
    fun isComplete_falseWhenACellUncovered() {
        // Dropping the 6-rect leaves rows 1..2 uncovered.
        assertFalse(ShikakuEngine.isComplete(puzzle(canon3x3), solved - "rect:1,0"))
    }

    @Test
    fun isComplete_falseWhenRectHasTwoClues() {
        // One 3x3 rect covers every cell exactly once but swallows both clues.
        val values = mapOf("rect:0,0" to ShikakuEngine.encodeWH(3, 3))
        assertFalse(ShikakuEngine.isComplete(puzzle(canon3x3), values))
    }

    @Test
    fun isComplete_falseWhenAreaDoesNotMatchClue() {
        // 1x4 strip, clues 2 at col 0 and col 2 (sum 4 = area). This tiling covers every
        // cell exactly once with one clue per rect, but neither area matches its clue.
        val p = puzzle("""{"cells":[[2,0,2,0]]}""")
        val values = mapOf(
            "rect:0,0" to ShikakuEngine.encodeWH(1, 1), // clue 2, area 1
            "rect:0,1" to ShikakuEngine.encodeWH(3, 1), // clue 2, area 3
        )
        assertFalse(ShikakuEngine.isComplete(p, values))
    }
}
