package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class BalanceLinkAuthoringTest {

    private val canon = Json.parseToJsonElement("""{"cells":[[0,0,60],[11,1,11],[60,0,0]]}""") as JsonObject

    @Test
    fun canonRoundTripsThroughBoardDraft() {
        val board = BoardDraft.fromCanon(AuthoringType.BALANCE_LINK, canon)
        assertEquals(BoardDraft(balanceLink = board.balanceLink), board)
        assertEquals(CanonBoard(canon, 3, 3), board.toCanon(AuthoringType.BALANCE_LINK))
        assertEquals(32, BalanceLinkAuthoring.previewPuzzle(board.balanceLink).puzzleType)
    }

    @Test
    fun cleanBoardHasNoProblems() {
        assertEquals(emptyList<String>(), BalanceLinkAuthoring.problems(BalanceLinkAuthoring.draftFromCanon(canon)))
    }

    @Test
    fun warnsOnOddCountsUnknownCodesAndNoSymbols() {
        var d = BalanceLinkAuthoring.draftFromCanon(canon)
        d = BalanceLinkAuthoring.setCell(d, col = 2, row = 0, value = 61)
        assertEquals(
            listOf("White star appears once, so one can't be paired", "Black star appears once, so one can't be paired"),
            BalanceLinkAuthoring.problems(d),
        )
        d = BalanceLinkAuthoring.setCell(d, col = 0, row = 0, value = 99)
        assertEquals("R1C1 holds an unknown symbol (99)", BalanceLinkAuthoring.problems(d).first())
        assertEquals(
            listOf("No symbols"),
            BalanceLinkAuthoring.problems(ClueGridDraft(listOf(listOf(1, 0), listOf(0, 0)))),
        )
    }

    @Test
    fun colourChangeKeepsTheShape() {
        var d = BalanceLinkAuthoring.draftFromCanon(canon)
        d = BalanceLinkAuthoring.setSymbolColour(d, col = 0, row = 1, black = false)
        assertEquals(10, d.cellAt(0, 1))
        // Not a symbol: unchanged.
        assertEquals(d, BalanceLinkAuthoring.setSymbolColour(d, col = 1, row = 1, black = true))
        // Empty clears.
        assertEquals(0, BalanceLinkAuthoring.setCell(d, col = 0, row = 1, value = 0).cellAt(0, 1))
    }
}
