package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SkeletonPuzzleAuthoringTest {

    private val canon = Json.parseToJsonElement(
        """{"cells":[[1,1,1],[0,0,1],[0,0,1]],"words":[{"word":"サクラ","hint":"桜"},{"word":"ラッパ"}],"marks":[{"r":2,"c":2,"label":"A"}]}""",
    ) as JsonObject

    @Test
    fun canonRoundTripsThroughBoardDraft() {
        val board = BoardDraft.fromCanon(AuthoringType.SKELETON_PUZZLE, canon)
        assertEquals(BoardDraft(skeletonPuzzle = board.skeletonPuzzle), board)
        assertEquals(CanonBoard(canon, 3, 3), board.toCanon(AuthoringType.SKELETON_PUZZLE))
        assertEquals(35, SkeletonPuzzleAuthoring.previewPuzzle(board.skeletonPuzzle).puzzleType)
    }

    @Test
    fun cleanBoardHasNoProblems() {
        val d = SkeletonPuzzleAuthoring.draftFromCanon(canon)
        assertEquals(emptyList<String>(), SkeletonPuzzleAuthoring.problems(d))
        assertEquals(emptyList<String>(), BoardDraft(skeletonPuzzle = d).formatProblems(AuthoringType.SKELETON_PUZZLE))
    }

    @Test
    fun editsBlockOnMismatchedSlots() {
        var d = SkeletonPuzzleAuthoring.draftFromCanon(canon)
        d = SkeletonPuzzleAuthoring.toggleCell(d, col = 2, row = 2)
        // The mark on the square that stopped being a cell goes with it.
        assertEquals(emptyList<SkeletonRules.Mark>(), d.marks)
        assertEquals(
            listOf("1 slot of length 2 but 0 words of 2 letters", "1 slot of length 3 but 2 words of 3 letters"),
            BoardDraft(skeletonPuzzle = d).formatProblems(AuthoringType.SKELETON_PUZZLE),
        )
    }

    @Test
    fun marksAndWords() {
        var d = SkeletonPuzzleAuthoring.draftFromCanon(canon)
        d = SkeletonPuzzleAuthoring.toggleMark(d, col = 0, row = 0)
        assertEquals("B", d.marks.last().label)
        d = SkeletonPuzzleAuthoring.toggleMark(d, col = 0, row = 0)
        assertEquals(1, d.marks.size)
        d = SkeletonPuzzleAuthoring.setWords(d, "サクラ (桜)\nラッパ\nモギリ")
        assertTrue(SkeletonPuzzleAuthoring.formatProblems(d).single().startsWith("2 slots of length 3 but 3 words"))
    }
}
