package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class MelonPieEngineTest {

    // Unit tests run from the app module directory.
    private fun json(path: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/melon-pie/$path").readText()) as JsonObject

    private fun puzzle(canon: JsonObject) = Puzzle(
        id = "p1",
        puzzleType = 49,
        puzzleTypeName = "melon-pie",
        puzzleTypeJpLabel = "メロンパイ",
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

    private val samples = listOf("board-melon-pie-example", "board-melon-pie-1", "board-melon-pie-2", "board-melon-pie-3")
    private val ex = puzzle(json("board-melon-pie-example.canon.json"))
    private val exBoard = MelonPieEngine.parseBoard(ex)

    @Test
    fun registered() {
        assertEquals(MelonPieEngine, PuzzleEngines.forType(49))
    }

    @Test
    fun samplesSolveAndRoundTrip() {
        for (name in samples) {
            val p = puzzle(json("$name.canon.json"))
            val values = solved(name)
            assertTrue(name, MelonPieEngine.isComplete(p, values))
            val withMark = if ("h:2,0" in values) values else values + ("h:2,0" to MelonPieEngine.CROSS)
            val answer = MelonPieEngine.extractAnswer(p, withMark)
            assertEquals(name, withMark, MelonPieEngine.restoreUserValues(p, answer))
            assertTrue(name, MelonPieEngine.isComplete(p, withMark)) // a × isn't a line
        }
    }

    @Test
    fun strandsGoStraightThroughCrossings() {
        val seg = MelonPieEngine.segments(exBoard, solved("board-melon-pie-example"))
        val black = MelonPieEngine.strandFrom(exBoard, seg, 0 to 0)
        assertEquals(4 to 0, black.to)
        assertTrue("v:1,1" in black.segments && "v:2,1" in black.segments)
        assertEquals(2 to 2, MelonPieEngine.strandFrom(exBoard, seg, 1 to 0).to)
    }

    @Test
    fun wrongLinesAreIncomplete() {
        val values = solved("board-melon-pie-example")
        assertFalse(MelonPieEngine.isComplete(ex, values - "h:0,0"))
        assertFalse(MelonPieEngine.isComplete(ex, emptyMap()))
        // Two right pairs at opposite ends of a 3x1 board, not one connected whole.
        val twin = puzzle(Json.parseToJsonElement(
            """{"width":3,"height":1,"circles":[{"r":0,"c":0,"color":1},{"r":1,"c":0,"color":1},
               {"r":0,"c":3,"color":0},{"r":1,"c":3,"color":0}]}"""
        ) as JsonObject)
        assertFalse(MelonPieEngine.isComplete(twin, mapOf("v:0,0" to 1, "v:0,3" to 1)))
    }

    @Test
    fun liveValidation() {
        assertTrue(MelonPieEngine.brokenClues(exBoard, emptyMap()).circles.isEmpty())
        assertTrue(MelonPieEngine.brokenClues(exBoard, solved("board-melon-pie-example")).circles.isEmpty())
        // Black (0,0) joined to the gray circle at (1,0).
        val wrong = MelonPieEngine.brokenClues(exBoard, mapOf("v:0,0" to 1))
        assertTrue(0 in wrong.circles && 2 in wrong.circles)
        val branch = MelonPieEngine.brokenClues(exBoard, mapOf("h:3,1" to 1, "h:3,2" to 1, "v:3,2" to 1))
        assertTrue((3 to 2) in branch.points)
    }

    @Test
    fun progressCountsConnectedCircles() {
        assertEquals(0.0, MelonPieEngine.computeProgress(ex, emptyMap()), 1e-9)
        assertEquals(100.0, MelonPieEngine.computeProgress(ex, solved("board-melon-pie-example")), 1e-9)
        // The black pair (1,3)-(4,3) only.
        assertEquals(25.0, MelonPieEngine.computeProgress(ex, mapOf("v:1,3" to 1, "v:2,3" to 1, "v:3,3" to 1)), 1e-9)
    }
}
