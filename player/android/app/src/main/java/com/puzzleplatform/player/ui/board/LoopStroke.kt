package com.puzzleplatform.player.ui.board

/**
 * One drag stroke on a board where the player draws a path between cell centers, with
 * segments keyed "h:r,c" (between (r,c) and (r,c+1)) and "v:r,c" (between (r,c) and
 * (r+1,c)) -> 1. Cells are (row, col); boards swap ZoomableBoard's (col, row) at the
 * boundary.
 *
 * Each step between adjacent cells toggles their shared segment. The first step fixes the
 * stroke as draw or erase (erase when that segment was already drawn), like the web boards.
 * [drawChanges] decides each draw step: it returns the userValues changes to apply (at
 * least the segment itself; a 0 value removes a key) or null to refuse the step, which
 * leaves the anchor in place so a later legal move from the same cell still works. A
 * corner-cut (diagonal) move re-anchors without drawing; a fast straight move that skipped
 * cells walks each one so the path has no gaps.
 *
 * Writes made during the stroke are layered over the incoming values: the board's
 * userValues only catch up after a recomposition, and pointer events can arrive faster
 * than that, so without the overlay [drawChanges] and the draw/erase decision would read
 * stale state.
 *
 * Pure Kotlin (no Compose) so the stroke rules are unit-testable.
 */
class LoopStroke(
    private val drawChanges: (
        from: Pair<Int, Int>,
        to: Pair<Int, Int>,
        key: String,
        current: Map<String, Int>,
    ) -> Map<String, Int>? = { _, _, key, _ -> mapOf(key to 1) },
) {
    private var last: Pair<Int, Int>? = null
    // null = undecided, true = erasing, false = drawing.
    private var erasing: Boolean? = null
    private val pending = mutableMapOf<String, Int>()

    fun start(cell: Pair<Int, Int>?) {
        last = cell
        erasing = null
        pending.clear()
    }

    fun end() = start(null)

    fun moveTo(cell: Pair<Int, Int>?, values: Map<String, Int>, apply: (Map<String, Int>) -> Unit) {
        if (cell == null) return
        val from = last ?: run { last = cell; return }
        if (cell == from) return
        val dr = cell.first - from.first
        val dc = cell.second - from.second
        if (dr != 0 && dc != 0) {
            last = cell
            return
        }
        val sr = Integer.signum(dr)
        val sc = Integer.signum(dc)
        var cur = from
        while (cur != cell) {
            val next = (cur.first + sr) to (cur.second + sc)
            if (!step(cur, next, values, apply)) return
            cur = next
            last = cur
        }
    }

    private fun step(
        from: Pair<Int, Int>,
        to: Pair<Int, Int>,
        values: Map<String, Int>,
        apply: (Map<String, Int>) -> Unit,
    ): Boolean {
        val key = segmentKey(from, to)
        val current = if (pending.isEmpty()) values else values + pending
        val drawn = current[key] == 1
        if (erasing == null) erasing = drawn

        if (erasing == true) {
            if (drawn) write(mapOf(key to 0), apply)
            return true
        }
        if (drawn) return true
        val changes = drawChanges(from, to, key, current) ?: return false
        write(changes, apply)
        return true
    }

    private fun write(changes: Map<String, Int>, apply: (Map<String, Int>) -> Unit) {
        pending.putAll(changes)
        apply(changes)
    }

    companion object {
        /** The segment key between orthogonally adjacent (row, col) cells. */
        fun segmentKey(a: Pair<Int, Int>, b: Pair<Int, Int>): String {
            val r = minOf(a.first, b.first)
            val c = minOf(a.second, b.second)
            return if (a.first == b.first) "h:$r,$c" else "v:$r,$c"
        }
    }
}
