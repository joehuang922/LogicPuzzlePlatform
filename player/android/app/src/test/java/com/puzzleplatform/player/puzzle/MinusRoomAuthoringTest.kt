package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.MinusRoomEngine.Circle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class MinusRoomAuthoringTest {

    // Unit tests run from the app module directory.
    private fun sample(name: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/minus-room/$name.canon.json").readText()) as JsonObject

    private val empty3 = MinusRoomAuthoring.draftFromCanon(
        Json.parseToJsonElement("""{"rows":3,"cols":3,"max":3,"cells":[],"edges":{"h":[],"v":[]},"circles":[]}""") as JsonObject
    )

    @Test
    fun samples_roundTripThroughTheDraft() {
        for ((name, size) in listOf("board-minus-room-1" to 5, "board-minus-room-2" to 6, "board-minus-room-3" to 8)) {
            val canon = sample(name)
            val board = BoardDraft.fromCanon(AuthoringType.MINUS_ROOM, canon)
            assertEquals(name, CanonBoard(canon, size, size), board.toCanon(AuthoringType.MINUS_ROOM))
            assertEquals(name, emptyList<String>(), board.problems(AuthoringType.MINUS_ROOM))
        }
    }

    @Test
    fun draftFromCanon_fillsMissingGrids() {
        assertEquals(3, empty3.cells.size)
        assertEquals(2, empty3.h.size)
        assertEquals(listOf(0, 0), empty3.v[2])
    }

    @Test
    fun edits() {
        var d = MinusRoomAuthoring.setGiven(empty3, 1, 2, 3)
        assertEquals(3, d.given(1, 2))
        d = MinusRoomAuthoring.toggleWall(d, "h:0,1")
        assertEquals(1, d.h[0][1])
        assertEquals(0, MinusRoomAuthoring.toggleWall(d, "h:0,1").h[0][1])
        d = MinusRoomAuthoring.toggleWall(d, "v:2,1")
        assertEquals(1, d.v[2][1])
        assertEquals(1 to 2, MinusRoomAuthoring.edgeOf("h:0,1"))
        assertEquals(4 to 3, MinusRoomAuthoring.edgeOf("v:2,1"))
        d = MinusRoomAuthoring.setCircle(d, 1, 2, 0)
        assertEquals(listOf(Circle(1, 2, 0)), d.circles)
        assertTrue(MinusRoomAuthoring.setCircle(d, 1, 2, null).circles.isEmpty())
        assertEquals(5, MinusRoomAuthoring.setMax(d, 5).max)
        assertEquals(3, MinusRoomAuthoring.setMax(d, null).max)
        assertEquals(0, MinusRoomAuthoring.parseDifference("0"))
        assertEquals(null, MinusRoomAuthoring.parseNumber("0"))
    }

    @Test
    fun resize_keepsWhatFits() {
        val d = MinusRoomAuthoring.setCircle(MinusRoomAuthoring.setCircle(empty3, 3, 4, 1), 0, 1, 2)
        val smaller = MinusRoomAuthoring.removeLastRow(d)
        assertEquals(2, smaller.rows)
        assertEquals(listOf(Circle(0, 1, 2)), smaller.circles)
        assertEquals(1, smaller.h.size)
        val bigger = MinusRoomAuthoring.addCol(d)
        assertTrue(bigger.cells.all { it.size == 4 } && bigger.v.all { it.size == 3 })
    }

    @Test
    fun problems_formatAndWarnings() {
        assertEquals(listOf("No givens or circles"), MinusRoomAuthoring.problems(empty3))
        // A wall stub in one room.
        val stub = MinusRoomAuthoring.toggleWall(empty3, "v:0,0")
        assertEquals(listOf("1 wall ends inside a room"), MinusRoomAuthoring.formatProblems(stub))
        val bad = empty3.copy(
            cells = listOf(listOf(4, 0, 0), listOf(0, 0, 0), listOf(0, 0, 0)),
            circles = listOf(Circle(0, 0, 1), Circle(1, 0, 3)),
        )
        val format = MinusRoomAuthoring.formatProblems(bad)
        assertTrue(format.any { "above 3" in it })
        assertTrue(format.any { "not on an edge" in it })
        assertTrue(format.any { "3 or more" in it })
        assertEquals(format, BoardDraft(minusRoom = bad).formatProblems(AuthoringType.MINUS_ROOM))
        // A given bigger than its room is a warning.
        val big = MinusRoomAuthoring.setGiven(MinusRoomAuthoring.toggleWall(MinusRoomAuthoring.toggleWall(empty3, "h:0,0"), "v:0,0"), 0, 0, 3)
        assertEquals(listOf("Given 3 at (0,0) is bigger than its room"), MinusRoomAuthoring.problems(big))
    }
}
