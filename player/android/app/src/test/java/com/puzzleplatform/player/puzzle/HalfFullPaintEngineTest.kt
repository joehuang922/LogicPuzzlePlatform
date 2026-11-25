package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class HalfFullPaintEngineTest {

    // Unit tests run from the app module directory.
    private fun json(path: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/half-full-paint/$path").readText()) as JsonObject

    private fun puzzle(canon: JsonObject) = Puzzle(
        id = "p1",
        puzzleType = 48,
        puzzleTypeName = "half-full-paint",
        puzzleTypeJpLabel = "半全ペイント",
        difficulty = 1,
        canonRepr = canon,
    )

    /** A sample's solution as userValues ("col,row" -> 1 for shaded cells). */
    private fun solved(name: String): Map<String, Int> {
        val out = HashMap<String, Int>()
        (json("$name.solution.json")["cells"] as JsonArray).forEachIndexed { r, row ->
            (row as JsonArray).forEachIndexed { c, x -> if ((x as JsonPrimitive).int == 1) out["$c,$r"] = 1 }
        }
        return out
    }

    private val samples = listOf(
        "board-half-full-paint-example", "board-half-full-paint-1", "board-half-full-paint-2", "board-half-full-paint-3",
    )
    private val ex = puzzle(json("board-half-full-paint-example.canon.json"))
    private val exBoard = HalfFullPaintEngine.parseBoard(ex)

    @Test
    fun registered() {
        assertEquals(HalfFullPaintEngine, PuzzleEngines.forType(48))
    }

    @Test
    fun parsesWallsAndCircles() {
        assertEquals(4, exBoard.rows)
        assertEquals(6, exBoard.circles.size)
        assertEquals(5, HalfFullPaintEngine.rooms(exBoard).second)
        assertEquals(listOf(1 to 0, 1 to 1, 2 to 0, 2 to 1), HalfFullPaintEngine.circleCells(exBoard, exBoard.circles[2]))
    }

    @Test
    fun samplesSolveAndRoundTrip() {
        for (name in samples) {
            val p = puzzle(json("$name.canon.json"))
            val values = solved(name)
            assertTrue(name, HalfFullPaintEngine.isComplete(p, values))
            // A dot on an unshaded cell rides along in the answer.
            val withDot = if ("0,0" in values) values else values + ("0,0" to HalfFullPaintEngine.DOT)
            val answer = HalfFullPaintEngine.extractAnswer(p, withDot)
            assertEquals(name, withDot, HalfFullPaintEngine.restoreUserValues(p, answer))
        }
    }

    @Test
    fun wrongShadingIsIncomplete() {
        val values = solved("board-half-full-paint-example")
        assertFalse(HalfFullPaintEngine.isComplete(ex, emptyMap()))
        assertFalse(HalfFullPaintEngine.isComplete(ex, values + ("2,3" to 1))) // gray circle at (7,4) sees two shaded
        assertTrue(HalfFullPaintEngine.isComplete(ex, values + ("0,0" to HalfFullPaintEngine.DOT))) // a dot is unshaded
    }

    @Test
    fun liveValidation() {
        assertTrue(HalfFullPaintEngine.brokenClues(exBoard, emptyMap()).circles.isEmpty())
        val solvedBroken = HalfFullPaintEngine.brokenClues(exBoard, solved("board-half-full-paint-example"))
        assertTrue(solvedBroken.circles.isEmpty() && solvedBroken.rooms.isEmpty())
        // White circle (index 1) between R1C3 and R2C3: one shaded cell already ties at best.
        assertTrue(1 in HalfFullPaintEngine.brokenClues(exBoard, mapOf("2,0" to 1)).circles)
        // The L room with 5 shaded and a dot can't be all, none or half.
        val l = mapOf("1,0" to 1, "2,0" to 1, "3,0" to 1, "1,1" to 1, "2,1" to 1, "3,1" to 2)
        assertEquals(1, HalfFullPaintEngine.brokenClues(exBoard, l).rooms.size)
    }

    @Test
    fun progressAndPicture() {
        assertEquals(0.0, HalfFullPaintEngine.computeProgress(ex, emptyMap()), 1e-9)
        assertEquals(200.0 / 16, HalfFullPaintEngine.computeProgress(ex, mapOf("0,0" to 1, "1,0" to 2)), 1e-9)
        val thumb = HalfFullPaintEngine.renderThumbnail(ex, HalfFullPaintEngine.extractAnswer(ex, solved("board-half-full-paint-example")))!!
        assertEquals(4, thumb.width)
        val b = HalfFullPaintEngine.FILL_ARGB
        val w = HalfFullPaintEngine.MARK_ARGB
        assertArrayEquals(
            intArrayOf(w, b, w, w, b, b, w, w, w, b, b, b, w, b, w, b),
            thumb.cells,
        )
        // The live preview leaves unset cells as ground.
        assertEquals(HalfFullPaintEngine.GROUND_ARGB, HalfFullPaintEngine.pictureCells(exBoard, emptyMap())[0])
    }

    @Test
    fun everyCellTakesTheShadeCycle() {
        assertEquals(mapOf("0,0" to 1), ShadeCycle.tap(HalfFullPaintEngine, ex, emptyMap(), 0, 0))
    }
}
