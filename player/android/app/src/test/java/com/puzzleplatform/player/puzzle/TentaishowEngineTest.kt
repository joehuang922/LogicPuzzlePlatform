package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TentaishowEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "t1",
        puzzleType = 20,
        puzzleTypeName = "tentaishow",
        puzzleTypeJpLabel = "天体ショー",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 3x3 board, one dot of each position kind (brute-force-verified unique partition):
    //   corner (2,2) ●  -> the top-left 2x2 block
    //   center (1,5) ○  -> cell (0,2) alone
    //   h-edge (4,5) ○  -> cells (1,2),(2,2)
    //   v-edge (5,2) ●  -> cells (2,0),(2,1)
    //
    //   B B W
    //   B B W
    //   B B W      (B/W = black/white galaxy)
    private val canon3x3 = """
        {"width":3,"height":3,"dots":[
          {"dr":2,"dc":2,"color":1},
          {"dr":1,"dc":5,"color":0},
          {"dr":4,"dc":5,"color":0},
          {"dr":5,"dc":2,"color":1}
        ]}
    """.trimIndent()

    // The minimal wall set for that partition.
    private val solved = mapOf(
        "h:0,2" to 1, // (0,2) | (1,2)
        "h:1,0" to 1, // 2x2 block | bottom-left pair
        "h:1,1" to 1,
        "v:0,1" to 1, // left columns | right column
        "v:1,1" to 1,
        "v:2,1" to 1,
    )

    // -- parseBoard ---------------------------------------------------------

    @Test
    fun parseBoard_readsDimensionsAndDots() {
        val board = TentaishowEngine.parseBoard(puzzle(canon3x3))
        assertEquals(3, board.rows)
        assertEquals(3, board.cols)
        assertEquals(4, board.dots.size)
        assertEquals(TentaishowEngine.Dot(2, 2, 1), board.dots[0])
    }

    // -- extractAnswer ------------------------------------------------------

    private fun JsonObject.edgeGrid(kind: String): List<List<Int>> =
        this["edges"]!!.jsonObject[kind]!!.jsonArray.map { row -> row.jsonArray.map { it.jsonPrimitive.int } }

    @Test
    fun extractAnswer_buildsEdgeGrids() {
        val answer = TentaishowEngine.extractAnswer(puzzle(canon3x3), solved)
        assertEquals(listOf(listOf(0, 0, 1), listOf(1, 1, 0)), answer.edgeGrid("h"))
        assertEquals(listOf(listOf(0, 1), listOf(0, 1), listOf(0, 1)), answer.edgeGrid("v"))
    }

    @Test
    fun extractAnswer_dropsOutOfBoundsWalls() {
        // h row 2 / v col 2 don't exist on a 3x3 board.
        val values = solved + ("h:2,0" to 1) + ("v:0,2" to 1)
        val answer = TentaishowEngine.extractAnswer(puzzle(canon3x3), values)
        assertEquals(2, (answer["edges"]!!.jsonObject["h"] as JsonArray).size)
        assertEquals(listOf(listOf(0, 1), listOf(0, 1), listOf(0, 1)), answer.edgeGrid("v"))
    }

    // -- restoreUserValues (round-trip) ------------------------------------

    @Test
    fun restore_roundTripsThroughExtract() {
        val p = puzzle(canon3x3)
        assertEquals(solved, TentaishowEngine.restoreUserValues(p, TentaishowEngine.extractAnswer(p, solved)))
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_zeroForEmptyBoard() {
        // One region holding all four dots -> no cell is in a single-dot galaxy.
        assertEquals(0.0, TentaishowEngine.computeProgress(puzzle(canon3x3), emptyMap()), 0.0)
    }

    @Test
    fun computeProgress_hundredWhenSolved() {
        assertEquals(100.0, TentaishowEngine.computeProgress(puzzle(canon3x3), solved), 1e-9)
    }

    @Test
    fun computeProgress_countsCellsInSingleDotRegions() {
        // Fencing off just (0,2) gives a 1-cell single-dot galaxy; the other 8 cells
        // still share three dots.
        val values = mapOf("h:0,2" to 1, "v:0,1" to 1)
        assertEquals(1.0 / 9.0 * 100.0, TentaishowEngine.computeProgress(puzzle(canon3x3), values), 1e-9)
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForValidSolution() {
        assertTrue(TentaishowEngine.isComplete(puzzle(canon3x3), solved))
    }

    @Test
    fun isComplete_falseForEmptyBoard() {
        assertFalse(TentaishowEngine.isComplete(puzzle(canon3x3), emptyMap()))
    }

    @Test
    fun isComplete_toleratesDanglingWallInsideARegion() {
        // A wall that doesn't disconnect its region leaves the partition unchanged; the web
        // validator accepts it too.
        assertTrue(TentaishowEngine.isComplete(puzzle(canon3x3), solved + ("v:0,0" to 1)))
    }

    @Test
    fun isComplete_falseWhenWallSplitsADot() {
        // Cutting the 2x2 block into two columns runs a wall through the corner dot.
        val values = solved + ("v:0,0" to 1) + ("v:1,0" to 1)
        assertFalse(TentaishowEngine.isComplete(puzzle(canon3x3), values))
    }

    @Test
    fun isComplete_falseWhenRegionNotSymmetric() {
        // 1x3 strip, dot on the edge between cells 0 and 1. With no walls the single region
        // holds exactly one dot (so progress is 100%) but cell 2's partner is off-board.
        val p = puzzle("""{"width":3,"height":1,"dots":[{"dr":1,"dc":2,"color":0}]}""")
        assertEquals(100.0, TentaishowEngine.computeProgress(p, emptyMap()), 1e-9)
        assertFalse(TentaishowEngine.isComplete(p, emptyMap()))
        // Walling off cell 2 leaves it dotless.
        assertFalse(TentaishowEngine.isComplete(p, mapOf("v:0,1" to 1)))
    }

    // -- renderThumbnail ----------------------------------------------------

    @Test
    fun renderThumbnail_paintsEachCellItsGalaxyColor() {
        val p = puzzle(canon3x3)
        val thumb = TentaishowEngine.renderThumbnail(p, TentaishowEngine.extractAnswer(p, solved))
        assertNotNull(thumb)
        val b = TentaishowEngine.REGION_BLACK_ARGB
        val w = TentaishowEngine.REGION_WHITE_ARGB
        assertEquals(3, thumb!!.width)
        assertEquals(3, thumb.height)
        assertArrayEquals(intArrayOf(b, b, w, b, b, w, b, b, w), thumb.cells)
    }

    @Test
    fun pictureCells_groundForUnassignedCells() {
        val board = TentaishowEngine.parseBoard(puzzle(canon3x3))
        val g = TentaishowEngine.GROUND_ARGB
        val w = TentaishowEngine.REGION_WHITE_ARGB
        val cells = TentaishowEngine.pictureCells(board, mapOf("h:0,2" to 1, "v:0,1" to 1))
        assertArrayEquals(intArrayOf(g, g, w, g, g, g, g, g, g), cells)
    }
}
