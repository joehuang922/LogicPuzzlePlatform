package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NuritwinEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "n1",
        puzzleType = 9,
        puzzleTypeName = "nuritwin",
        puzzleTypeJpLabel = "Nuritwin",
        difficulty = 3,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 3x4 board split into two rooms by thick borders (brute-force-verified to be solvable).
    //   roomIds:  0 0 0 1 / 0 0 0 1 / 0 0 1 1
    //   h = (rows-1)x cols = 2x4; v = rows x (cols-1) = 3x3.
    private val canon3x4 = """{
        "cells":[[0,0,0,0],[0,0,0,0],[0,0,0,0]],
        "grids":{"h":[[0,0,0,0],[0,0,1,0]],"v":[[0,0,1],[0,0,1],[0,1,0]]}
    }"""

    // Same geometry, with a size-1 twin clue in each room (room 0 at (0,0), room 1 at (0,3)).
    private val canon3x4Clue1 = """{
        "cells":[[1,0,0,1],[0,0,0,0],[0,0,0,0]],
        "grids":{"h":[[0,0,0,0],[0,0,1,0]],"v":[[0,0,1],[0,0,1],[0,1,0]]}
    }"""

    // Same geometry, clue of 2 in each room (unsatisfiable by the size-1 solution below).
    private val canon3x4Clue2 = """{
        "cells":[[2,0,0,2],[0,0,0,0],[0,0,0,0]],
        "grids":{"h":[[0,0,0,0],[0,0,1,0]],"v":[[0,0,1],[0,0,1],[0,1,0]]}
    }"""

    // A valid solution (keyed "col,row"). Black (r,c) = (1,2),(1,3),(2,1),(2,2). Each room
    // holds two size-1 black components; globally the four black cells form one chain; no
    // 2x2 is all black.
    private val solved = mapOf("2,1" to 1, "3,1" to 1, "1,2" to 1, "2,2" to 1)

    private fun JsonObject.stateGrid(): List<List<Int>> =
        (this["states"] as JsonArray).map { row -> row.jsonArray.map { it.jsonPrimitive.int } }

    // -- parseCanon / computeRooms ------------------------------------------

    @Test
    fun parseCanon_derivesDimensions() {
        val canon = NuritwinEngine.parseCanon(puzzle(canon3x4))
        assertEquals(3, canon.rows)
        assertEquals(4, canon.cols)
    }

    @Test
    fun computeRooms_splitsOnThickBorders() {
        val canon = NuritwinEngine.parseCanon(puzzle(canon3x4))
        val rooms = NuritwinEngine.computeRooms(canon)
        // Two rooms, matching the hand-verified roomIds layout.
        assertEquals(2, rooms.flatMap { it.toList() }.toSet().size)
        assertEquals(rooms[0][0], rooms[2][1]) // both in room 0
        assertEquals(rooms[0][3], rooms[2][2]) // both in room 1
    }

    @Test
    fun computeRooms_oneRoomWhenNoBorders() {
        val canon = NuritwinEngine.parseCanon(puzzle("""{"cells":[[0,0],[0,0]],"grids":{"h":[[0,0]],"v":[[0],[0]]}}"""))
        val rooms = NuritwinEngine.computeRooms(canon)
        assertEquals(setOf(0), rooms.flatMap { it.toList() }.toSet())
    }

    // -- extractAnswer / restoreUserValues ----------------------------------

    @Test
    fun extractAnswer_emitsFullStateGridIncludingZeros() {
        val answer = NuritwinEngine.extractAnswer(puzzle(canon3x4), mapOf("2,1" to 1))
        assertEquals(
            listOf(
                listOf(0, 0, 0, 0),
                listOf(0, 0, 1, 0),
                listOf(0, 0, 0, 0),
            ),
            answer.stateGrid(),
        )
    }

    @Test
    fun extractAnswer_persistsMarks() {
        val answer = NuritwinEngine.extractAnswer(puzzle(canon3x4), mapOf("0,0" to 2, "1,0" to 1))
        assertEquals(2, answer.stateGrid()[0][0]) // marked
        assertEquals(1, answer.stateGrid()[0][1]) // black
    }

    @Test
    fun extractThenRestore_roundTrips() {
        val p = puzzle(canon3x4)
        val input = solved + ("0,0" to 2)
        assertEquals(input, NuritwinEngine.restoreUserValues(p, NuritwinEngine.extractAnswer(p, input)))
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_countsNonEmptyCellsOverTotal() {
        assertEquals(0.0, NuritwinEngine.computeProgress(puzzle(canon3x4), emptyMap()), 1e-9)
        // 4 of 12 cells set.
        assertEquals(4.0 / 12.0 * 100.0, NuritwinEngine.computeProgress(puzzle(canon3x4), solved), 1e-9)
    }

    @Test
    fun computeProgress_countsMarksAsDecided() {
        val input = mapOf("0,0" to 2, "1,0" to 1)
        assertEquals(2.0 / 12.0 * 100.0, NuritwinEngine.computeProgress(puzzle(canon3x4), input), 1e-9)
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForValidTwin() {
        assertTrue(NuritwinEngine.isComplete(puzzle(canon3x4), solved))
    }

    @Test
    fun isComplete_trueWhenComponentSizesMatchClue() {
        // Each room's two components are size 1, matching the clue of 1.
        assertTrue(NuritwinEngine.isComplete(puzzle(canon3x4Clue1), solved))
    }

    @Test
    fun isComplete_marksCountAsWhite() {
        // Marking an unused white cell leaves the solution valid (2 reads as white).
        assertTrue(NuritwinEngine.isComplete(puzzle(canon3x4), solved + ("0,0" to 2)))
    }

    @Test
    fun isComplete_falseWhenComponentSizeDiffersFromClue() {
        // Components are size 1 but the clue demands 2.
        assertFalse(NuritwinEngine.isComplete(puzzle(canon3x4Clue2), solved))
    }

    @Test
    fun isComplete_falseWhenGlobalBlackDisconnected() {
        // Per-room twin still holds, but moving one black cell splits the global sea:
        // black (r,c) = (1,2),(1,3),(2,0),(2,2) -> (2,0) is an isolated component.
        val near = mapOf("2,1" to 1, "3,1" to 1, "0,2" to 1, "2,2" to 1)
        assertFalse(NuritwinEngine.isComplete(puzzle(canon3x4), near))
    }

    @Test
    fun isComplete_falseWhenRoomHasOneComponent() {
        // Dropping (2,1)->"1,2" leaves room 0 with a single black cell: one component, not two.
        assertFalse(NuritwinEngine.isComplete(puzzle(canon3x4), solved - "1,2"))
    }

    @Test
    fun isComplete_falseWhenComponentsUnequal() {
        // Adding (0,2)->"2,0" makes room 0's black a size-2 comp plus a size-1 comp: unequal.
        assertFalse(NuritwinEngine.isComplete(puzzle(canon3x4), solved + ("2,0" to 1)))
    }

    @Test
    fun isComplete_falseForEmptyBoard() {
        assertFalse(NuritwinEngine.isComplete(puzzle(canon3x4), emptyMap()))
    }

    @Test
    fun isComplete_falseForTwoByTwoPool() {
        // 2x2 single room; all four black is a forbidden pool.
        val p = puzzle("""{"cells":[[0,0],[0,0]],"grids":{"h":[[0,0]],"v":[[0],[0]]}}""")
        assertFalse(NuritwinEngine.isComplete(p, mapOf("0,0" to 1, "1,0" to 1, "0,1" to 1, "1,1" to 1)))
    }
}
