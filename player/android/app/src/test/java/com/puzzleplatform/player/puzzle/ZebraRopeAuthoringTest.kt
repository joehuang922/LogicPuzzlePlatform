package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ZebraRopeAuthoringTest {

    // Unit tests run from the app module directory.
    private fun sample(i: Int): JsonObject =
        Json.parseToJsonElement(File("../../../docs/zebra-rope/board-zebra-rope-$i.canon.json").readText()) as JsonObject

    @Test
    fun samples_roundTripThroughTheDraft() {
        for (i in 1..2) {
            val canon = sample(i)
            val board = BoardDraft.fromCanon(AuthoringType.ZEBRA_ROPE, canon)
            assertEquals(CanonBoard(canon, 10, 10), board.toCanon(AuthoringType.ZEBRA_ROPE))
            assertEquals(emptyList<String>(), board.problems(AuthoringType.ZEBRA_ROPE))
            assertEquals(36, ZebraRopeAuthoring.previewPuzzle(board.zebraRope).puzzleType)
        }
    }

    @Test
    fun cycleCircle_whiteGrayBlackNone_onGridLinesOnly() {
        var d = ZebraRopeEngine.Board(3, 3, emptyList(), emptyList())
        val colors = mutableListOf<Int?>()
        repeat(4) {
            d = ZebraRopeAuthoring.cycleCircle(d, 1, 2)
            colors += d.circles.firstOrNull()?.color
        }
        assertEquals(listOf(0, 2, 1, null), colors)
        // A cell centre and the outer border take no circle.
        assertEquals(d, ZebraRopeAuthoring.cycleCircle(d, 1, 1))
        assertEquals(d, ZebraRopeAuthoring.cycleCircle(d, 0, 2))
    }

    @Test
    fun extendRope_kingStepsUndoAndNoRevisit() {
        var rope = listOf(0 to 0)
        rope = ZebraRopeAuthoring.extendRope(rope, 1 to 1) // diagonal
        rope = ZebraRopeAuthoring.extendRope(rope, 1 to 2)
        assertEquals(listOf(0 to 0, 1 to 1, 1 to 2), rope)
        assertEquals(rope, ZebraRopeAuthoring.extendRope(rope, 1 to 4)) // a jump
        // A visited cell that isn't the previous one is ignored (no loops back onto the rope).
        val square = listOf(0 to 0, 0 to 1, 1 to 1, 1 to 0)
        assertEquals(square, ZebraRopeAuthoring.extendRope(square, 0 to 0))
        assertEquals(listOf(0 to 0, 1 to 1), ZebraRopeAuthoring.extendRope(rope, 1 to 1)) // back = undo
    }

    @Test
    fun addAndRemoveRopes_andResizeDropsWhatLeaves() {
        var d = ZebraRopeEngine.Board(3, 3, emptyList(), listOf(ZebraRopeEngine.Circle(4, 3, 0)))
        d = ZebraRopeAuthoring.addRope(d, listOf(0 to 0))
        assertTrue(d.ropes.isEmpty())
        d = ZebraRopeAuthoring.addRope(d, listOf(0 to 0, 1 to 1, 2 to 2))
        d = ZebraRopeAuthoring.addRope(d, listOf(0 to 1, 0 to 2))
        assertEquals(1, ZebraRopeAuthoring.removeRopeAt(d, 0, 2).ropes.size)
        val smaller = ZebraRopeAuthoring.removeEdgeRow(d, top = false)
        assertEquals(listOf(listOf(0 to 1, 0 to 2)), smaller.ropes)
        assertTrue(smaller.circles.isEmpty())
    }

    @Test
    fun formatProblems_matchTheWeb() {
        val bad = ZebraRopeEngine.Board(
            3,
            3,
            listOf(listOf(0 to 0, 2 to 0), listOf(0 to 0, 1 to 1, 0 to 0)),
            listOf(ZebraRopeEngine.Circle(1, 1, 0), ZebraRopeEngine.Circle(6, 2, 0)),
        )
        assertEquals(4, ZebraRopeAuthoring.formatProblems(bad).size)
        assertEquals(
            listOf("No ropes or circles"),
            ZebraRopeAuthoring.problems(ZebraRopeEngine.Board(3, 3, emptyList(), emptyList())),
        )
    }
}
