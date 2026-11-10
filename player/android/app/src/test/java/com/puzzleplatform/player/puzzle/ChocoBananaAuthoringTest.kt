package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class ChocoBananaAuthoringTest {

    private val canon = Json.parseToJsonElement("""{"cells":[[0,2,0],[5,0,0],[0,0,1]]}""") as JsonObject

    @Test
    fun canonRoundTripsThroughBoardDraft() {
        val board = BoardDraft.fromCanon(AuthoringType.CHOCO_BANANA, canon)
        assertEquals(BoardDraft(chocoBanana = board.chocoBanana), board)
        assertEquals(CanonBoard(canon, 3, 3), board.toCanon(AuthoringType.CHOCO_BANANA))
        assertEquals(16, ChocoBananaAuthoring.previewPuzzle(board.chocoBanana).puzzleType)
    }

    @Test
    fun warnsOnCluesBiggerThanTheGrid() {
        val d = ChocoBananaAuthoring.setClue(ChocoBananaAuthoring.draftFromCanon(canon), col = 2, row = 0, clue = 11)
        assertEquals(listOf("R1C3: 11 is bigger than the grid's 9 cells"), ChocoBananaAuthoring.problems(d))
        assertEquals(emptyList<String>(), BoardDraft(chocoBanana = d).formatProblems(AuthoringType.CHOCO_BANANA))
    }
}
