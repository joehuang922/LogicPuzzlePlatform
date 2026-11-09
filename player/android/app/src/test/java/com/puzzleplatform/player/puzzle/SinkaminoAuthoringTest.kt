package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class SinkaminoAuthoringTest {

    private val canon = Json.parseToJsonElement(
        """{"cells":[[2,0,0],[0,1,0]],"arrows":[[[0,0],[0,1],[0,2]]]}"""
    ) as JsonObject

    @Test
    fun canonRoundTripsThroughBoardDraft() {
        val board = BoardDraft.fromCanon(AuthoringType.SINKAMINO, canon)
        assertEquals(BoardDraft(sinkamino = board.sinkamino), board)
        assertEquals(CanonBoard(canon, 3, 2), board.toCanon(AuthoringType.SINKAMINO))
        assertEquals(31, SinkaminoAuthoring.previewPuzzle(board.sinkamino).puzzleType)
    }

    @Test
    fun cellsCycleWhiteBlackGiven() {
        var d = SinkaminoAuthoring.draftFromCanon(canon)
        d = SinkaminoAuthoring.cycleCell(d, col = 1, row = 0)
        assertEquals(SinkaminoRules.BLACK, d.cellAt(0, 1))
        d = SinkaminoAuthoring.cycleCell(d, col = 1, row = 0)
        assertEquals(SinkaminoRules.GIVEN, d.cellAt(0, 1))
        d = SinkaminoAuthoring.cycleCell(d, col = 1, row = 0)
        assertEquals(SinkaminoRules.WHITE, d.cellAt(0, 1))
    }

    @Test
    fun blackUnderATrailIsABlockingFormatProblem() {
        val d = SinkaminoAuthoring.cycleCell(SinkaminoAuthoring.draftFromCanon(canon), col = 1, row = 0)
        assertEquals(listOf("Arrow 1 crosses the black cell R1C2"), SinkaminoAuthoring.formatProblems(d))
        val board = BoardDraft(sinkamino = d)
        assertEquals(listOf("Arrow 1 crosses the black cell R1C2"), board.formatProblems(AuthoringType.SINKAMINO))
    }

    @Test
    fun dragExtendsBacktracksAndIgnoresJumps() {
        var t = listOf(0 to 0)
        t = SinkaminoAuthoring.extendTrail(t, 0 to 1)
        t = SinkaminoAuthoring.extendTrail(t, 1 to 1)
        assertEquals(listOf(0 to 0, 0 to 1, 1 to 1), t)
        assertEquals(listOf(0 to 0, 0 to 1), SinkaminoAuthoring.extendTrail(t, 0 to 1)) // back a step
        assertEquals(t, SinkaminoAuthoring.extendTrail(t, 3 to 3)) // not a neighbour
        assertEquals(t, SinkaminoAuthoring.extendTrail(t, 1 to 1)) // same cell
    }

    @Test
    fun addAndDeleteArrows() {
        var d = SinkaminoAuthoring.draftFromCanon(canon)
        d = SinkaminoAuthoring.addArrow(d, listOf(1 to 0))
        assertEquals(1, d.arrows.size) // a one-cell drag isn't an arrow
        d = SinkaminoAuthoring.addArrow(d, listOf(1 to 0, 1 to 1))
        assertEquals(2, d.arrows.size)
        d = SinkaminoAuthoring.removeArrowAt(d, col = 2, row = 0)
        assertEquals(listOf(listOf(1 to 0, 1 to 1)), d.arrows)
    }

    @Test
    fun removingTheLastRowDropsTrailsThroughIt() {
        var d = SinkaminoAuthoring.addArrow(SinkaminoAuthoring.draftFromCanon(canon), listOf(1 to 0, 1 to 1))
        d = SinkaminoAuthoring.removeLastRow(d)
        assertEquals(1, d.rows)
        assertEquals(listOf(listOf(0 to 0, 0 to 1, 0 to 2)), d.arrows)
    }

    @Test
    fun warnsWhenThereAreNoArrows() {
        val d = SinkaminoAuthoring.draftFromCanon(Json.parseToJsonElement("""{"cells":[[0,0]],"arrows":[]}""") as JsonObject)
        assertEquals(listOf("No arrows"), SinkaminoAuthoring.problems(d))
    }
}
