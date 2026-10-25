package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.QuestionEditRules.SaveGate
import org.junit.Assert.assertEquals
import org.junit.Test

class QuestionEditRulesTest {

    @Test
    fun anUntouchedBoardNeverHoldsBackASave() {
        // It isn't re-sent, so even a stored board with problems saves its metadata.
        assertEquals(SaveGate.READY, QuestionEditRules.saveGate(false, hasProblems = true, hasFormatProblems = true))
    }

    @Test
    fun formatProblemsOnAChangedBoardBlock() {
        assertEquals(SaveGate.BLOCKED, QuestionEditRules.saveGate(true, hasProblems = true, hasFormatProblems = true))
    }

    @Test
    fun misreadWarningsOnAChangedBoardNeedConfirming() {
        assertEquals(SaveGate.NEEDS_CONFIRM, QuestionEditRules.saveGate(true, hasProblems = true, hasFormatProblems = false))
    }

    @Test
    fun aCleanChangedBoardIsReady() {
        assertEquals(SaveGate.READY, QuestionEditRules.saveGate(true, hasProblems = false, hasFormatProblems = false))
    }
}
