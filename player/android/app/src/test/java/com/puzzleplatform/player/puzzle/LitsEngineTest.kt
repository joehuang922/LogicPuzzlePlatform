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

class LitsEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "l1",
        puzzleType = 15,
        puzzleTypeName = "lits",
        puzzleTypeJpLabel = "LITS",
        difficulty = 3,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 4x4 grid split into two 4x2 regions by a thick vertical border between col 1 and
    // col 2 (v[r][1] = 1 for every row). No horizontal region borders.
    //   rows = h.length + 1 = 4, cols = v[0].length + 1 = 4.
    private val canon4x4 = """{"grids":{
        "h":[[0,0,0,0],[0,0,0,0],[0,0,0,0]],
        "v":[[0,1,0],[0,1,0],[0,1,0],[0,1,0]]
    }}"""

    // The intended solution: an L in the left region and an I in the right region, laid
    // so the whole shaded set is one connected group and no two adjacent pieces share a
    // shape. Keys match the web board ("c:col,row").
    //   Left  L (row,col): (0,0)(1,0)(2,0)(2,1)
    //   Right I (row,col): (0,2)(1,2)(2,2)(3,2)
    private val solved = mapOf(
        "c:0,0" to 1, "c:0,1" to 1, "c:0,2" to 1, "c:1,2" to 1,  // L
        "c:2,0" to 1, "c:2,1" to 1, "c:2,2" to 1, "c:2,3" to 1,  // I
    )

    // -- parseGrids ---------------------------------------------------------

    @Test
    fun parseGrids_derivesDimensions() {
        val grids = LitsEngine.parseGrids(puzzle(canon4x4))
        assertEquals(4, grids.rows)
        assertEquals(4, grids.cols)
    }

    // -- extractAnswer ------------------------------------------------------

    @Test
    fun extractAnswer_buildsShadedGrid() {
        val answer = LitsEngine.extractAnswer(puzzle(canon4x4), solved)
        val shaded = (answer["shaded"] as JsonArray).map { row -> row.jsonArray.map { it.jsonPrimitive.int } }
        assertEquals(4, shaded.size)
        assertEquals(4, shaded[0].size)
        // Left column shaded rows 0,1,2; (2,1) is the L's foot.
        assertEquals(listOf(1, 0, 1, 0), shaded[0]) // row 0: col0 (L) + col2 (I)
        assertEquals(listOf(1, 0, 1, 0), shaded[1]) // row 1
        assertEquals(listOf(1, 1, 1, 0), shaded[2]) // row 2: L foot at col1, I at col2
        assertEquals(listOf(0, 0, 1, 0), shaded[3]) // row 3: only I's tail
    }

    @Test
    fun extractAnswer_persistsMarksSeparately() {
        // A shade and a mark (solver-aid dot) land in different grids.
        val input = mapOf("c:0,0" to 1, "c:3,3" to 2)
        val answer = LitsEngine.extractAnswer(puzzle(canon4x4), input)
        val shaded = (answer["shaded"] as JsonArray).map { r -> r.jsonArray.map { it.jsonPrimitive.int } }
        val marks = (answer["marks"] as JsonArray).map { r -> r.jsonArray.map { it.jsonPrimitive.int } }
        assertEquals(1, shaded[0][0])
        assertEquals(0, marks[0][0])
        assertEquals(1, marks[3][3])
        assertEquals(0, shaded[3][3])
    }

    // -- restoreUserValues (round-trip) ------------------------------------

    @Test
    fun restore_roundTripsThroughExtract() {
        val p = puzzle(canon4x4)
        val answer = LitsEngine.extractAnswer(p, solved)
        assertEquals(solved, LitsEngine.restoreUserValues(p, answer))
    }

    @Test
    fun restore_roundTripsMarks() {
        val p = puzzle(canon4x4)
        val input = mapOf("c:0,0" to 1, "c:1,1" to 2, "c:3,3" to 2)
        assertEquals(input, LitsEngine.restoreUserValues(p, LitsEngine.extractAnswer(p, input)))
    }

    @Test
    fun restore_toleratesWebAnswerWithoutMarks() {
        // A web-saved answer carries only { shaded }; the missing marks grid is a no-op.
        val p = puzzle(canon4x4)
        val webAnswer = Json.parseToJsonElement(
            """{"shaded":[[1,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]}""",
        ) as JsonObject
        assertEquals(mapOf("c:0,0" to 1), LitsEngine.restoreUserValues(p, webAnswer))
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_zeroForEmptyBoard() {
        assertEquals(0.0, LitsEngine.computeProgress(puzzle(canon4x4), emptyMap()), 0.0)
    }

    @Test
    fun computeProgress_halfWhenOneRegionValid() {
        // Only the left L is shaded: 1 of 2 regions holds a valid tetromino.
        val leftOnly = mapOf("c:0,0" to 1, "c:0,1" to 1, "c:0,2" to 1, "c:1,2" to 1)
        assertEquals(50.0, LitsEngine.computeProgress(puzzle(canon4x4), leftOnly), 1e-9)
    }

    @Test
    fun computeProgress_hundredWhenAllRegionsValid() {
        assertEquals(100.0, LitsEngine.computeProgress(puzzle(canon4x4), solved), 1e-9)
    }

    @Test
    fun computeProgress_ignoresMarks() {
        // Marks (state 2) are a solving aid and never count toward a valid tetromino.
        val marksOnly = mapOf("c:0,0" to 2, "c:0,1" to 2, "c:0,2" to 2, "c:1,2" to 2)
        assertEquals(0.0, LitsEngine.computeProgress(puzzle(canon4x4), marksOnly), 0.0)
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForValidSolution() {
        assertTrue(LitsEngine.isComplete(puzzle(canon4x4), solved))
    }

    @Test
    fun isComplete_marksDoNotAffectAValidSolution() {
        // Sprinkling solver-aid dots on empty cells leaves the solution valid.
        val withMarks = solved + mapOf("c:1,0" to 2, "c:3,3" to 2)
        assertTrue(LitsEngine.isComplete(puzzle(canon4x4), withMarks))
    }

    @Test
    fun isComplete_falseWhenARegionIsIncomplete() {
        // Drop one cell of the right I: that region no longer holds a tetromino.
        assertFalse(LitsEngine.isComplete(puzzle(canon4x4), solved - "c:2,3"))
    }

    @Test
    fun isComplete_falseWhenShadedCellsAreDisconnected() {
        // Move the right I from col 2 to col 3: still a valid I in its region, but now
        // separated from the left L by an empty column -> the shaded set is split.
        val disconnected = mapOf(
            "c:0,0" to 1, "c:0,1" to 1, "c:0,2" to 1, "c:1,2" to 1,  // left L
            "c:3,0" to 1, "c:3,1" to 1, "c:3,2" to 1, "c:3,3" to 1,  // right I in col 3
        )
        assertFalse(LitsEngine.isComplete(puzzle(canon4x4), disconnected))
    }

    @Test
    fun isComplete_falseForAdjacentSameShapePieces() {
        // Left L and a right L placed adjacent across the region border: every region
        // holds a valid tetromino and all cells connect, but the two touching pieces are
        // both L -> rule 4 violation.
        val twoLs = mapOf(
            "c:0,0" to 1, "c:0,1" to 1, "c:0,2" to 1, "c:1,2" to 1,  // left  L
            "c:2,0" to 1, "c:2,1" to 1, "c:2,2" to 1, "c:3,2" to 1,  // right L (mirror)
        )
        assertFalse(LitsEngine.isComplete(puzzle(canon4x4), twoLs))
    }

    @Test
    fun isComplete_falseForFullyShaded2x2() {
        // Left S + right L arranged so cells (0,1)(1,1)(0,2)(1,2) make a shaded 2x2 at the
        // region border. Each region still holds a valid tetromino (S and L), the set is
        // connected, and the pieces differ in shape -> only rule 3 (no 2x2) fails.
        val square = mapOf(
            // left S (row,col): (0,1)(1,0)(1,1)(2,0)
            "c:1,0" to 1, "c:0,1" to 1, "c:1,1" to 1, "c:0,2" to 1,
            // right L (row,col): (0,2)(1,2)(2,2)(2,3)
            "c:2,0" to 1, "c:2,1" to 1, "c:2,2" to 1, "c:3,2" to 1,
        )
        assertFalse(LitsEngine.isComplete(puzzle(canon4x4), square))
    }

    @Test
    fun isComplete_falseForEmptyBoard() {
        assertFalse(LitsEngine.isComplete(puzzle(canon4x4), emptyMap()))
    }
}
