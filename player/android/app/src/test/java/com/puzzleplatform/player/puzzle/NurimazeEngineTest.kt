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

class NurimazeEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "n1",
        puzzleType = 3,
        puzzleTypeName = "nurimaze",
        puzzleTypeJpLabel = "ぬりめいず",
        difficulty = 3,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 3x3 grid, every interior border thick -> each cell is its own room, so each cell's
    // state can be set independently. S at (0,0), circle at (1,1), G at (2,2).
    //   cells (row,col): [[3,0,0],[0,1,0],[0,0,4]]
    //   h = (rows-1)x cols = 2x3 all thick; v = rows x (cols-1) = 3x2 all thick.
    private val canon3x3 = """{
        "cells":[[3,0,0],[0,1,0],[0,0,4]],
        "grids":{"h":[[1,1,1],[1,1,1]],"v":[[1,1],[1,1],[1,1]]}
    }"""

    // Same geometry but (1,1) is a triangle (forbidden waypoint) instead of a circle.
    private val canon3x3Triangle = """{
        "cells":[[3,0,0],[0,2,0],[0,0,4]],
        "grids":{"h":[[1,1,1],[1,1,1]],"v":[[1,1],[1,1],[1,1]]}
    }"""

    // A valid solution. Non-black cells form the single chain
    // (0,0)->(0,1)->(1,1)->(1,2)->(2,2), i.e. the only S->G route, which passes the
    // circle at (1,1). The remaining cells are black. Keyed "col,row".
    //   state grid (row,col):  2 2 1 / 1 2 2 / 1 1 2
    private val solved = mapOf(
        "0,0" to 2, "1,0" to 2, "2,0" to 1,
        "0,1" to 1, "1,1" to 2, "2,1" to 2,
        "0,2" to 1, "1,2" to 1, "2,2" to 2,
    )

    private fun JsonObject.stateGrid(): List<List<Int>> =
        (this["states"] as JsonArray).map { row -> row.jsonArray.map { it.jsonPrimitive.int } }

    // -- parseCanon ---------------------------------------------------------

    @Test
    fun parseCanon_derivesDimensions() {
        val canon = NurimazeEngine.parseCanon(puzzle(canon3x3))
        assertEquals(3, canon.rows)
        assertEquals(3, canon.cols)
    }

    // -- extractAnswer / restoreUserValues ----------------------------------

    @Test
    fun extractAnswer_emitsFullStateGridIncludingZeros() {
        // Only one cell set; the rest must still be emitted as 0 (web parity).
        val answer = NurimazeEngine.extractAnswer(puzzle(canon3x3), mapOf("1,1" to 2))
        assertEquals(
            listOf(
                listOf(0, 0, 0),
                listOf(0, 2, 0),
                listOf(0, 0, 0),
            ),
            answer.stateGrid(),
        )
    }

    @Test
    fun extractThenRestore_roundTrips() {
        val answer = NurimazeEngine.extractAnswer(puzzle(canon3x3), solved)
        val restored = NurimazeEngine.restoreUserValues(puzzle(canon3x3), answer)
        // Restore drops unset (0) cells; solved has none, so it reproduces exactly.
        assertEquals(solved, restored)
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_countsNonEmptyCellsOverTotal() {
        assertEquals(100.0, NurimazeEngine.computeProgress(puzzle(canon3x3), solved), 1e-9)
        assertEquals(0.0, NurimazeEngine.computeProgress(puzzle(canon3x3), emptyMap()), 1e-9)
        // 3 of 9 cells set -> 33.33%.
        val partial = mapOf("0,0" to 2, "1,1" to 2, "2,2" to 2)
        assertEquals(100.0 / 3.0, NurimazeEngine.computeProgress(puzzle(canon3x3), partial), 1e-9)
    }

    // -- cycleRoom ----------------------------------------------------------

    @Test
    fun cycleRoom_normalRoomCyclesUnsetBlackMarked() {
        val p = puzzle(canon3x3)
        // Normal cell (col=0,row=1): unset -> black.
        assertEquals(mapOf("0,1" to 1), NurimazeEngine.cycleRoom(p, emptyMap(), 0, 1))
        // black -> marked.
        assertEquals(mapOf("0,1" to 2), NurimazeEngine.cycleRoom(p, mapOf("0,1" to 1), 0, 1))
        // marked -> unset (0 means the caller removes the key).
        assertEquals(mapOf("0,1" to 0), NurimazeEngine.cycleRoom(p, mapOf("0,1" to 2), 0, 1))
    }

    @Test
    fun cycleRoom_specialRoomTogglesUnsetMarkedOnly() {
        val p = puzzle(canon3x3)
        // S cell (col=0,row=0) can never be black: unset -> marked.
        assertEquals(mapOf("0,0" to 2), NurimazeEngine.cycleRoom(p, emptyMap(), 0, 0))
        // marked -> unset.
        assertEquals(mapOf("0,0" to 0), NurimazeEngine.cycleRoom(p, mapOf("0,0" to 2), 0, 0))
    }

    @Test
    fun cycleRoom_setsEveryCellOfAMultiCellRoom() {
        // 1x2 grid, no vertical border between the two cells -> one room of two cells.
        val p = puzzle("""{"cells":[[0,0]],"grids":{"h":[],"v":[[0]]}}""")
        // Tapping either cell cycles both to black together.
        assertEquals(mapOf("0,0" to 1, "1,0" to 1), NurimazeEngine.cycleRoom(p, emptyMap(), 0, 0))
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForValidSolution() {
        assertTrue(NurimazeEngine.isComplete(puzzle(canon3x3), solved))
    }

    @Test
    fun isComplete_falseWhenARoomIsUnset() {
        assertFalse(NurimazeEngine.isComplete(puzzle(canon3x3), solved - "0,2"))
    }

    @Test
    fun isComplete_falseWhenAll2x2NonBlack() {
        // Every cell marked -> every 2x2 block is all-non-black, violating the rule.
        val allMarked = (0 until 3).flatMap { r -> (0 until 3).map { c -> "$c,$r" to 2 } }.toMap()
        assertFalse(NurimazeEngine.isComplete(puzzle(canon3x3), allMarked))
    }

    @Test
    fun isComplete_falseWhenShortestPathHitsTriangle() {
        // Same geometry/states, but the forced S->G chain now passes a triangle at (1,1).
        assertFalse(NurimazeEngine.isComplete(puzzle(canon3x3Triangle), solved))
    }
}
