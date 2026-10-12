package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NumberLinkEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "n1",
        puzzleType = 17,
        puzzleTypeName = "number-link",
        puzzleTypeJpLabel = "ナンバーリンク",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 3x3 board (brute-force-verified solvable):
    //   1 . .
    //   . . .
    //   1 2 2
    // Path for the 1s: (0,0)-(1,0)-(2,0) straight down the left column.
    // Path for the 2s: (2,1)-(1,1)-(0,1)-(0,2)-(1,2)-(2,2), a U covering the rest.
    private val canon3x3 = """{"cells":[[1,0,0],[0,0,0],[1,2,2]]}"""

    // The verified solution, keyed "h:r,c"/"v:r,c" (web convention), every segment = 1.
    private val solved = mapOf(
        "h:0,1" to 1,
        "v:0,0" to 1, "v:0,1" to 1, "v:0,2" to 1,
        "v:1,0" to 1, "v:1,1" to 1, "v:1,2" to 1,
    )

    private fun JsonObject.edgeGrid(which: String): List<List<Int>> =
        ((this["edges"] as JsonObject)[which] as JsonArray).map { row ->
            row.jsonArray.map { it.jsonPrimitive.int }
        }

    // -- parseCells ---------------------------------------------------------

    @Test
    fun parseCells_readsEndpointGrid() {
        val cells = NumberLinkEngine.parseCells(puzzle(canon3x3))
        assertEquals(3, cells.size)
        assertEquals(1, cells[0][0])
        assertEquals(2, cells[2][2])
        assertEquals(0, cells[1][1])
    }

    // -- extractAnswer ------------------------------------------------------

    @Test
    fun extractAnswer_buildsEdgeGridsWithCorrectShape() {
        val answer = NumberLinkEngine.extractAnswer(puzzle(canon3x3), solved)
        val h = answer.edgeGrid("h")
        val v = answer.edgeGrid("v")
        // h: rows x (cols-1) = 3x2; v: (rows-1) x cols = 2x3.
        assertEquals(3, h.size); assertEquals(2, h[0].size)
        assertEquals(2, v.size); assertEquals(3, v[0].size)
        assertEquals(listOf(listOf(0, 1), listOf(0, 0), listOf(0, 0)), h)
        assertEquals(listOf(listOf(1, 1, 1), listOf(1, 1, 1)), v)
    }

    // -- restoreUserValues (round-trip) ------------------------------------

    @Test
    fun restore_roundTripsThroughExtract() {
        val p = puzzle(canon3x3)
        assertEquals(solved, NumberLinkEngine.restoreUserValues(p, NumberLinkEngine.extractAnswer(p, solved)))
    }

    @Test
    fun restore_dropsEmptySegments() {
        val p = puzzle(canon3x3)
        val answer = Json.parseToJsonElement(
            """{"edges":{"h":[[0,0],[0,0],[0,0]],"v":[[1,0,0],[1,0,0]]}}""",
        ) as JsonObject
        assertEquals(mapOf("v:0,0" to 1, "v:1,0" to 1), NumberLinkEngine.restoreUserValues(p, answer))
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_zeroForEmptyBoard() {
        assertEquals(0.0, NumberLinkEngine.computeProgress(puzzle(canon3x3), emptyMap()), 0.0)
    }

    @Test
    fun computeProgress_hundredWhenEveryCellTouched() {
        assertEquals(100.0, NumberLinkEngine.computeProgress(puzzle(canon3x3), solved), 1e-9)
    }

    @Test
    fun computeProgress_countsTouchedCells() {
        // A single vertical segment v:0,0 touches cells (0,0) and (1,0) -> 2 of 9.
        assertEquals(2.0 / 9.0 * 100.0, NumberLinkEngine.computeProgress(puzzle(canon3x3), mapOf("v:0,0" to 1)), 1e-9)
    }

    // -- degreeOf -----------------------------------------------------------

    @Test
    fun degreeOf_countsAdjacentSegments() {
        val cells = NumberLinkEngine.parseCells(puzzle(canon3x3))
        val e = NumberLinkEngine.edges(cells, solved)
        assertEquals(1, NumberLinkEngine.degreeOf(e, 0, 0, 3, 3)) // endpoint, one segment down
        assertEquals(2, NumberLinkEngine.degreeOf(e, 1, 1, 3, 3)) // through cell, two segments
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForValidSolution() {
        assertTrue(NumberLinkEngine.isComplete(puzzle(canon3x3), solved))
    }

    @Test
    fun isComplete_falseForEmptyBoard() {
        assertFalse(NumberLinkEngine.isComplete(puzzle(canon3x3), emptyMap()))
    }

    @Test
    fun isComplete_falseWhenACellIsUnfilled() {
        // Dropping one segment leaves cells with the wrong degree and an unvisited cell.
        assertFalse(NumberLinkEngine.isComplete(puzzle(canon3x3), solved - "v:1,2"))
    }

    @Test
    fun isComplete_falseWhenEndpointHasExtraSegment() {
        // Adding a stray segment at an endpoint gives it degree 2 (should be 1) -> branch.
        assertFalse(NumberLinkEngine.isComplete(puzzle(canon3x3), solved + ("h:0,0" to 1)))
    }

    @Test
    fun isComplete_falseWhenPathsConnectMismatchedNumbers() {
        // 1x4 board: endpoints 1 . . 2. A single straight path would connect 1 to 2
        // (mismatched), so no fill can satisfy it -> never complete.
        val p = puzzle("""{"cells":[[1,0,0,2]]}""")
        val straight = mapOf("h:0,0" to 1, "h:0,1" to 1, "h:0,2" to 1)
        assertFalse(NumberLinkEngine.isComplete(p, straight))
    }
}
