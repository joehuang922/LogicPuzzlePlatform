package com.puzzleplatform.player.ui.screens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for the Nonogram reverse (undo/redo) pilot's engine. A "move" is one tap
 * or one whole drag; a fresh move drops the redo future; depth is capped at 100.
 *
 * These drive [MoveHistory] the way [PlayViewModel] does: before each move the live
 * `userValues` snapshot is handed to [MoveHistory.record]; undo/redo are passed the
 * live snapshot and return the one to restore. The tiny helper below mirrors that
 * contract so a test reads as a sequence of player actions.
 */
class MoveHistoryTest {

    /** A mutable "current board" plus history, matching how the ViewModel pairs them. */
    private class Harness(maxDepth: Int = 100) {
        val history = MoveHistory(maxDepth)
        var current: Map<String, Int> = emptyMap()

        /** A tap/standalone move that sets [key] to [value] (0 removes it). */
        fun move(key: String, value: Int) {
            history.record(current)
            current = if (value == 0) current - key else current + (key to value)
        }

        /** A drag stroke painting several cells — recorded as a single reverse step. */
        fun drag(vararg sets: Pair<String, Int>) {
            history.beginStroke(current)
            for ((key, value) in sets) {
                history.record(current)
                current = if (value == 0) current - key else current + (key to value)
            }
            history.endStroke()
        }

        fun undo() {
            history.undo(current)?.let { current = it }
        }

        fun redo() {
            history.redo(current)?.let { current = it }
        }
    }

    @Test
    fun undo_restoresPreviousState_redoReapplies() {
        val h = Harness()
        h.move("a", 1) // {a}
        h.move("b", 1) // {a,b}

        assertTrue(h.history.canUndo)
        assertFalse(h.history.canRedo)

        h.undo()
        assertEquals(mapOf("a" to 1), h.current)
        assertTrue(h.history.canRedo)

        h.undo()
        assertEquals(emptyMap<String, Int>(), h.current)
        assertFalse(h.history.canUndo)

        h.redo()
        assertEquals(mapOf("a" to 1), h.current)
        h.redo()
        assertEquals(mapOf("a" to 1, "b" to 1), h.current)
        assertFalse(h.history.canRedo)
    }

    @Test
    fun newMove_afterUndo_discardsRedoFuture() {
        // The spec's example: s(a) -> s(b) -> s(c) -> undo -> undo -> s(d)
        // collapses to the reachable chain {} -> {a} -> {a,d}.
        val h = Harness()
        h.move("a", 1) // {a}
        h.move("b", 1) // {a,b}
        h.move("c", 1) // {a,b,c}

        h.undo()       // -> {a,b}
        h.undo()       // -> {a}
        assertEquals(mapOf("a" to 1), h.current)
        assertTrue(h.history.canRedo)

        h.move("d", 1) // the new move destroys the redo future
        assertEquals(mapOf("a" to 1, "d" to 1), h.current)
        assertFalse("a fresh move must clear the redo stack", h.history.canRedo)

        // Walking all the way back now visits only {a} then {}.
        h.undo()
        assertEquals(mapOf("a" to 1), h.current)
        h.undo()
        assertEquals(emptyMap<String, Int>(), h.current)
        assertFalse(h.history.canUndo)
    }

    @Test
    fun drag_isASingleReverseStep() {
        val h = Harness()
        h.drag("a" to 1, "b" to 1, "c" to 1) // one stroke painting three cells
        assertEquals(mapOf("a" to 1, "b" to 1, "c" to 1), h.current)

        // A single undo reverts the entire stroke, not one cell of it.
        h.undo()
        assertEquals(emptyMap<String, Int>(), h.current)
        assertFalse(h.history.canUndo)

        // And a single redo re-applies the whole stroke.
        h.redo()
        assertEquals(mapOf("a" to 1, "b" to 1, "c" to 1), h.current)
    }

    @Test
    fun tapsAndDragsInterleave_eachOneUndoStep() {
        val h = Harness()
        h.move("a", 1)                       // step 1 (tap)
        h.drag("b" to 1, "c" to 1)           // step 2 (drag)
        h.move("d", 1)                       // step 3 (tap)
        assertEquals(mapOf("a" to 1, "b" to 1, "c" to 1, "d" to 1), h.current)

        h.undo() // undo the d tap
        assertEquals(mapOf("a" to 1, "b" to 1, "c" to 1), h.current)
        h.undo() // undo the whole drag at once
        assertEquals(mapOf("a" to 1), h.current)
        h.undo() // undo the a tap
        assertEquals(emptyMap<String, Int>(), h.current)
        assertFalse(h.history.canUndo)
    }

    @Test
    fun history_isCappedAtMaxDepth_oldestMovesDropOff() {
        val h = Harness(maxDepth = 100)
        // 150 taps: the oldest 50 pre-move snapshots fall out of the window.
        for (i in 0 until 150) h.move("k$i", 1)

        // Only 100 undos are available; after them the earliest reachable state still
        // has the first 50 keys baked in (they predate the retained history).
        var undos = 0
        while (h.history.canUndo) { h.undo(); undos++ }
        assertEquals(100, undos)

        for (i in 0 until 50) assertEquals("k$i should survive (predates the window)", 1, h.current["k$i"])
        assertNull("k50 was the first retained baseline, so it undoes away", h.current["k50"])
    }

    @Test
    fun reset_clearsBothStacks() {
        val h = Harness()
        h.move("a", 1)
        h.undo()
        assertTrue(h.history.canRedo)

        h.history.reset()
        assertFalse(h.history.canUndo)
        assertFalse(h.history.canRedo)
    }

    @Test
    fun undo_withNothingRecorded_returnsNull() {
        val history = MoveHistory()
        assertNull(history.undo(mapOf("a" to 1)))
        assertNull(history.redo(mapOf("a" to 1)))
    }
}
