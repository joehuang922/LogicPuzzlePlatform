package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ZebraRopeEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "p1",
        puzzleType = 36,
        puzzleTypeName = "zebra-rope",
        puzzleTypeJpLabel = "シマシマロープ",
        difficulty = 1,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // The web rules test's 3x3: a diagonal rope (0,0)-(1,1)-(2,2), a vertical rope down
    // column 2, a black circle on the corner of the top-left 2x2, a gray circle on the
    // edge between (1,1) and (1,2).
    private val small = puzzle(
        """{"width":3,"height":3,
           "ropes":[[[0,0],[1,1],[2,2]],[[0,2],[1,2],[2,2]]],
           "circles":[{"dr":2,"dc":2,"color":1},{"dr":3,"dc":4,"color":2}]}"""
    )

    // Its solution, "col,row" -> 1 for shaded cells:
    //   # # #
    //   # . #
    //   . . #
    private val solved = listOf(0 to 0, 1 to 0, 2 to 0, 0 to 1, 2 to 1, 2 to 2)
        .associate { (c, r) -> "$c,$r" to ZebraRopeEngine.SHADED }

    @Test
    fun parseBoard_readsRopesAndCircles() {
        val board = ZebraRopeEngine.parseBoard(small)
        assertEquals(3, board.rows)
        assertEquals(3, board.cols)
        assertEquals(listOf(0 to 0, 1 to 1, 2 to 2), board.ropes[0])
        assertEquals(ZebraRopeEngine.Circle(2, 2, 1), board.circles[0])
    }

    @Test
    fun touchedCells_edgeAndCorner() {
        assertEquals(listOf(1 to 1, 1 to 2), ZebraRopeEngine.touchedCells(ZebraRopeEngine.Circle(3, 4, 0)))
        assertEquals(
            listOf(0 to 0, 0 to 1, 1 to 0, 1 to 1),
            ZebraRopeEngine.touchedCells(ZebraRopeEngine.Circle(2, 2, 0)),
        )
    }

    @Test
    fun ropeHolds_uniformOrAlternating() {
        assertTrue(ZebraRopeEngine.ropeHolds(listOf(true, true, true)))
        assertTrue(ZebraRopeEngine.ropeHolds(listOf(false, true, false, true)))
        assertFalse(ZebraRopeEngine.ropeHolds(listOf(true, true, false)))
    }

    @Test
    fun isComplete_acceptsSolutionWithMarksAsUnshaded() {
        assertTrue(ZebraRopeEngine.isComplete(small, solved))
        val withMarks = solved + mapOf("1,1" to ZebraRopeEngine.MARKED, "0,2" to ZebraRopeEngine.MARKED)
        assertTrue(ZebraRopeEngine.isComplete(small, withMarks))
    }

    @Test
    fun isComplete_rejectsEverySingleFlipOfAClueCell() {
        // Row 2's first two cells sit in no clue, so either state solves.
        for (r in 0 until 3) {
            for (c in 0 until 3) {
                if (r == 2 && c < 2) continue
                val key = "$c,$r"
                val flipped = if (key in solved) solved - key else solved + (key to ZebraRopeEngine.SHADED)
                assertFalse("flip $key", ZebraRopeEngine.isComplete(small, flipped))
            }
        }
    }

    @Test
    fun brokenClues_flagsOnlyDecidedFailures() {
        val board = ZebraRopeEngine.parseBoard(small)
        assertEquals(emptySet<Int>() to emptySet<Int>(), ZebraRopeEngine.brokenClues(board, emptyMap()))
        // (0,2) shaded and (2,2) marked: column-2 rope can be neither uniform nor alternating.
        val ropeBroken = mapOf("2,0" to ZebraRopeEngine.SHADED, "2,2" to ZebraRopeEngine.MARKED)
        assertEquals(setOf(1), ZebraRopeEngine.brokenClues(board, ropeBroken).second)
        // Black corner with two marked cells can't reach a shaded majority.
        val circleBroken = mapOf("0,0" to ZebraRopeEngine.MARKED, "0,1" to ZebraRopeEngine.MARKED)
        assertEquals(setOf(0), ZebraRopeEngine.brokenClues(board, circleBroken).first)
    }

    @Test
    fun extractAndRestore_roundTrip() {
        val values = solved + ("1,1" to ZebraRopeEngine.MARKED)
        val answer = ZebraRopeEngine.extractAnswer(small, values)
        val states = (answer["states"] as JsonArray).map { row -> row.jsonArray.map { it.jsonPrimitive.int } }
        assertEquals(listOf(listOf(1, 1, 1), listOf(1, 2, 1), listOf(0, 0, 1)), states)
        assertEquals(values, ZebraRopeEngine.restoreUserValues(small, answer))
    }

    @Test
    fun computeProgress_countsShadedAndMarked() {
        assertEquals(0.0, ZebraRopeEngine.computeProgress(small, emptyMap()), 1e-9)
        val values = mapOf("0,0" to ZebraRopeEngine.SHADED, "1,0" to ZebraRopeEngine.MARKED, "2,0" to 0)
        assertEquals(200.0 / 9, ZebraRopeEngine.computeProgress(small, values), 1e-9)
    }

    @Test
    fun renderThumbnail_paintsShadedCellsBlack() {
        val thumb = ZebraRopeEngine.renderThumbnail(small, ZebraRopeEngine.extractAnswer(small, solved))!!
        assertEquals(3, thumb.width)
        assertEquals(3, thumb.height)
        val b = ZebraRopeEngine.FILL_ARGB
        val g = ZebraRopeEngine.GROUND_ARGB
        assertArrayEquals(intArrayOf(b, b, b, b, g, b, g, g, b), thumb.cells)
    }

    @Test
    fun pictureCells_marksAreWhite() {
        val board = ZebraRopeEngine.parseBoard(small)
        val values = mapOf("0,0" to ZebraRopeEngine.SHADED, "1,0" to ZebraRopeEngine.MARKED)
        val cells = ZebraRopeEngine.pictureCells(board, values)
        assertEquals(ZebraRopeEngine.FILL_ARGB, cells[0])
        assertEquals(ZebraRopeEngine.MARK_ARGB, cells[1])
        assertEquals(ZebraRopeEngine.GROUND_ARGB, cells[2])
    }

    @Test
    fun registeredAsShadeMarkEngine() {
        assertTrue(PuzzleEngines.forType(36) is ShadeMarkEngine)
        val tap = ShadeCycle.tap(ZebraRopeEngine, small, emptyMap(), 1, 2)
        assertEquals(mapOf("1,2" to ShadeCycle.SHADED), tap)
    }
}
