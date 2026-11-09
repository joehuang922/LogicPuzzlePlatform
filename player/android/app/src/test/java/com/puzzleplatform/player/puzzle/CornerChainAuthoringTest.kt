package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class CornerChainAuthoringTest {

    private fun draft(vararg rows: List<Int>) = NurikabeDraft(rows.toList())

    @Test
    fun cleanBoardHasNoProblems() {
        assertEquals(
            emptyList<String>(),
            CornerChainAuthoring.problems(draft(listOf(3, 0, 4, 4), listOf(0, 0, 0, 0), listOf(2, 0, 0, 5))),
        )
    }

    @Test
    fun equalNeighbouringCluesAreFineButDifferentOnesAreFlagged() {
        assertEquals(emptyList<String>(), CornerChainAuthoring.problems(draft(listOf(4, 4), listOf(0, 0))))
        assertEquals(
            listOf("R1C1 and R2C1 share an island but differ"),
            CornerChainAuthoring.problems(draft(listOf(4, 0), listOf(2, 0))),
        )
    }

    @Test
    fun flagsOnesOversizedCluesAndEmptyBoards() {
        assertEquals(
            listOf("R1C1 is 1, but a one-cell island is never allowed", "R2C2 is 9 but the grid has only 4 cells"),
            CornerChainAuthoring.problems(draft(listOf(1, 0), listOf(0, 9))),
        )
        assertEquals(listOf("No clues"), CornerChainAuthoring.problems(draft(listOf(0, 0), listOf(0, 0))))
    }

    @Test
    fun canonRoundTripsThroughBoardDraft() {
        val canon = Json.parseToJsonElement("""{"cells":[[3,0],[0,2],[0,0]]}""") as JsonObject
        val board = BoardDraft.fromCanon(AuthoringType.CORNER_CHAIN, canon)
        assertEquals(BoardDraft(cornerChain = board.cornerChain), board)
        assertEquals(CanonBoard(canon, 2, 3), board.toCanon(AuthoringType.CORNER_CHAIN))
        assertEquals(30, CornerChainAuthoring.previewPuzzle(board.cornerChain).puzzleType)
    }
}
