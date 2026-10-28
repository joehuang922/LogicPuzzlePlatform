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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class KuralinEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "k1",
        puzzleType = 28,
        puzzleTypeName = "kuralin",
        puzzleTypeJpLabel = "クラリン",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 2 rows x 3 cols; the loop rings the left 2x2 block and the right column is black:
    //   o-o B
    //   o-o B
    // Circles: white on the edge (0,0)|(1,0); gray on the edge (0,1)|(0,2) and on the
    // corner between all four right-hand cells; black on the edge (0,2)|(1,2).
    private val canon = """{"width":3,"height":2,"circles":[
        {"dr":2,"dc":1,"color":0},
        {"dr":1,"dc":4,"color":2},
        {"dr":2,"dc":4,"color":2},
        {"dr":2,"dc":5,"color":1}]}"""

    private val solved = mapOf(
        "b:0,2" to 1, "b:1,2" to 1,
        "h:0,0" to 1, "h:1,0" to 1, "v:0,0" to 1, "v:0,1" to 1,
    )

    @Test
    fun parseBoard_readsSizeAndCircles() {
        val board = KuralinEngine.parseBoard(puzzle(canon))
        assertEquals(2, board.rows)
        assertEquals(3, board.cols)
        assertEquals(KuralinEngine.Circle(2, 5, 1), board.circles[3])
    }

    @Test
    fun touchedCells_edgeAndCorner() {
        assertEquals(listOf(0 to 1, 0 to 2), KuralinEngine.touchedCells(KuralinEngine.Circle(1, 4, 0)))
        assertEquals(listOf(0 to 0, 1 to 0), KuralinEngine.touchedCells(KuralinEngine.Circle(2, 1, 0)))
        assertEquals(
            listOf(0 to 1, 0 to 2, 1 to 1, 1 to 2),
            KuralinEngine.touchedCells(KuralinEngine.Circle(2, 4, 0)),
        )
    }

    @Test
    fun isComplete_acceptsSolution() {
        assertTrue(KuralinEngine.isComplete(puzzle(canon), solved))
    }

    @Test
    fun isComplete_ignoresMarksOnLoopCells() {
        assertTrue(KuralinEngine.isComplete(puzzle(canon), solved + ("b:0,0" to 2)))
    }

    @Test
    fun isComplete_rejectsCellNeitherBlackNorOnLoop() {
        assertFalse(KuralinEngine.isComplete(puzzle(canon), solved - "b:1,2"))
    }

    @Test
    fun isComplete_rejectsFailedCircle() {
        val whiteToBlack = canon.replace("""{"dr":2,"dc":1,"color":0}""", """{"dr":2,"dc":1,"color":1}""")
        assertFalse(KuralinEngine.isComplete(puzzle(whiteToBlack), solved))
    }

    @Test
    fun isComplete_rejectsOpenPath() {
        assertFalse(KuralinEngine.isComplete(puzzle(canon), solved - "v:0,1"))
    }

    @Test
    fun isComplete_rejectsTwoLoops() {
        // 2 x 4, two separate 2x2 loops: every cell is on a loop but there are two.
        val wide = """{"width":4,"height":2,"circles":[{"dr":2,"dc":4,"color":0}]}"""
        val twoLoops = mapOf(
            "h:0,0" to 1, "h:1,0" to 1, "v:0,0" to 1, "v:0,1" to 1,
            "h:0,2" to 1, "h:1,2" to 1, "v:0,2" to 1, "v:0,3" to 1,
        )
        assertFalse(KuralinEngine.isComplete(puzzle(wide), twoLoops))
    }

    @Test
    fun progress_countsBlackAndLoopCellsButNotMarks() {
        val p = puzzle(canon)
        assertEquals(0.0, KuralinEngine.computeProgress(p, emptyMap()), 1e-9)
        assertEquals(100.0 / 6, KuralinEngine.computeProgress(p, mapOf("b:0,2" to 1, "b:1,1" to 2)), 1e-9)
        assertEquals(100.0, KuralinEngine.computeProgress(p, solved), 1e-9)
    }

    @Test
    fun extractAndRestore_roundTrip() {
        val p = puzzle(canon)
        val values = solved + ("b:0,0" to 2)
        val answer = KuralinEngine.extractAnswer(p, values)
        val blacks = answer["blacks"]!!.jsonArray
        assertEquals(1, blacks[0].jsonArray[2].jsonPrimitive.int)
        assertEquals(2, blacks[0].jsonArray[0].jsonPrimitive.int)
        assertEquals(2, answer["edges"]!!.jsonObject["h"]!!.jsonArray[0].jsonArray.size)
        assertEquals(values, KuralinEngine.restoreUserValues(p, answer))
    }

    @Test
    fun circleInError_onlyOnceAllTouchedCellsAreDecided() {
        val p = puzzle(canon)
        val black = KuralinEngine.Circle(2, 5, 1)
        // Only (0,2) decided: not yet an error.
        var g = KuralinEngine.grids(2, 3, mapOf("h:0,1" to 1))
        assertFalse(KuralinEngine.circleInError(black, g))
        // Both touched cells on the loop: the black circle has failed.
        g = KuralinEngine.grids(2, 3, mapOf("h:0,1" to 1, "h:1,1" to 1))
        assertTrue(KuralinEngine.circleInError(black, g))
        // The solution satisfies every circle.
        g = KuralinEngine.grids(2, 3, solved)
        assertTrue(KuralinEngine.parseBoard(p).circles.none { KuralinEngine.circleInError(it, g) })
    }

    @Test
    fun nearestPoint_snapsToGridLines() {
        // Near an edge midpoint: col 1.0 (line between cols 0 and 1), row 0.5.
        assertEquals(1 to 2, KuralinEngine.nearestPoint(1.05f, 0.45f, 2, 3))
        // Near an interior corner.
        assertEquals(2 to 4, KuralinEngine.nearestPoint(1.9f, 1.1f, 2, 3))
        // Near a cell center: moves to the closer line (vertical line x = 2 here).
        assertEquals(1 to 4, KuralinEngine.nearestPoint(1.8f, 0.55f, 2, 3))
        // On the outer border: no point.
        assertNull(KuralinEngine.nearestPoint(0.02f, 0.5f, 2, 3))
    }

    @Test
    fun canDrawEdge_refusesBlackAndBranches() {
        val g = KuralinEngine.grids(2, 3, mapOf("b:0,2" to 1, "h:1,0" to 1, "v:0,1" to 1))
        assertFalse(KuralinEngine.canDrawEdge(g, 0, 2))
        assertTrue(KuralinEngine.canDrawEdge(g, 0, 0))
        assertFalse(KuralinEngine.canDrawEdge(g, 1, 1)) // already has two segments
    }
}
