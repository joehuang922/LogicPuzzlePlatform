package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SlitherlinkEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "s1",
        puzzleType = 5,
        puzzleTypeName = "slitherlink",
        puzzleTypeJpLabel = "Slitherlink",
        difficulty = 3,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 2x2 grid where every cell clue is 2. The unique loop is the outer perimeter: each
    // cell then borders exactly two loop edges. Dots form a 3x3 lattice (r,c in 0..2).
    private val canon2x2 = """{"cells":[[2,2],[2,2]]}"""

    // A 2x2 grid with no clues (-1) — used to exercise loop/branch checks without the
    // clue-count check short-circuiting first.
    private val canon2x2NoClues = """{"cells":[[-1,-1],[-1,-1]]}"""

    // A 3x3 grid with no clues — used for the two-separate-loops connectivity test.
    private val canon3x3NoClues =
        """{"cells":[[-1,-1,-1],[-1,-1,-1],[-1,-1,-1]]}"""

    // The perimeter loop on the 2x2 board, keyed "h:row,col" / "v:row,col".
    //   top    h[0][0], h[0][1]      bottom h[2][0], h[2][1]
    //   left   v[0][0], v[1][0]      right  v[0][2], v[1][2]
    private val perimeter = mapOf(
        "h:0,0" to 1, "h:0,1" to 1,
        "h:2,0" to 1, "h:2,1" to 1,
        "v:0,0" to 1, "v:1,0" to 1,
        "v:0,2" to 1, "v:1,2" to 1,
    )

    private fun JsonObject.edgeGrid(which: String): List<List<Int>> =
        (this["edges"]!!.jsonObject[which] as JsonArray).map { row ->
            row.jsonArray.map { it.jsonPrimitive.int }
        }

    // -- extractAnswer ------------------------------------------------------

    @Test
    fun extractAnswer_buildsEdgeGrids() {
        val answer = SlitherlinkEngine.extractAnswer(puzzle(canon2x2), perimeter)
        val h = answer.edgeGrid("h")
        val v = answer.edgeGrid("v")
        // h is (rows+1) x cols = 3 x 2; v is rows x (cols+1) = 2 x 3.
        assertEquals(listOf(listOf(1, 1), listOf(0, 0), listOf(1, 1)), h)
        assertEquals(listOf(listOf(1, 0, 1), listOf(1, 0, 1)), v)
    }

    @Test
    fun extractAnswer_persistsCrosses() {
        // A cross (state 2) is written through into the edge grid, unlike Nonogram/LITS
        // where it lives in a side grid; the web extractor persists it here too.
        val input = mapOf("h:0,0" to 1, "v:1,1" to 2)
        val answer = SlitherlinkEngine.extractAnswer(puzzle(canon2x2), input)
        assertEquals(1, answer.edgeGrid("h")[0][0])
        assertEquals(2, answer.edgeGrid("v")[1][1])
    }

    // -- restoreUserValues (round-trip) ------------------------------------

    @Test
    fun restore_roundTripsThroughExtract() {
        val p = puzzle(canon2x2)
        assertEquals(perimeter, SlitherlinkEngine.restoreUserValues(p, SlitherlinkEngine.extractAnswer(p, perimeter)))
    }

    @Test
    fun restore_roundTripsCrosses() {
        val p = puzzle(canon2x2)
        val input = mapOf("h:0,0" to 1, "h:1,1" to 2, "v:0,0" to 1, "v:1,2" to 2)
        assertEquals(input, SlitherlinkEngine.restoreUserValues(p, SlitherlinkEngine.extractAnswer(p, input)))
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_zeroForEmptyBoard() {
        assertEquals(0.0, SlitherlinkEngine.computeProgress(puzzle(canon2x2), emptyMap()), 0.0)
    }

    @Test
    fun computeProgress_countsCellsTouchedByAnyEdge() {
        // Only the two top edges: the two top-row cells each gain an edge -> 2 of 4 cells.
        val topOnly = mapOf("h:0,0" to 1, "h:0,1" to 1)
        assertEquals(50.0, SlitherlinkEngine.computeProgress(puzzle(canon2x2), topOnly), 1e-9)
    }

    @Test
    fun computeProgress_crossesAlsoCount() {
        // A cross is a non-empty edge, so it marks its adjacent cells as having progress.
        val oneCross = mapOf("h:0,0" to 2)
        assertEquals(25.0, SlitherlinkEngine.computeProgress(puzzle(canon2x2), oneCross), 1e-9)
    }

    @Test
    fun computeProgress_hundredForSolved() {
        assertEquals(100.0, SlitherlinkEngine.computeProgress(puzzle(canon2x2), perimeter), 1e-9)
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForPerimeterLoop() {
        assertTrue(SlitherlinkEngine.isComplete(puzzle(canon2x2), perimeter))
    }

    @Test
    fun isComplete_crossesDoNotAffectAValidLoop() {
        // Sprinkling crosses on empty edges leaves the loop valid (crosses are ignored).
        val withCrosses = perimeter + mapOf("h:1,0" to 2, "v:0,1" to 2)
        assertTrue(SlitherlinkEngine.isComplete(puzzle(canon2x2), withCrosses))
    }

    @Test
    fun isComplete_falseWhenClueCountWrong() {
        // Same perimeter loop, but a clue now demands 3 edges where only 2 are present.
        assertFalse(SlitherlinkEngine.isComplete(puzzle("""{"cells":[[3,2],[2,2]]}"""), perimeter))
    }

    @Test
    fun isComplete_falseForBranch() {
        // Perimeter plus an extra interior edge gives a dot degree 3 (a branch). No clues,
        // so this isolates the degree check.
        val branched = perimeter + mapOf("h:1,0" to 1)
        assertFalse(SlitherlinkEngine.isComplete(puzzle(canon2x2NoClues), branched))
    }

    @Test
    fun isComplete_falseForTwoSeparateLoops() {
        // Two single-cell loops at opposite corners of a 3x3 grid: every dot has degree 2
        // but the edges form two disconnected components.
        val twoLoops = mapOf(
            "h:0,0" to 1, "h:1,0" to 1, "v:0,0" to 1, "v:0,1" to 1, // cell (0,0) loop
            "h:2,2" to 1, "h:3,2" to 1, "v:2,2" to 1, "v:2,3" to 1, // cell (2,2) loop
        )
        assertFalse(SlitherlinkEngine.isComplete(puzzle(canon3x3NoClues), twoLoops))
    }

    @Test
    fun isComplete_falseForEmptyBoard() {
        assertFalse(SlitherlinkEngine.isComplete(puzzle(canon2x2), emptyMap()))
    }

    @Test
    fun isComplete_falseForCrossesOnly() {
        // Crosses are not loop edges, so a board of only crosses has no loop.
        val crossesOnly = mapOf("h:0,0" to 2, "h:0,1" to 2, "v:0,0" to 2)
        assertFalse(SlitherlinkEngine.isComplete(puzzle(canon2x2), crossesOnly))
    }
}
