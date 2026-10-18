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

class AkariEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "a1",
        puzzleType = 18,
        puzzleTypeName = "akari",
        puzzleTypeJpLabel = "美術館",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 3x3 ring of white cells around a central "2" wall.
    //   . . .
    //   . 2 .
    //   . . .
    private val ring = """{"cells":[[-1,-1,-1],[-1,2,-1],[-1,-1,-1]]}"""

    // A solution (hand-verified). Keys are "col,row", value 1 = bulb:
    //   (row0,col1) lights row 0; (row2,col0) lights row 2 and column 0; (row1,col2)
    //   lights the last cell. No two share an open line, and the wall touches the bulbs
    //   at (row0,col1) and (row1,col2): exactly 2.
    private val solved = mapOf("1,0" to 1, "0,2" to 1, "2,1" to 1)

    // -- input ----------------------------------------------------------------

    @Test
    fun tap_cyclesEmptyBulbDotEmpty() {
        val p = puzzle(ring)
        assertEquals(mapOf("0,0" to 1), ShadeCycle.tap(AkariEngine, p, emptyMap(), 0, 0))
        assertEquals(mapOf("0,0" to 2), ShadeCycle.tap(AkariEngine, p, mapOf("0,0" to 1), 0, 0))
        assertEquals(mapOf("0,0" to 0), ShadeCycle.tap(AkariEngine, p, mapOf("0,0" to 2), 0, 0))
    }

    @Test
    fun tap_wallTakesNoInput() {
        assertEquals(emptyMap<String, Int>(), ShadeCycle.tap(AkariEngine, puzzle(ring), emptyMap(), 1, 1))
    }

    // -- extractAnswer / restoreUserValues ------------------------------------

    @Test
    fun extractAnswer_buildsStatesWithWallsZero() {
        val answer = AkariEngine.extractAnswer(puzzle(ring), solved + ("0,0" to 2) + ("1,1" to 1))
        val states = answer["states"]!!.jsonArray.map { row -> row.jsonArray.map { it.jsonPrimitive.int } }
        assertEquals(
            listOf(
                listOf(2, 1, 0),
                listOf(0, 0, 1), // the wall at (row1,col1) always reads 0
                listOf(1, 0, 0),
            ),
            states,
        )
    }

    @Test
    fun restoreUserValues_roundTripsBulbsAndDots() {
        val p = puzzle(ring)
        val values = solved + ("0,0" to 2)
        assertEquals(values, AkariEngine.restoreUserValues(p, AkariEngine.extractAnswer(p, values)))
    }

    // -- computeProgress --------------------------------------------------------

    @Test
    fun computeProgress_countsLitWhiteCells() {
        val p = puzzle(ring)
        assertEquals(0.0, AkariEngine.computeProgress(p, emptyMap()), 1e-9)
        // One bulb mid top row lights that row: 3 of 8 white cells.
        assertEquals(37.5, AkariEngine.computeProgress(p, mapOf("1,0" to 1)), 1e-9)
        // Dots light nothing.
        assertEquals(0.0, AkariEngine.computeProgress(p, mapOf("1,0" to 2)), 1e-9)
        assertEquals(100.0, AkariEngine.computeProgress(p, solved), 1e-9)
    }

    @Test
    fun computeProgress_wallsBlockLight() {
        // Bulb at (row1,col0): the wall at (row1,col1) stops it from reaching (row1,col2).
        val lit = AkariEngine.illuminate(AkariEngine.parseCells(puzzle(ring)), mapOf("0,1" to 1)).lit
        assertTrue(lit[1][0])
        assertTrue(lit[0][0])
        assertTrue(lit[2][0])
        assertFalse(lit[1][2])
    }

    // -- isComplete ---------------------------------------------------------------

    @Test
    fun isComplete_trueForTheSolution() {
        assertTrue(AkariEngine.isComplete(puzzle(ring), solved))
    }

    @Test
    fun isComplete_dotsDoNotAffectASolution() {
        assertTrue(AkariEngine.isComplete(puzzle(ring), solved + ("0,0" to 2)))
    }

    @Test
    fun isComplete_falseWhenACellIsDark() {
        assertFalse(AkariEngine.isComplete(puzzle(ring), solved - "2,1"))
    }

    @Test
    fun isComplete_falseWhenBulbsSeeEachOther() {
        // (row0,col0) and (row0,col2) share an open row.
        val p = puzzle(ring)
        val values = mapOf("0,0" to 1, "2,0" to 1, "0,2" to 1, "2,2" to 1)
        assertTrue(AkariEngine.illuminate(AkariEngine.parseCells(p), values).conflict[0][0])
        assertFalse(AkariEngine.isComplete(p, values))
    }

    @Test
    fun isComplete_falseWhenAWallCountIsWrong() {
        // Everything lit, no conflicts, but the "2" wall touches no bulb.
        val p = puzzle(ring)
        val values = mapOf("0,0" to 1, "2,2" to 1)
        assertFalse(AkariEngine.isComplete(p, values))
        // The same bulbs solve the board when the wall is unnumbered.
        assertTrue(AkariEngine.isComplete(puzzle("""{"cells":[[-1,-1,-1],[-1,5,-1],[-1,-1,-1]]}"""), values))
    }
}
