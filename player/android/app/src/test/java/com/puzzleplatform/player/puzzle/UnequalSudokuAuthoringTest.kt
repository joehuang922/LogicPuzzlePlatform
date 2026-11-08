package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.UnequalSudokuEngine.Gap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UnequalSudokuAuthoringTest {

    private val canon = UnequalSudokuEngineTest.sampleCanon(1)

    @Test
    fun `canon round-trips through the draft`() {
        val draft = UnequalSudokuAuthoring.draftFromCanon(canon)
        assertEquals(12, draft.givens.size)
        assertEquals(6, draft.givens["2,0"])
        assertEquals(canon, UnequalSudokuAuthoring.canonFromDraft(draft))
        val board = BoardDraft.fromCanon(AuthoringType.UNEQUAL_SUDOKU, canon).toCanon(AuthoringType.UNEQUAL_SUDOKU)
        assertEquals(CanonBoard(canon, 9, 9), board)
    }

    @Test
    fun `the sample has no problems`() {
        assertTrue(UnequalSudokuAuthoring.problems(UnequalSudokuAuthoring.draftFromCanon(canon)).isEmpty())
    }

    @Test
    fun `the review board locks no cell`() {
        val preview = UnequalSudokuAuthoring.previewPuzzle(UnequalSudokuAuthoring.draftFromCanon(canon))
        assertTrue(UnequalSudokuEngine.parseHints(preview).all { row -> row.all { it == 0 } })
        assertEquals(1, UnequalSudokuEngine.parseSigns(preview).right[0][0])
    }

    @Test
    fun `a gap cycles none, smaller, larger`() {
        var draft = UnequalSudokuDraft()
        val gap = Gap(false, 7, 8)
        val seen = (0 until 3).map {
            draft = UnequalSudokuAuthoring.cycleSign(draft, gap)
            draft.down[7][8]
        }
        assertEquals(listOf(1, 2, 0), seen)
        assertTrue(draft.right.flatten().all { it == 0 })
    }

    @Test
    fun `misreads are listed`() {
        val draft = UnequalSudokuAuthoring.draftFromCanon(canon)
        // A second 6 in row 0: both 6s repeat.
        val repeated = UnequalSudokuAuthoring.setGiven(draft, "4,0", 6)
        assertEquals(1, UnequalSudokuAuthoring.problems(repeated).size)
        assertTrue(UnequalSudokuAuthoring.problems(repeated)[0].startsWith("2 givens repeat"))
        // right[7][5] is ">": the given 6 at (5,7) must be larger than (6,7).
        val broken = UnequalSudokuAuthoring.setGiven(draft, "6,7", 9)
        assertEquals(listOf("1 signs are broken by the givens (red on the board)."), UnequalSudokuAuthoring.problems(broken))
        val blank = UnequalSudokuAuthoring.cycleSign(draft, Gap(true, 0, 0)).let { UnequalSudokuAuthoring.cycleSign(it, Gap(true, 0, 0)) }
        assertEquals(listOf("1 gaps have no sign; a printed board has one in every gap."), UnequalSudokuAuthoring.problems(blank))
        assertEquals(emptyList<String>(), UnequalSudokuAuthoring.setGiven(repeated, "4,0", null).let(UnequalSudokuAuthoring::problems))
    }
}
