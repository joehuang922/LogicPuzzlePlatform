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

class HitoriEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "h1",
        puzzleType = 26,
        puzzleTypeName = "hitori",
        puzzleTypeJpLabel = "ひとりにしてくれ",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // A hand-verified 5x5 Hitori built from a cyclic Latin square with one duplicate forced
    // into each row:
    //   1 1 3 4 5
    //   2 3 4 1 1
    //   1 4 5 1 2
    //   4 5 2 2 3
    //   5 1 2 3 1
    private val board =
        """{"cells":[[1,1,3,4,5],[2,3,4,1,1],[1,4,5,1,2],[4,5,2,2,3],[5,1,2,3,1]]}"""

    // The solution: shade one duplicate per row. Keys are "col,row" (col first), value 1 =
    // shaded. 0-indexed shaded cells (row,col): (0,1),(1,3),(2,0),(3,2),(4,4). No two touch
    // orthogonally; the 20 unshaded cells stay connected; every unshaded row/column is
    // duplicate-free.
    private val solved = mapOf("1,0" to 1, "3,1" to 1, "0,2" to 1, "2,3" to 1, "4,4" to 1)

    // -- input ----------------------------------------------------------------

    @Test
    fun tap_cyclesEmptyShadedMarkedEmpty() {
        val p = puzzle(board)
        assertEquals(mapOf("0,0" to 1), ShadeCycle.tap(HitoriEngine, p, emptyMap(), 0, 0))
        assertEquals(mapOf("0,0" to 2), ShadeCycle.tap(HitoriEngine, p, mapOf("0,0" to 1), 0, 0))
        assertEquals(mapOf("0,0" to 0), ShadeCycle.tap(HitoriEngine, p, mapOf("0,0" to 2), 0, 0))
    }

    @Test
    fun tap_everyCellTakesInput() {
        // Unlike Nurikabe there are no read-only clue cells; even a cell holding a number
        // cycles. (2,3) is col2,row3, one of the forced duplicates.
        assertEquals(mapOf("2,3" to 1), ShadeCycle.tap(HitoriEngine, puzzle(board), emptyMap(), 2, 3))
    }

    // -- extractAnswer / restoreUserValues ------------------------------------

    @Test
    fun extractAnswer_buildsFullStatesGrid() {
        val answer = HitoriEngine.extractAnswer(puzzle(board), solved + ("0,0" to 2))
        val states = answer["states"]!!.jsonArray.map { row -> row.jsonArray.map { it.jsonPrimitive.int } }
        assertEquals(
            listOf(
                listOf(2, 1, 0, 0, 0),
                listOf(0, 0, 0, 1, 0),
                listOf(1, 0, 0, 0, 0),
                listOf(0, 0, 1, 0, 0),
                listOf(0, 0, 0, 0, 1),
            ),
            states,
        )
    }

    @Test
    fun restoreUserValues_roundTripsShadedAndMarked() {
        val p = puzzle(board)
        val values = solved + ("0,0" to 2)
        assertEquals(values, HitoriEngine.restoreUserValues(p, HitoriEngine.extractAnswer(p, values)))
    }

    // -- computeProgress --------------------------------------------------------

    @Test
    fun computeProgress_countsEveryTouchedCell() {
        val p = puzzle("""{"cells":[[1,2],[2,1]]}""")
        assertEquals(0.0, HitoriEngine.computeProgress(p, emptyMap()), 1e-9)
        assertEquals(25.0, HitoriEngine.computeProgress(p, mapOf("0,0" to 1)), 1e-9)
        // A mark counts toward progress just like a shade.
        assertEquals(50.0, HitoriEngine.computeProgress(p, mapOf("0,0" to 1, "1,1" to 2)), 1e-9)
        assertEquals(100.0, HitoriEngine.computeProgress(p, mapOf("0,0" to 1, "1,0" to 1, "0,1" to 2, "1,1" to 2)), 1e-9)
    }

    // -- isComplete ---------------------------------------------------------------

    @Test
    fun isComplete_trueForTheSolution() {
        assertTrue(HitoriEngine.isComplete(puzzle(board), solved))
    }

    @Test
    fun isComplete_marksCountAsUnshaded() {
        // Marking some unshaded cells must not change a valid solution.
        assertTrue(HitoriEngine.isComplete(puzzle(board), solved + ("0,0" to 2) + ("4,0" to 2)))
    }

    @Test
    fun isComplete_falseWhenADuplicateRemains() {
        // Leaving (0,2) [col0,row2] unshaded leaves two 1s in column 0.
        assertFalse(HitoriEngine.isComplete(puzzle(board), solved - "0,2"))
    }

    @Test
    fun isComplete_falseWhenTwoShadedCellsTouch() {
        // Add a shade at col2,row1 ("2,1"), which sits directly left of the solution's
        // shaded col3,row1 ("3,1") — two orthogonally adjacent shaded cells.
        assertFalse(HitoriEngine.isComplete(puzzle(board), solved + ("2,1" to 1)))
    }

    @Test
    fun isComplete_falseWhenUnshadedSplit() {
        // A Latin-square grid, so every unshaded row/column stays duplicate-free. Shading
        // col1,row0 and col0,row1 (diagonal, so not touching) walls off the corner cell
        // col0,row0: both its orthogonal neighbors are shaded, so the unshaded cells split.
        val latin = puzzle("""{"cells":[[1,2,3],[2,3,1],[3,1,2]]}""")
        val cut = mapOf("1,0" to 1, "0,1" to 1)
        assertFalse(HitoriEngine.isComplete(latin, cut))
    }
}
