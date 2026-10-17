package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure logic behind the Admin nonogram flow: parser canon -> editable draft -> canon
 * round-trips, clue-text parsing, line edits, and the API's semantic checks.
 */
class NonogramAuthoringTest {

    private fun lines(vararg clues: List<Int>): JsonArray =
        JsonArray(clues.map { c -> JsonArray(c.map { JsonPrimitive(it) }) })

    private fun canon(rows: JsonArray, cols: JsonArray): JsonObject =
        JsonObject(mapOf("rowClues" to rows, "colClues" to cols))

    // A valid 3x3 (plus shape): rows [1],[3],[1]; cols [1],[3],[1].
    private val plus = NonogramDraft(
        rowClues = listOf(listOf(1), listOf(3), listOf(1)),
        colClues = listOf(listOf(1), listOf(3), listOf(1)),
    )

    @Test
    fun canonRoundTrips() {
        val c = canon(lines(listOf(1), listOf(3), listOf(1)), lines(listOf(1), listOf(3), listOf(1)))
        val draft = NonogramAuthoring.draftFromCanon(c)
        assertEquals(plus, draft)
        assertEquals(c, NonogramAuthoring.canonFromDraft(draft))
    }

    @Test
    fun blankLinesNormalizeToZero() {
        val c = canon(lines(emptyList(), listOf(0, 2), listOf(0, 0)), lines(listOf(2)))
        val draft = NonogramAuthoring.draftFromCanon(c)
        assertEquals(listOf(listOf(0), listOf(2), listOf(0)), draft.rowClues)
    }

    @Test
    fun parseClueTextAcceptsAnySeparator() {
        assertEquals(listOf(3, 1, 2), NonogramAuthoring.parseClueText("3 1, 2"))
        assertEquals(listOf(3, 1), NonogramAuthoring.parseClueText(" 3.1 "))
        assertEquals(listOf(3), NonogramAuthoring.parseClueText("3 "))
        assertEquals(listOf(0), NonogramAuthoring.parseClueText(""))
        assertEquals(listOf(0), NonogramAuthoring.parseClueText("0"))
        assertEquals("3 1 2", NonogramAuthoring.formatClue(listOf(3, 1, 2)))
    }

    @Test
    fun cleanDraftHasNoProblems() {
        assertTrue(NonogramAuthoring.problems(plus).isEmpty())
    }

    @Test
    fun flagsClueThatCannotFit() {
        // [2,1] needs 4 cells in a 3-wide row.
        val bad = NonogramAuthoring.setRowClue(plus, 1, listOf(2, 1))
        val problems = NonogramAuthoring.problems(bad)
        assertTrue(problems.any { it.startsWith("Row 2 needs 4 cells") })
    }

    @Test
    fun flagsMismatchedSums() {
        val bad = NonogramAuthoring.setColClue(plus, 0, listOf(2))
        assertEquals(listOf("Clue sums differ: rows 5, columns 6"), NonogramAuthoring.problems(bad))
    }

    @Test
    fun removeAndAddLines() {
        val phantom = NonogramAuthoring.addRow(plus)
        assertEquals(4, phantom.rows)
        assertEquals(listOf(0), phantom.rowClues.last())
        assertEquals(plus, NonogramAuthoring.removeRow(phantom, 3))
        assertEquals(listOf(listOf(1), listOf(1)), NonogramAuthoring.removeCol(plus, 1).colClues)
        // Never drops the last line.
        val one = NonogramDraft(listOf(listOf(1)), listOf(listOf(1)))
        assertEquals(one, NonogramAuthoring.removeRow(one, 0))
        assertEquals(one, NonogramAuthoring.removeCol(one, 0))
    }

    @Test
    fun authoringTypesMapToPuzzleTypes() {
        assertEquals(1, AuthoringType.SUDOKU.puzzleType)
        assertEquals(6, AuthoringType.NONOGRAM.puzzleType)
    }
}
