package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class PencilsAuthoringTest {

    private val canon = Json.parseToJsonElement("""{"cells":[[0,-4,3,0],[0,5,0,0],[0,0,-1,0],[0,0,0,12]]}""") as JsonObject

    @Test
    fun canonRoundTripsThroughBoardDraftKeepingHeads() {
        val board = BoardDraft.fromCanon(AuthoringType.PENCILS, canon)
        assertEquals(BoardDraft(pencils = board.pencils), board)
        assertEquals(-4, board.pencils.cellAt(1, 0))
        assertEquals(CanonBoard(canon, 4, 4), board.toCanon(AuthoringType.PENCILS))
        assertEquals(8, PencilsAuthoring.previewPuzzle(board.pencils).puzzleType)
    }

    @Test
    fun cleanBoardHasNoProblems() {
        assertEquals(emptyList<String>(), PencilsAuthoring.problems(PencilsAuthoring.draftFromCanon(canon)))
    }

    @Test
    fun setClueWritesNumbersAndHeads() {
        var d = PencilsAuthoring.draftFromCanon(canon)
        d = PencilsAuthoring.setClue(d, col = 0, row = 0, clue = PencilsRules.DOWN)
        assertEquals(-2, d.cellAt(0, 0))
        d = PencilsAuthoring.setClue(d, col = 0, row = 0, clue = 4)
        assertEquals(4, d.cellAt(0, 0))
        d = PencilsAuthoring.setClue(d, col = 0, row = 0, clue = null)
        assertEquals(0, d.cellAt(0, 0))
    }

    @Test
    fun warnsOnHeadsWithoutRoomAndUnknownValues() {
        var d = PencilsAuthoring.draftFromCanon(canon)
        d = PencilsAuthoring.setClue(d, col = 0, row = 0, clue = PencilsRules.DOWN)
        d = PencilsAuthoring.setClue(d, col = 3, row = 1, clue = PencilsRules.LEFT)
        d = PencilsAuthoring.setClue(d, col = 0, row = 2, clue = -7)
        assertEquals(
            listOf(
                "R1C1: the down head has no room for a body behind it",
                "R2C4: the left head has no room for a body behind it",
                "R3C1 holds an unknown value (-7)",
            ),
            PencilsAuthoring.problems(d),
        )
    }

    @Test
    fun otherClueGridsStillDropNegatives() {
        val d = NumberLinkAuthoring.draftFromCanon(canon)
        assertEquals(0, d.cellAt(1, 0))
    }
}
