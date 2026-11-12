package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class HashiAuthoringTest {

    private val canon = Json.parseToJsonElement("""{"cells":[[2,0,2],[0,0,0],[2,0,2]]}""") as JsonObject

    @Test
    fun canonRoundTripsThroughBoardDraft() {
        val board = BoardDraft.fromCanon(AuthoringType.HASHI, canon)
        assertEquals(BoardDraft(hashi = board.hashi), board)
        assertEquals(CanonBoard(canon, 3, 3), board.toCanon(AuthoringType.HASHI))
        assertEquals(34, HashiAuthoring.previewPuzzle(board.hashi).puzzleType)
    }

    @Test
    fun cleanBoardHasNoProblems() {
        assertEquals(emptyList<String>(), HashiAuthoring.problems(HashiAuthoring.draftFromCanon(canon)))
    }

    @Test
    fun warnsOnOddTotalsAndOverfullIslands() {
        var d = HashiAuthoring.draftFromCanon(canon)
        d = HashiAuthoring.setCell(d, col = 0, row = 0, value = 5)
        assertEquals(
            listOf(
                "The numbers sum to 11, an odd total: every bridge counts at both ends",
                "R1C1 is 5, but its 2 neighbouring islands take at most 4 bridges",
            ),
            HashiAuthoring.problems(d),
        )
    }

    @Test
    fun emptyBoardIsFlagged() {
        assertEquals(1, HashiAuthoring.problems(ClueGridDraft(List(3) { List(3) { 0 } })).size)
    }
}
