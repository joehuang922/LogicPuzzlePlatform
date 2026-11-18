package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class MinusRoomEngineTest {

    // Unit tests run from the app module directory.
    private fun json(path: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/minus-room/$path").readText()) as JsonObject

    private fun puzzle(canon: JsonObject) = Puzzle(
        id = "p1",
        puzzleType = 39,
        puzzleTypeName = "minus-room",
        puzzleTypeJpLabel = "マイナルーム",
        difficulty = 1,
        canonRepr = canon,
    )

    private fun puzzle(canonJson: String) = puzzle(Json.parseToJsonElement(canonJson) as JsonObject)

    private val samples = listOf("board-minus-room-1", "board-minus-room-2", "board-minus-room-3")
    private val b1 = puzzle(json("board-minus-room-1.canon.json"))
    private val b1Solution = json("board-minus-room-1.solution.json")
    private val solved1 = MinusRoomEngine.restoreUserValues(b1, b1Solution)

    @Test
    fun registered() {
        assertEquals(MinusRoomEngine, PuzzleEngines.forType(39))
    }

    @Test
    fun everySampleSolutionCompletesAt100() {
        for (name in samples) {
            val p = puzzle(json("$name.canon.json"))
            val values = MinusRoomEngine.restoreUserValues(p, json("$name.solution.json"))
            assertTrue(name, MinusRoomEngine.isComplete(p, values))
            assertEquals(name, 100.0, MinusRoomEngine.computeProgress(p, values), 1e-9)
            val errs = MinusRoomEngine.liveErrors(MinusRoomEngine.parseBoard(p), values)
            assertTrue(name, errs.cells.isEmpty() && errs.circles.isEmpty())
        }
    }

    @Test
    fun extractAndRestoreRoundTrip() {
        // The answer is the full grid, givens included; values hold only the player's cells.
        assertEquals(b1Solution, MinusRoomEngine.extractAnswer(b1, solved1))
        assertNull(solved1["1,1"]) // (1,1) holds the given 2
        assertEquals(1, solved1["0,0"])
        assertEquals(22, solved1.size)
    }

    @Test
    fun progressCountsFilledNonGivenCells() {
        assertEquals(0.0, MinusRoomEngine.computeProgress(b1, emptyMap()), 1e-9)
        assertEquals(1.0 / 22 * 100, MinusRoomEngine.computeProgress(b1, mapOf("0,0" to 1)), 1e-9)
        // Values above max don't count.
        assertEquals(0.0, MinusRoomEngine.computeProgress(b1, mapOf("0,0" to 7)), 1e-9)
    }

    @Test
    fun completion_needsEveryRule() {
        assertFalse(MinusRoomEngine.isComplete(b1, solved1 - "0,0"))
        assertFalse(MinusRoomEngine.isComplete(b1, solved1 + ("0,0" to 2)))
        // Rule 4: one room, two separate 1-blocks.
        val one = puzzle("""{"rows":2,"cols":3,"max":2,"cells":[[0,0,0],[0,0,0]],"edges":{"h":[[0,0,0]],"v":[[0,0],[0,0]]},"circles":[]}""")
        assertFalse(MinusRoomEngine.isComplete(one, mapOf("0,0" to 1, "1,0" to 2, "2,0" to 1, "0,1" to 2, "1,1" to 1, "2,1" to 2)))
        // Rule 5: four 1-rooms of 1s make a 2x2.
        val four = puzzle("""{"rows":2,"cols":2,"max":1,"cells":[[0,0],[0,0]],"edges":{"h":[[1,1]],"v":[[1],[1]]},"circles":[]}""")
        assertFalse(MinusRoomEngine.isComplete(four, mapOf("0,0" to 1, "1,0" to 1, "0,1" to 1, "1,1" to 1)))
        // A wrong circle.
        val canon = json("board-minus-room-1.canon.json").toMutableMap()
        canon["circles"] = Json.parseToJsonElement("""[{"dr":1,"dc":0,"value":2}]""")
        assertFalse(MinusRoomEngine.isComplete(puzzle(JsonObject(canon)), solved1))
    }

    @Test
    fun liveErrors() {
        val board = MinusRoomEngine.parseBoard(b1)
        // (2,1) 1 -> 2 makes room B's twos a block of 3.
        assertTrue("1,2" !in MinusRoomEngine.liveErrors(board, solved1).cells)
        assertTrue("2,1" in MinusRoomEngine.liveErrors(board, solved1 + ("1,2" to 2)).cells)
        // A closed block too small is red; an open one isn't.
        assertTrue("0,0" in MinusRoomEngine.liveErrors(board, solved1 + ("0,0" to 3)).cells)
        assertFalse("0,0" in MinusRoomEngine.liveErrors(board, solved1 + ("0,0" to 3) - "0,1").cells)
        val empty = MinusRoomEngine.liveErrors(board, emptyMap())
        assertTrue(empty.cells.isEmpty() && empty.circles.isEmpty())
    }

    @Test
    fun noThumbnail() {
        assertNull(MinusRoomEngine.renderThumbnail(b1, b1Solution))
    }
}
