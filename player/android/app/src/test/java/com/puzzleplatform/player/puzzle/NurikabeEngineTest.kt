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

class NurikabeEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "n1",
        puzzleType = 24,
        puzzleTypeName = "nurikabe",
        puzzleTypeJpLabel = "Nurikabe",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 3x3 grid with a 1-clue top-left and a 4-clue bottom-right.
    //   1 . .
    //   . . .
    //   . . 4
    private val canon3x3 = """{"cells":[[1,0,0],[0,0,0],[0,0,4]]}"""

    // The intended solution (hand-verified). Keys are "col,row" (web convention), value
    // 1 = black (sea). Island cells stay white (unset), which is a complete Nurikabe:
    //   island-1 = {(0,0)}; island-4 = {(1,2),(2,0),(2,1),(2,2)} (an L across the bottom);
    //   the 4 black cells (0,1)(0,2)(1,0)(1,1) form one connected sea with no 2x2 pool.
    private val solved = mapOf(
        "1,0" to 1, "2,0" to 1, "0,1" to 1, "1,1" to 1,
    )

    // -- parseCells ---------------------------------------------------------

    @Test
    fun parseCells_readsClueGrid() {
        val cells = NurikabeEngine.parseCells(puzzle(canon3x3))
        assertEquals(3, cells.size)
        assertEquals(1, cells[0][0])
        assertEquals(4, cells[2][2])
        assertTrue(NurikabeEngine.isClue(cells, 0, 0))
        assertFalse(NurikabeEngine.isClue(cells, 1, 1))
    }

    // -- extractAnswer ------------------------------------------------------

    @Test
    fun extractAnswer_buildsStatesGrid() {
        val answer = NurikabeEngine.extractAnswer(puzzle(canon3x3), solved)
        val states = (answer["states"] as JsonArray).map { row -> row.jsonArray.map { it.jsonPrimitive.int } }
        assertEquals(listOf(0, 1, 1), states[0])
        assertEquals(listOf(1, 1, 0), states[1])
        assertEquals(listOf(0, 0, 0), states[2])
    }

    @Test
    fun extractAnswer_forcesClueCellsWhite() {
        // A stray value landing on a read-only clue cell must never reach the answer.
        val answer = NurikabeEngine.extractAnswer(puzzle(canon3x3), mapOf("0,0" to 1, "2,2" to 1))
        val states = (answer["states"] as JsonArray).map { row -> row.jsonArray.map { it.jsonPrimitive.int } }
        assertEquals(0, states[0][0]) // clue 1
        assertEquals(0, states[2][2]) // clue 4
    }

    @Test
    fun extractAnswer_persistsWhiteMarks() {
        // White-marks (state 2) live in the same states grid the web extractor emits.
        val answer = NurikabeEngine.extractAnswer(puzzle(canon3x3), mapOf("1,0" to 1, "0,2" to 2))
        val states = (answer["states"] as JsonArray).map { row -> row.jsonArray.map { it.jsonPrimitive.int } }
        assertEquals(1, states[0][1]) // black
        assertEquals(2, states[2][0]) // white-marked
    }

    // -- restoreUserValues (round-trip) ------------------------------------

    @Test
    fun restore_roundTripsThroughExtract() {
        val p = puzzle(canon3x3)
        assertEquals(solved, NurikabeEngine.restoreUserValues(p, NurikabeEngine.extractAnswer(p, solved)))
    }

    @Test
    fun restore_roundTripsMarks() {
        val p = puzzle(canon3x3)
        val input = mapOf("1,0" to 1, "0,2" to 2, "1,2" to 2)
        assertEquals(input, NurikabeEngine.restoreUserValues(p, NurikabeEngine.extractAnswer(p, input)))
    }

    @Test
    fun restore_skipsClueCells() {
        // A hand-crafted answer that (illegally) paints a clue cell is ignored on restore.
        val p = puzzle(canon3x3)
        val answer = Json.parseToJsonElement(
            """{"states":[[1,1,0],[0,0,0],[0,0,0]]}""",
        ) as JsonObject
        // (0,0) is a clue cell, so only the (1,0) black survives.
        assertEquals(mapOf("1,0" to 1), NurikabeEngine.restoreUserValues(p, answer))
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_zeroForEmptyBoard() {
        assertEquals(0.0, NurikabeEngine.computeProgress(puzzle(canon3x3), emptyMap()), 0.0)
    }

    @Test
    fun computeProgress_excludesClueCells() {
        // 9 cells minus 2 clues = 7 decidable cells; the solution paints 4 of them black.
        assertEquals(4.0 / 7.0 * 100.0, NurikabeEngine.computeProgress(puzzle(canon3x3), solved), 1e-6)
    }

    @Test
    fun computeProgress_countsMarks() {
        // Both black (1) and white-marked (2) count as "decided".
        val input = mapOf("1,0" to 1, "0,2" to 2)
        assertEquals(2.0 / 7.0 * 100.0, NurikabeEngine.computeProgress(puzzle(canon3x3), input), 1e-6)
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForValidSolution() {
        assertTrue(NurikabeEngine.isComplete(puzzle(canon3x3), solved))
    }

    @Test
    fun isComplete_marksDoNotAffectAValidSolution() {
        // Flagging island cells as white-marked leaves the solution valid: a mark (2) counts
        // as white, exactly like an unpainted island cell. (1,2) and (2,2) are island-4 cells.
        val withMarks = solved + mapOf("1,2" to 2, "2,2" to 2)
        assertTrue(NurikabeEngine.isComplete(puzzle(canon3x3), withMarks))
    }

    @Test
    fun isComplete_falseWhenSeaIsDisconnected() {
        // Dropping the central black cell splits the sea (and breaks the island sizes).
        assertFalse(NurikabeEngine.isComplete(puzzle(canon3x3), solved - "1,1"))
    }

    @Test
    fun isComplete_falseWhenAnIslandIsWrongSize() {
        // Painting one island cell black shrinks the 4-island to 3 -> clue != size.
        assertFalse(NurikabeEngine.isComplete(puzzle(canon3x3), solved + ("0,2" to 1)))
    }

    @Test
    fun isComplete_falseForTwoByTwoPool() {
        // A 2x2 block of black cells is a forbidden "pool".
        val pool = puzzle("""{"cells":[[1,0,0],[0,0,0],[0,0,0]]}""")
        val states = mapOf("1,1" to 1, "2,1" to 1, "1,2" to 1, "2,2" to 1)
        assertFalse(NurikabeEngine.isComplete(pool, states))
    }

    @Test
    fun isComplete_falseForEmptyBoard() {
        assertFalse(NurikabeEngine.isComplete(puzzle(canon3x3), emptyMap()))
    }
}
