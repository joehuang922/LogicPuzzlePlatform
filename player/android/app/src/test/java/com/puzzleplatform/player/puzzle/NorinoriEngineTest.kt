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

class NorinoriEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "n1",
        puzzleType = 23,
        puzzleTypeName = "norinori",
        puzzleTypeJpLabel = "のりのり",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // A 4x4 grid divided into four regions, one per row (every horizontal border thick, no
    // vertical border thick). rows = h.length + 1 = 4, cols = v[0].length + 1 = 4.
    private val board =
        """{"grids":{"h":[[1,1,1,1],[1,1,1,1],[1,1,1,1]],"v":[[0,0,0],[0,0,0],[0,0,0],[0,0,0]]}}"""

    // The solution: two shaded cells per row-region, each a horizontal domino, no two
    // dominoes touching. Keys are "c:col,row" (col first), value 1 = shaded. Shaded cells
    // (row,col): (0,0),(0,1) / (1,2),(1,3) / (2,0),(2,1) / (3,2),(3,3). Every shaded cell has
    // exactly one shaded orthogonal neighbor.
    private val solved = mapOf(
        "c:0,0" to 1, "c:1,0" to 1,
        "c:2,1" to 1, "c:3,1" to 1,
        "c:0,2" to 1, "c:1,2" to 1,
        "c:2,3" to 1, "c:3,3" to 1,
    )

    // -- input ----------------------------------------------------------------

    @Test
    fun tap_cyclesEmptyShadedMarkedEmpty() {
        val p = puzzle(board)
        assertEquals(mapOf("c:0,0" to 1), ShadeCycle.tap(NorinoriEngine, p, emptyMap(), 0, 0))
        assertEquals(mapOf("c:0,0" to 2), ShadeCycle.tap(NorinoriEngine, p, mapOf("c:0,0" to 1), 0, 0))
        assertEquals(mapOf("c:0,0" to 0), ShadeCycle.tap(NorinoriEngine, p, mapOf("c:0,0" to 2), 0, 0))
    }

    // -- extractAnswer / restoreUserValues ------------------------------------

    @Test
    fun extractAnswer_buildsFullStatesGridIncludingMarks() {
        // A mark at (row 0, col 3) rides alongside the shaded cells.
        val answer = NorinoriEngine.extractAnswer(puzzle(board), solved + ("c:3,0" to 2))
        val states = answer["states"]!!.jsonArray.map { row -> row.jsonArray.map { it.jsonPrimitive.int } }
        assertEquals(
            listOf(
                listOf(1, 1, 0, 2),
                listOf(0, 0, 1, 1),
                listOf(1, 1, 0, 0),
                listOf(0, 0, 1, 1),
            ),
            states,
        )
    }

    @Test
    fun restoreUserValues_roundTripsShadedAndMarked() {
        val p = puzzle(board)
        val values = solved + ("c:3,0" to 2)
        assertEquals(values, NorinoriEngine.restoreUserValues(p, NorinoriEngine.extractAnswer(p, values)))
    }

    @Test
    fun restoreUserValues_readsLegacyShadedShape() {
        // Answers saved before marks were persisted carry a shaded-only grid; a mark layer
        // is simply absent, so every restored cell is shaded.
        val legacy = Json.parseToJsonElement(
            """{"shaded":[[1,1,0,0],[0,0,1,1],[1,1,0,0],[0,0,1,1]]}"""
        ) as JsonObject
        assertEquals(solved, NorinoriEngine.restoreUserValues(puzzle(board), legacy))
    }

    // -- computeProgress --------------------------------------------------------

    @Test
    fun computeProgress_countsRegionsWithExactlyTwoShaded() {
        val p = puzzle(board)
        assertEquals(0.0, NorinoriEngine.computeProgress(p, emptyMap()), 1e-9)
        // One of four row-regions holds exactly two shaded cells.
        assertEquals(25.0, NorinoriEngine.computeProgress(p, mapOf("c:0,0" to 1, "c:1,0" to 1)), 1e-9)
        // A region with only one shaded cell does not count; marks never count.
        assertEquals(
            25.0,
            NorinoriEngine.computeProgress(p, mapOf("c:0,0" to 1, "c:1,0" to 1, "c:0,1" to 1, "c:1,1" to 2)),
            1e-9,
        )
        assertEquals(100.0, NorinoriEngine.computeProgress(p, solved), 1e-9)
    }

    // -- isComplete ---------------------------------------------------------------

    @Test
    fun isComplete_trueForTheSolution() {
        assertTrue(NorinoriEngine.isComplete(puzzle(board), solved))
    }

    @Test
    fun isComplete_marksCountAsUnshaded() {
        // Marking empty cells must not change a valid solution.
        assertTrue(NorinoriEngine.isComplete(puzzle(board), solved + ("c:3,0" to 2) + ("c:0,1" to 2)))
    }

    @Test
    fun isComplete_falseWhenEmpty() {
        assertFalse(NorinoriEngine.isComplete(puzzle(board), emptyMap()))
    }

    @Test
    fun isComplete_falseWhenARegionHasWrongShadedCount() {
        // Dropping one shaded cell leaves region 0 with a single shaded cell.
        assertFalse(NorinoriEngine.isComplete(puzzle(board), solved - "c:1,0"))
    }

    @Test
    fun isComplete_falseWhenADominoRuleIsBroken() {
        // Every row-region holds exactly two shaded cells (count rule passes), but shading
        // columns 0 and 1 in all four rows makes a solid 4x2 block: each shaded cell then
        // has two shaded orthogonal neighbors, so no domino partition exists.
        val block = mapOf(
            "c:0,0" to 1, "c:1,0" to 1,
            "c:0,1" to 1, "c:1,1" to 1,
            "c:0,2" to 1, "c:1,2" to 1,
            "c:0,3" to 1, "c:1,3" to 1,
        )
        assertFalse(NorinoriEngine.isComplete(puzzle(board), block))
    }
}
