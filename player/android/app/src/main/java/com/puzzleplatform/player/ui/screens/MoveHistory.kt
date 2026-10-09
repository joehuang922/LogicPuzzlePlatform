package com.puzzleplatform.player.ui.screens

/**
 * Reverse (undo/redo) history over full answer snapshots — the Nonogram pilot's
 * engine, kept pure (no Android/ViewModel deps) so it can be unit-tested directly.
 *
 * Each entry is a `userValues` map captured *before* a move. A "move" is one tap or
 * one whole drag: a drag is bracketed by [beginStroke]/[endStroke] so only its first
 * mutation records a baseline, collapsing the sweep into a single reverse step.
 * [undo] moves the last pre-move snapshot into the redo stack (handing back the state
 * to restore) and [redo] does the reverse. Any fresh [record] clears the redo stack,
 * so s(a) -> s(b) -> s(c) -> undo -> undo -> s(d) collapses to the chain {} -> {a} ->
 * {a,d}. The undo stack is capped at [maxDepth] moves (oldest dropped).
 */
class MoveHistory(private val maxDepth: Int = 100) {
    private val undoStack = ArrayDeque<Map<String, Int>>()
    private val redoStack = ArrayDeque<Map<String, Int>>()

    private var strokeActive = false
    private var strokeBaseline: Map<String, Int>? = null
    private var strokePushed = false

    val canUndo: Boolean get() = undoStack.isNotEmpty()
    val canRedo: Boolean get() = redoStack.isNotEmpty()

    /** Clear all history and any in-flight stroke (fresh baseline after a load/reload). */
    fun reset() {
        undoStack.clear()
        redoStack.clear()
        strokeActive = false
        strokeBaseline = null
        strokePushed = false
    }

    /**
     * Begin a drag stroke whose cell mutations collapse into one reverse step.
     * [current] is the state before the stroke; it becomes the single baseline the
     * stroke's first [record] pushes.
     */
    fun beginStroke(current: Map<String, Int>) {
        strokeActive = true
        strokePushed = false
        strokeBaseline = current
    }

    /** End the current drag stroke. A following [record] is a standalone move again. */
    fun endStroke() {
        strokeActive = false
        strokePushed = false
        strokeBaseline = null
    }

    /**
     * Record the pre-move snapshot [before]. Outside a stroke every call records; inside
     * a stroke only the first does (using the stroke baseline), so the whole drag is one
     * step. Recording always discards the redo future.
     */
    fun record(before: Map<String, Int>) {
        if (strokeActive) {
            if (!strokePushed) {
                push(strokeBaseline ?: before)
                strokePushed = true
            }
        } else {
            push(before)
        }
    }

    private fun push(before: Map<String, Int>) {
        undoStack.addLast(before)
        while (undoStack.size > maxDepth) undoStack.removeFirst()
        redoStack.clear()
    }

    /**
     * Step one move backward. [current] (the live state) is saved for redo; returns the
     * snapshot to restore, or null when there's nothing to undo.
     */
    fun undo(current: Map<String, Int>): Map<String, Int>? {
        if (undoStack.isEmpty()) return null
        val prev = undoStack.removeLast()
        redoStack.addLast(current)
        return prev
    }

    /**
     * Step one move forward. [current] (the live state) is saved for undo; returns the
     * snapshot to re-apply, or null when there's nothing to redo.
     */
    fun redo(current: Map<String, Int>): Map<String, Int>? {
        if (redoStack.isEmpty()) return null
        val next = redoStack.removeLast()
        undoStack.addLast(current)
        return next
    }
}
