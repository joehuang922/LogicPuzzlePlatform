package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.UnequalSudokuEngine.Gap
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Engine checks on sample board 1 (Question 60), whose one solution is [SOLUTION]. */
class UnequalSudokuEngineTest {

    private fun puzzle(canon: JsonObject) = Puzzle(
        id = "q60",
        puzzleType = 29,
        puzzleTypeName = "unequal-sudoku",
        puzzleTypeJpLabel = "不等号ナンプレ",
        difficulty = 3,
        canonRepr = canon,
    )

    private val q60 = puzzle(sampleCanon(1))
    private val hints = UnequalSudokuEngine.parseHints(q60)

    /** The player's entries that complete [SOLUTION] around the givens. */
    private fun solvedValues(): Map<String, Int> = buildMap {
        for (r in 0 until 9) for (c in 0 until 9) if (hints[r][c] == 0) put("$c,$r", SOLUTION[r][c])
    }

    @Test
    fun `the solution completes the board`() {
        val values = solvedValues()
        assertTrue(UnequalSudokuEngine.isComplete(q60, values))
        assertTrue(UnequalSudokuEngine.findConflicts(q60, values).isEmpty())
        assertEquals(100.0, UnequalSudokuEngine.computeProgress(q60, values), 1e-9)
    }

    @Test
    fun `a broken sign marks the sign and both its cells`() {
        // right[0][0] is "<": (0,0) must be smaller than (1,0).
        val values = mapOf("0,0" to 5, "1,0" to 4)
        assertEquals(setOf(Gap(true, 0, 0)), UnequalSudokuEngine.findBrokenSigns(q60, values))
        assertEquals(setOf("0,0", "1,0"), UnequalSudokuEngine.findConflicts(q60, values))
    }

    @Test
    fun `a vertical sign reads upper against lower`() {
        // down[0][0] is "∧": (0,0) must be smaller than (0,1).
        assertTrue(UnequalSudokuEngine.findBrokenSigns(q60, mapOf("0,0" to 4, "0,1" to 8)).isEmpty())
        assertEquals(setOf(Gap(false, 0, 0)), UnequalSudokuEngine.findBrokenSigns(q60, mapOf("0,0" to 8, "0,1" to 4)))
    }

    @Test
    fun `an empty neighbour never breaks a sign`() {
        assertTrue(UnequalSudokuEngine.findBrokenSigns(q60, mapOf("0,0" to 9)).isEmpty())
    }

    @Test
    fun `a valid sudoku that ignores the signs is not complete`() {
        // No givens, Q60's signs, filled with a different valid sudoku.
        val canon = JsonObject(sampleCanon(1) + ("hints" to JsonArray(List(9) { JsonArray(List(9) { JsonPrimitive(0) }) })))
        val other = listOf(
            listOf(5, 3, 4, 6, 7, 8, 9, 1, 2), listOf(6, 7, 2, 1, 9, 5, 3, 4, 8), listOf(1, 9, 8, 3, 4, 2, 5, 6, 7),
            listOf(8, 5, 9, 7, 6, 1, 4, 2, 3), listOf(4, 2, 6, 8, 5, 3, 7, 9, 1), listOf(7, 1, 3, 9, 2, 4, 8, 5, 6),
            listOf(9, 6, 1, 5, 3, 7, 2, 8, 4), listOf(2, 8, 7, 4, 1, 9, 6, 3, 5), listOf(3, 4, 5, 2, 8, 6, 1, 7, 9),
        )
        val values = buildMap { for (r in 0 until 9) for (c in 0 until 9) put("$c,$r", other[r][c]) }
        assertTrue(SudokuEngine.findConflicts(puzzle(canon), values).isEmpty())
        assertFalse(UnequalSudokuEngine.isComplete(puzzle(canon), values))
    }

    @Test
    fun `answers and notes round-trip like sudoku`() {
        val values = mapOf("0,0" to 4, "n:1,0:5" to 1, "n:1,0:7" to 1)
        val answer = UnequalSudokuEngine.extractAnswer(q60, values)
        assertEquals(values, UnequalSudokuEngine.restoreUserValues(q60, answer))
        assertEquals(1.0 / 69 * 100, UnequalSudokuEngine.computeProgress(q60, values), 1e-9)
    }

    companion object {
        val SOLUTION = listOf(
            listOf(4, 5, 6, 7, 8, 1, 9, 3, 2), listOf(8, 1, 2, 9, 4, 3, 5, 6, 7), listOf(3, 7, 9, 6, 5, 2, 8, 1, 4),
            listOf(9, 3, 4, 8, 6, 5, 7, 2, 1), listOf(1, 2, 7, 4, 3, 9, 6, 8, 5), listOf(5, 6, 8, 1, 2, 7, 3, 4, 9),
            listOf(2, 9, 3, 5, 1, 8, 4, 7, 6), listOf(7, 4, 1, 3, 9, 6, 2, 5, 8), listOf(6, 8, 5, 2, 7, 4, 1, 9, 3),
        )

        /** A sample's hand-checked canon from docs/unequal-sudoku (tests run from the app module). */
        fun sampleCanon(n: Int): JsonObject =
            Json.parseToJsonElement(File("../../../docs/unequal-sudoku/unequal-sudoku-board-$n.canon.json").readText()).jsonObject
    }
}
