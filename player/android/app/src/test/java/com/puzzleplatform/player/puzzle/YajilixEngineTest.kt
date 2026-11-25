package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class YajilixEngineTest {

    // Unit tests run from the app module directory.
    private fun json(path: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/yajilix/$path").readText()) as JsonObject

    private fun puzzle(canon: JsonObject) = Puzzle(
        id = "p1",
        puzzleType = 46,
        puzzleTypeName = "yajilix",
        puzzleTypeJpLabel = "ヤジリックス",
        difficulty = 1,
        canonRepr = canon,
    )

    /** A sample's solution as userValues ("h:r,c" / "v:r,c" -> 1). */
    private fun solved(name: String): Map<String, Int> {
        val edges = json("$name.solution.json")["edges"] as JsonObject
        val out = HashMap<String, Int>()
        for ((kind, grid) in listOf("h" to edges["h"], "v" to edges["v"])) {
            (grid as JsonArray).forEachIndexed { r, row ->
                (row as JsonArray).forEachIndexed { c, x -> if ((x as JsonPrimitive).int == 1) out["$kind:$r,$c"] = 1 }
            }
        }
        return out
    }

    private val samples = listOf("board-yajilix-example", "board-yajilix-1", "board-yajilix-2", "board-yajilix-3")
    private val ex = puzzle(json("board-yajilix-example.canon.json"))
    private val exBoard = YajilixEngine.parseBoard(ex)

    @Test
    fun registered() {
        assertEquals(YajilixEngine, PuzzleEngines.forType(46))
    }

    @Test
    fun parsesClues() {
        assertEquals(6, exBoard.rows)
        assertEquals(YajilixEngine.Clue('L', 2, YajilixEngine.Dir.UP), exBoard.clue(2, 0))
        assertEquals(YajilixEngine.Clue('X', 1, YajilixEngine.Dir.LEFT), exBoard.clue(0, 4))
        assertNull(exBoard.clue(0, 0))
        // X1← at R5C6 skips the L2← clue at R5C4.
        assertEquals(listOf(4 to 4, 4 to 2, 4 to 1, 4 to 0), YajilixEngine.lineCells(exBoard, 4, 5, YajilixEngine.Dir.LEFT))
    }

    @Test
    fun samplesSolveAndRoundTrip() {
        for (name in samples) {
            val p = puzzle(json("$name.canon.json"))
            val values = solved(name)
            assertTrue(name, YajilixEngine.isComplete(p, values))
            val withMark = values + ("m:0,0" to YajilixEngine.CROSS)
            val answer = YajilixEngine.extractAnswer(p, withMark)
            assertEquals(name, withMark.filterValues { it != 0 }, YajilixEngine.restoreUserValues(p, answer))
            assertEquals(json("$name.solution.json")["edges"], answer["edges"])
        }
    }

    @Test
    fun wrongLoopsAreIncomplete() {
        val values = solved("board-yajilix-example")
        assertFalse(YajilixEngine.isComplete(ex, values - "h:0,0"))
        assertFalse(YajilixEngine.isComplete(ex, emptyMap()))
        // A 2x2 ring in the bottom-left corner is one loop but breaks clues.
        val small = mapOf("h:4,0" to 1, "h:5,0" to 1, "v:4,0" to 1, "v:4,1" to 1)
        assertFalse(YajilixEngine.isComplete(ex, small))
    }

    @Test
    fun liveValidation() {
        assertTrue(YajilixEngine.brokenClues(exBoard, emptyMap()).clues.isEmpty())
        assertTrue(YajilixEngine.brokenClues(exBoard, solved("board-yajilix-example")).clues.isEmpty())
        // Two crosses left of X1← at R1C5.
        val crosses = mapOf("m:0,0" to YajilixEngine.CROSS, "m:0,1" to YajilixEngine.CROSS)
        assertTrue((0 to 4) in YajilixEngine.brokenClues(exBoard, crosses).clues)
        // L2↑ at R3C1: R2C1 going straight leaves one possible turn.
        val straight = mapOf("v:0,0" to 1, "v:1,0" to 1)
        assertTrue((2 to 0) in YajilixEngine.brokenClues(exBoard, straight).clues)
        // A ring through the clue cell R1C5.
        val through = mapOf("h:0,3" to 1, "h:1,3" to 1, "v:0,3" to 1, "v:0,4" to 1)
        assertTrue((0 to 4) in YajilixEngine.brokenClues(exBoard, through).cells)
    }

    @Test
    fun progressCountsEmptyCellsTouchedOrMarked() {
        assertEquals(0.0, YajilixEngine.computeProgress(ex, emptyMap()), 1e-9)
        // 30 empty cells: the loop touches 24, and R6C6 carries a ×.
        val values = solved("board-yajilix-example") + ("m:5,5" to YajilixEngine.CROSS)
        assertEquals(25.0 / 30 * 100, YajilixEngine.computeProgress(ex, values), 1e-9)
    }

    @Test
    fun clueCellsTakeNoMarks() {
        assertNull(YajilixEngine.shadeGroup(ex, 4, 0))
        assertEquals(ShadeGroup(listOf(0 to 0)), YajilixEngine.shadeGroup(ex, 0, 0))
        assertEquals(mapOf("m:0,0" to YajilixEngine.CROSS), ShadeCycle.tap(YajilixEngine, ex, emptyMap(), 0, 0))
        assertTrue(ShadeCycle.tap(YajilixEngine, ex, emptyMap(), 4, 0).isEmpty())
    }
}
