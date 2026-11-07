package com.puzzleplatform.player.puzzle

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HitoriAuthoringTest {

    private val full = ClueGridDraft(listOf(listOf(1, 2, 2), listOf(2, 1, 3)))

    @Test
    fun fullGridIsClean() {
        assertTrue(HitoriAuthoring.formatProblems(full).isEmpty())
        assertTrue(HitoriAuthoring.problems(full).isEmpty())
    }

    @Test
    fun blankCellIsAFormatProblem() {
        val draft = HitoriAuthoring.setClue(full, 1, 1, null)
        assertEquals(1, HitoriAuthoring.formatProblems(draft).size)
        assertEquals(HitoriAuthoring.formatProblems(draft), HitoriAuthoring.problems(draft))
        // An added row is blank, so it's flagged until filled in.
        assertEquals(1, HitoriAuthoring.formatProblems(HitoriAuthoring.addRow(full)).size)
    }

    @Test
    fun numberBiggerThanAnyLineIsAProblemButNotAFormatProblem() {
        val draft = HitoriAuthoring.setClue(full, 0, 0, 11)
        assertTrue(HitoriAuthoring.formatProblems(draft).isEmpty())
        assertEquals(1, HitoriAuthoring.problems(draft).size)
    }
}
