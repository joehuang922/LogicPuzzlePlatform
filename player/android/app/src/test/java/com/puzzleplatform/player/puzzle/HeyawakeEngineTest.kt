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

class HeyawakeEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "h1",
        puzzleType = 21,
        puzzleTypeName = "heyawake",
        puzzleTypeJpLabel = "へやわけ",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 3x3: a 3x1 room on top (clue 1) over a 3x2 room below (clue 1). No straight line can
    // cross more than two rooms, so only the clue, adjacency and connectivity rules bite.
    private val board =
        """{"width":3,"height":3,"rooms":[{"r":0,"c":0,"w":3,"h":1,"clue":1},{"r":1,"c":0,"w":3,"h":2,"clue":1}]}"""

    // Shaded (row,col): (0,1) and (2,1). Keys are "col,row" (col first), value 1 = shaded.
    private val solved = mapOf("1,0" to 1, "1,2" to 1)

    // 3x3 split into three 1x3 column rooms, no clues: every row crosses all three rooms.
    private val columns =
        """{"width":3,"height":3,"rooms":[{"r":0,"c":0,"w":1,"h":3,"clue":null},{"r":0,"c":1,"w":1,"h":3},{"r":0,"c":2,"w":1,"h":3,"clue":null}]}"""

    // -- input ----------------------------------------------------------------

    @Test
    fun tap_cyclesEmptyShadedMarkedEmpty() {
        val p = puzzle(board)
        assertEquals(mapOf("0,0" to 1), ShadeCycle.tap(HeyawakeEngine, p, emptyMap(), 0, 0))
        assertEquals(mapOf("0,0" to 2), ShadeCycle.tap(HeyawakeEngine, p, mapOf("0,0" to 1), 0, 0))
        assertEquals(mapOf("0,0" to 0), ShadeCycle.tap(HeyawakeEngine, p, mapOf("0,0" to 2), 0, 0))
    }

    // -- parse ------------------------------------------------------------------

    @Test
    fun parseBoard_readsRoomsAndNullOrMissingClues() {
        val b = HeyawakeEngine.parseBoard(puzzle(columns))
        assertEquals(3, b.width)
        assertEquals(3, b.height)
        assertEquals(listOf<Int?>(null, null, null), b.rooms.map { it.clue })
        val ids = HeyawakeEngine.computeRoomIds(b)
        assertEquals(listOf(0, 1, 2), ids[2].toList())
    }

    // -- extractAnswer / restoreUserValues ------------------------------------

    @Test
    fun extractAnswer_buildsFullStatesGridIncludingMarks() {
        val answer = HeyawakeEngine.extractAnswer(puzzle(board), solved + ("2,1" to 2))
        val states = answer["states"]!!.jsonArray.map { row -> row.jsonArray.map { it.jsonPrimitive.int } }
        assertEquals(
            listOf(
                listOf(0, 1, 0),
                listOf(0, 0, 2),
                listOf(0, 1, 0),
            ),
            states,
        )
    }

    @Test
    fun restoreUserValues_roundTripsShadedAndMarked() {
        val p = puzzle(board)
        val values = solved + ("2,1" to 2)
        assertEquals(values, HeyawakeEngine.restoreUserValues(p, HeyawakeEngine.extractAnswer(p, values)))
    }

    // -- computeProgress --------------------------------------------------------

    @Test
    fun computeProgress_countsAssignedCells() {
        val p = puzzle(board)
        assertEquals(0.0, HeyawakeEngine.computeProgress(p, emptyMap()), 1e-9)
        // Shaded and marked both count: 3 of 9 cells.
        assertEquals(100.0 / 3, HeyawakeEngine.computeProgress(p, solved + ("2,1" to 2)), 1e-9)
    }

    // -- isComplete ---------------------------------------------------------------

    @Test
    fun isComplete_trueForTheSolution() {
        assertTrue(HeyawakeEngine.isComplete(puzzle(board), solved))
    }

    @Test
    fun isComplete_marksCountAsUnshaded() {
        assertTrue(HeyawakeEngine.isComplete(puzzle(board), solved + ("0,0" to 2) + ("2,1" to 2)))
    }

    @Test
    fun isComplete_falseWhenAClueCountIsWrong() {
        // The bottom room loses its only shaded cell.
        assertFalse(HeyawakeEngine.isComplete(puzzle(board), solved - "1,2"))
    }

    @Test
    fun isComplete_falseWhenShadedCellsTouch() {
        // (0,1) and (1,1) are vertically adjacent; clues and connectivity still hold.
        assertFalse(HeyawakeEngine.isComplete(puzzle(board), mapOf("1,0" to 1, "1,1" to 1)))
    }

    @Test
    fun isComplete_falseWhenUnshadedCellsAreSplit() {
        // One unclued room; shading (0,1) and (1,0) cuts the corner cell (0,0) off.
        val single = """{"width":3,"height":3,"rooms":[{"r":0,"c":0,"w":3,"h":3,"clue":null}]}"""
        assertFalse(HeyawakeEngine.isComplete(puzzle(single), mapOf("1,0" to 1, "0,1" to 1)))
    }

    @Test
    fun isComplete_falseWhenAWhiteRunCrossesThreeRooms() {
        // Nothing shaded: no clues, adjacency or connectivity problem, but every row is an
        // unbroken white run through all three column rooms.
        assertFalse(HeyawakeEngine.isComplete(puzzle(columns), emptyMap()))
        // Breaking only the middle row still leaves rows 0 and 2 crossing three rooms.
        assertFalse(HeyawakeEngine.isComplete(puzzle(columns), mapOf("1,1" to 1)))
    }

    @Test
    fun isComplete_trueForTheSeedSample() {
        // The 6x6 sample seeded in player/api/seed.sql and its (unique) solution.
        val sample = """{"width":6,"height":6,"rooms":[{"r":0,"c":0,"w":2,"h":3,"clue":2},{"r":0,"c":2,"w":1,"h":2,"clue":null},{"r":0,"c":3,"w":1,"h":2,"clue":null},{"r":0,"c":4,"w":1,"h":3,"clue":null},{"r":0,"c":5,"w":1,"h":3,"clue":1},{"r":2,"c":2,"w":1,"h":2,"clue":null},{"r":2,"c":3,"w":1,"h":1,"clue":null},{"r":3,"c":0,"w":2,"h":2,"clue":null},{"r":3,"c":3,"w":2,"h":1,"clue":null},{"r":3,"c":5,"w":1,"h":3,"clue":null},{"r":4,"c":2,"w":2,"h":1,"clue":0},{"r":4,"c":4,"w":1,"h":1,"clue":null},{"r":5,"c":0,"w":3,"h":1,"clue":1},{"r":5,"c":3,"w":1,"h":1,"clue":null},{"r":5,"c":4,"w":1,"h":1,"clue":null}]}"""
        val solution = mapOf("0,0" to 1, "3,0" to 1, "2,1" to 1, "5,1" to 1, "0,2" to 1, "3,2" to 1, "2,3" to 1, "4,4" to 1, "1,5" to 1, "3,5" to 1)
        assertTrue(HeyawakeEngine.isComplete(puzzle(sample), solution))
        assertFalse(HeyawakeEngine.isComplete(puzzle(sample), solution - "0,0"))
    }
}
