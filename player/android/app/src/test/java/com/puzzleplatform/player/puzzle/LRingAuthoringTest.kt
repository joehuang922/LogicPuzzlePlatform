package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class LRingAuthoringTest {

    private val canon = Json.parseToJsonElement("""{"cells":[[3,0,4,0],[0,0,0,0],[0,0,0,0],[0,0,0,1]]}""") as JsonObject

    @Test
    fun canonRoundTripsThroughBoardDraft() {
        val board = BoardDraft.fromCanon(AuthoringType.L_RING, canon)
        assertEquals(BoardDraft(lRing = board.lRing), board)
        assertEquals(CanonBoard(canon, 4, 4), board.toCanon(AuthoringType.L_RING))
        assertEquals(33, LRingAuthoring.previewPuzzle(board.lRing).puzzleType)
    }

    @Test
    fun cleanBoardHasNoProblems() {
        assertEquals(emptyList<String>(), LRingAuthoring.problems(LRingAuthoring.draftFromCanon(canon)))
    }

    @Test
    fun warnsOnArrowsOffTheBoardAndUnknownValues() {
        var d = LRingAuthoring.draftFromCanon(canon)
        d = LRingAuthoring.setCell(d, col = 0, row = 0, value = 1)
        d = LRingAuthoring.setCell(d, col = 1, row = 1, value = 7)
        assertEquals(
            listOf("R1C1: the up arrow points off the board", "R2C2 holds an unknown value (7)"),
            LRingAuthoring.problems(d),
        )
    }

    @Test
    fun emptyBoardIsFlagged() {
        val d = ClueGridDraft(List(3) { List(3) { 0 } })
        assertEquals(1, LRingAuthoring.problems(d).size)
    }
}
