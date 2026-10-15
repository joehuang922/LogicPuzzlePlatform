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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class YajilinEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "y1",
        puzzleType = 13,
        puzzleTypeName = "yajilin",
        puzzleTypeJpLabel = "Yajilin",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 3 rows x 4 cols with one up-arrow clue (no blacks above it in the solution):
    //   .  .  .  B
    //   .  ↑n .  .
    //   .  .  .  .
    private fun canon(num: Int = 0) = """{"cells":[
        [null,null,null,null],
        [null,{"dir":"up","num":$num},null,null],
        [null,null,null,null]]}"""

    // Black at (0,3); the loop rings the other 10 non-clue cells:
    //   (0,0)-(0,1)-(0,2)-(1,2)-(1,3)-(2,3)-(2,2)-(2,1)-(2,0)-(1,0)-(0,0)
    private val solved = mapOf(
        "b:0,3" to 1,
        "h:0,0" to 1, "h:0,1" to 1, "v:0,2" to 1, "h:1,2" to 1, "v:1,3" to 1,
        "h:2,2" to 1, "h:2,1" to 1, "h:2,0" to 1, "v:1,0" to 1, "v:0,0" to 1,
    )

    @Test
    fun parseCells_readsClues() {
        val cells = YajilinEngine.parseCells(puzzle(canon(2)))
        assertEquals(3, cells.size)
        assertEquals(YajilinEngine.Clue(YajilinEngine.Dir.UP, 2), cells[1][1])
        assertNull(cells[0][0])
    }

    @Test
    fun isComplete_acceptsSolution() {
        assertTrue(YajilinEngine.isComplete(puzzle(canon()), solved))
    }

    @Test
    fun isComplete_ignoresMarksOnLoopCells() {
        assertTrue(YajilinEngine.isComplete(puzzle(canon()), solved + ("b:2,2" to 2)))
    }

    @Test
    fun isComplete_rejectsOpenLoop() {
        assertFalse(YajilinEngine.isComplete(puzzle(canon()), solved - "h:2,1"))
    }

    @Test
    fun isComplete_rejectsWrongClueCount() {
        assertFalse(YajilinEngine.isComplete(puzzle(canon(num = 1)), solved))
    }

    @Test
    fun isComplete_rejectsUnusedCell() {
        // Unshading (0,3) leaves it neither black nor on the loop.
        assertFalse(YajilinEngine.isComplete(puzzle(canon()), solved - "b:0,3"))
    }

    @Test
    fun isComplete_rejectsAdjacentBlacks() {
        // A separate 1x3 board: black, black, clue — nothing else to satisfy, so only
        // adjacency (and the missing loop) can fail it.
        val p = puzzle("""{"cells":[[null,null,{"dir":"left","num":2}]]}""")
        assertFalse(YajilinEngine.isComplete(p, mapOf("b:0,0" to 1, "b:0,1" to 1)))
    }

    @Test
    fun computeProgress_countsShadedMarkedAndLoopCells() {
        val p = puzzle(canon())
        assertEquals(0.0, YajilinEngine.computeProgress(p, emptyMap()), 1e-9)
        assertEquals(100.0, YajilinEngine.computeProgress(p, solved), 1e-9)
        // One mark + one segment (two cells) = 3 of 11 non-clue cells.
        val partial = mapOf("b:2,3" to 2, "h:0,0" to 1)
        assertEquals(3.0 / 11 * 100, YajilinEngine.computeProgress(p, partial), 1e-9)
    }

    @Test
    fun extractAndRestore_roundTrip() {
        val p = puzzle(canon())
        val values = solved + ("b:2,2" to 2)
        val answer = YajilinEngine.extractAnswer(p, values)
        val blacks = (answer["blacks"] as JsonArray).map { row -> row.jsonArray.map { it.jsonPrimitive.int } }
        assertEquals(listOf(0, 0, 0, 1), blacks[0])
        assertEquals(listOf(0, 0, 2, 0), blacks[2])
        val h = answer["edges"]!!.jsonObject["h"]!!.jsonArray
        assertEquals(3, h.size)
        assertEquals(3, h[0].jsonArray.size)
        val v = answer["edges"]!!.jsonObject["v"]!!.jsonArray
        assertEquals(2, v.size)
        assertEquals(4, v[0].jsonArray.size)
        assertEquals(values, YajilinEngine.restoreUserValues(p, answer))
    }

    @Test
    fun tap_cyclesEmptyCellsAndIgnoresClues() {
        val p = puzzle(canon())
        assertEquals(mapOf("b:0,2" to 1), ShadeCycle.tap(YajilinEngine, p, emptyMap(), col = 2, row = 0))
        assertEquals(mapOf("b:0,2" to 2), ShadeCycle.tap(YajilinEngine, p, mapOf("b:0,2" to 1), col = 2, row = 0))
        assertEquals(emptyMap<String, Int>(), ShadeCycle.tap(YajilinEngine, p, emptyMap(), col = 1, row = 1))
    }

    @Test
    fun canDrawEdge_refusesCluesBlacksAndFullCells() {
        val p = puzzle(canon())
        val cells = YajilinEngine.parseCells(p)
        val g = YajilinEngine.grids(3, 4, mapOf("b:0,3" to 1, "b:2,3" to 2, "h:0,0" to 1, "h:0,1" to 1))
        assertFalse(YajilinEngine.canDrawEdge(cells, g, 1, 1)) // clue
        assertFalse(YajilinEngine.canDrawEdge(cells, g, 0, 3)) // blackened
        assertFalse(YajilinEngine.canDrawEdge(cells, g, 0, 1)) // already two segments
        assertTrue(YajilinEngine.canDrawEdge(cells, g, 0, 0)) // one segment
        assertTrue(YajilinEngine.canDrawEdge(cells, g, 2, 3)) // marked is fine
    }
}
