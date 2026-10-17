package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShakashakaEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "s1",
        puzzleType = 11,
        puzzleTypeName = "shakashaka",
        puzzleTypeJpLabel = "Shakashaka",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 3 rows x 2 cols: two black "1" clues on top, a 2x2 white block below.
    //   1 1
    //   . .
    //   . .
    private val canon = """{"cells":[[1,1],[-1,-1],[-1,-1]]}"""

    // Four corner triangles leave a white diamond (a 45°-rotated square) in the 2x2
    // block, and each clue touches exactly one triangle. Keys are "col,row".
    private val diamond = mapOf("0,1" to 1, "1,1" to 2, "0,2" to 3, "1,2" to 4)

    // -- tap logic -----------------------------------------------------------

    @Test
    fun quadrantPicksTheTappedCorner() {
        assertEquals(ShakashakaEngine.TRI_TL, ShakashakaEngine.quadrant(0.2f, 0.2f))
        assertEquals(ShakashakaEngine.TRI_TR, ShakashakaEngine.quadrant(0.8f, 0.2f))
        assertEquals(ShakashakaEngine.TRI_BL, ShakashakaEngine.quadrant(0.2f, 0.8f))
        assertEquals(ShakashakaEngine.TRI_BR, ShakashakaEngine.quadrant(0.8f, 0.8f))
    }

    @Test
    fun tapCyclesTriangleThenMarkThenEmpty() {
        val q = ShakashakaEngine.TRI_TR
        assertEquals(q, ShakashakaEngine.nextState(ShakashakaEngine.UNSET, q))
        assertEquals(ShakashakaEngine.MARK, ShakashakaEngine.nextState(q, q))
        assertEquals(ShakashakaEngine.UNSET, ShakashakaEngine.nextState(ShakashakaEngine.MARK, q))
    }

    @Test
    fun tapOnAnotherQuadrantSwapsTheTriangle() {
        assertEquals(
            ShakashakaEngine.TRI_BL,
            ShakashakaEngine.nextState(ShakashakaEngine.TRI_TR, ShakashakaEngine.TRI_BL),
        )
    }

    // -- answer / progress / restore -----------------------------------------

    @Test
    fun extractAnswerZeroesBlackCells() {
        val states = ShakashakaEngine.extractAnswer(puzzle(canon), diamond + ("0,0" to 3))["states"]!!.jsonArray
        val grid = states.map { row -> row.jsonArray.map { it.jsonPrimitive.int } }
        assertEquals(listOf(listOf(0, 0), listOf(1, 2), listOf(3, 4)), grid)
    }

    @Test
    fun restoreRoundTripsExtract() {
        val p = puzzle(canon)
        val values = mapOf("0,1" to 2, "1,2" to 5)
        assertEquals(values, ShakashakaEngine.restoreUserValues(p, ShakashakaEngine.extractAnswer(p, values)))
    }

    @Test
    fun progressCountsFilledWhiteCells() {
        val p = puzzle(canon)
        assertEquals(0.0, ShakashakaEngine.computeProgress(p, emptyMap()), 1e-9)
        assertEquals(50.0, ShakashakaEngine.computeProgress(p, mapOf("0,1" to 1, "1,2" to 5)), 1e-9)
        assertEquals(100.0, ShakashakaEngine.computeProgress(p, diamond), 1e-9)
    }

    // -- completion ------------------------------------------------------------

    @Test
    fun diamondIsComplete() {
        assertTrue(ShakashakaEngine.isComplete(puzzle(canon), diamond))
    }

    @Test
    fun marksDoNotAffectCompletion() {
        val zeros = puzzle("""{"cells":[[0,0],[-1,-1],[-1,-1]]}""")
        assertTrue(ShakashakaEngine.isComplete(zeros, emptyMap()))
        assertTrue(ShakashakaEngine.isComplete(zeros, mapOf("0,1" to 5, "1,2" to 5)))
    }

    @Test
    fun wrongClueCountIsIncomplete() {
        assertFalse(ShakashakaEngine.isComplete(puzzle("""{"cells":[[2,1],[-1,-1],[-1,-1]]}"""), diamond))
        assertFalse(ShakashakaEngine.isComplete(puzzle(canon), emptyMap()))
    }

    @Test
    fun nonRectangularWhiteAreaIsIncomplete() {
        val p = puzzle("""{"cells":[[5,5],[-1,-1],[-1,-1]]}""")
        // One corner cut off a 2x2 block: a pentagon.
        assertFalse(ShakashakaEngine.isComplete(p, mapOf("1,2" to 4)))
        // Three of the diamond's four corners: still not a rectangle.
        assertFalse(ShakashakaEngine.isComplete(p, diamond - "1,2"))
        assertTrue(ShakashakaEngine.isComplete(p, diamond))
    }

    @Test
    fun separateWhiteRectanglesAreEachChecked() {
        // A black column splits two white 1x2 strips; filling one strip's cell with a
        // triangle leaves a triangle + square there, which is not a rectangle.
        val p = puzzle("""{"cells":[[-1,5,-1],[-1,5,-1]]}""")
        assertTrue(ShakashakaEngine.isComplete(p, emptyMap()))
        assertFalse(ShakashakaEngine.isComplete(p, mapOf("2,0" to 1)))
    }

    @Test
    fun largerDiagonalRectangleIsComplete() {
        // 3x3 with black corners top-right and bottom-left. Six triangles cut the rest
        // down to a 45° rectangle, 2 cells long and 1 wide, running from top-left to
        // bottom-right with the middle cell whole.
        val p = puzzle("""{"cells":[[-1,-1,5],[-1,-1,-1],[5,-1,-1]]}""")
        val values = mapOf(
            "0,0" to 1, "1,0" to 2,
            "0,1" to 3, "2,1" to 2,
            "1,2" to 3, "2,2" to 4,
        )
        assertTrue(ShakashakaEngine.isComplete(p, values))
    }
}
