package com.puzzleplatform.player.puzzle

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class PerfectLRingAuthoringTest {

    private fun sample(name: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/perfect-l-ring/$name.canon.json").readText()) as JsonObject

    @Test
    fun samplesRoundTripThroughBoardDraftWithNoProblems() {
        for (name in listOf("perfect-l-ring-board-1", "perfect-l-ring-board-2")) {
            val canon = sample(name)
            val board = BoardDraft.fromCanon(AuthoringType.PERFECT_L_RING, canon)
            assertEquals(name, BoardDraft(perfectLRing = board.perfectLRing), board)
            assertEquals(name, CanonBoard(canon, 6, 6), board.toCanon(AuthoringType.PERFECT_L_RING))
            assertEquals(name, emptyList<String>(), board.problems(AuthoringType.PERFECT_L_RING))
            assertEquals(name, emptyList<String>(), board.formatProblems(AuthoringType.PERFECT_L_RING))
        }
    }

    @Test
    fun previewPuzzleIsTypeFortyTwo() {
        val d = PerfectLRingAuthoring.draftFromCanon(sample("perfect-l-ring-board-1"))
        val p = PerfectLRingAuthoring.previewPuzzle(d)
        assertEquals(42, p.puzzleType)
        assertEquals("perfect-l-ring", p.puzzleTypeName)
    }

    @Test
    fun editsAndWarnings() {
        var d = PerfectLRingAuthoring.draftFromCanon(sample("perfect-l-ring-board-1"))
        // R1C1 holds a right arrow; turn it up, off the board.
        d = PerfectLRingAuthoring.setCell(d, col = 0, row = 0, value = 1)
        assertEquals(listOf("R1C1: the up arrow points off the board"), PerfectLRingAuthoring.problems(d))
        d = PerfectLRingAuthoring.addRow(PerfectLRingAuthoring.addCol(d))
        assertEquals(7 to 7, d.rows to d.cols)
        d = PerfectLRingAuthoring.removeRow(PerfectLRingAuthoring.removeCol(d, 6), 6)
        assertEquals(6 to 6, d.rows to d.cols)
        assertEquals(1, PerfectLRingAuthoring.problems(ClueGridDraft(List(3) { List(3) { 0 } })).size)
    }
}
