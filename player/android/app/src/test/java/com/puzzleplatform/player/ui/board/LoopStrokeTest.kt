package com.puzzleplatform.player.ui.board

import org.junit.Assert.assertEquals
import org.junit.Test

class LoopStrokeTest {

    /** Runs a stroke through (row, col) cells; the board's values never catch up mid-stroke. */
    private fun stroke(
        cells: List<Pair<Int, Int>>,
        values: Map<String, Int> = emptyMap(),
        stroke: LoopStroke = LoopStroke(),
    ): Map<String, Int> {
        val applied = mutableMapOf<String, Int>()
        stroke.start(cells.first())
        for (c in cells.drop(1)) stroke.moveTo(c, values) { applied.putAll(it) }
        stroke.end()
        return applied
    }

    @Test
    fun segmentKey_isRowFirstAndOrderFree() {
        assertEquals("h:2,3", LoopStroke.segmentKey(2 to 4, 2 to 3))
        assertEquals("v:1,5", LoopStroke.segmentKey(1 to 5, 2 to 5))
    }

    @Test
    fun draw_walksSkippedCells() {
        assertEquals(
            mapOf("h:0,0" to 1, "h:0,1" to 1, "h:0,2" to 1),
            stroke(listOf(0 to 0, 0 to 3)),
        )
    }

    @Test
    fun firstStepOnADrawnSegmentErases() {
        val values = mapOf("h:0,0" to 1, "h:0,1" to 1)
        // Erasing never draws, even over blank segments later in the stroke.
        assertEquals(
            mapOf("h:0,0" to 0, "h:0,1" to 0),
            stroke(listOf(0 to 0, 0 to 1, 0 to 2, 0 to 3), values),
        )
    }

    @Test
    fun drawSeesItsOwnEarlierWrites() {
        // Doubling back over a segment drawn earlier in the same stroke leaves it drawn,
        // even though the incoming values never saw the first write.
        assertEquals(mapOf("h:0,0" to 1), stroke(listOf(0 to 0, 0 to 1, 0 to 0)))
    }

    @Test
    fun refusedStepKeepsTheAnchor() {
        // Refuse anything touching (0,1): the finger passes through it and turns down, but
        // the anchor stays at (0,0), so the move to (1,1) is a corner cut and re-anchors.
        val blockMid = LoopStroke { from, to, key, _ ->
            if (from == (0 to 1) || to == (0 to 1)) null else mapOf(key to 1)
        }
        assertEquals(
            mapOf("v:1,1" to 1),
            stroke(listOf(0 to 0, 0 to 1, 1 to 1, 2 to 1), stroke = blockMid),
        )
    }

    @Test
    fun drawChangesCanCarryExtraWrites() {
        val withMark = LoopStroke { _, to, key, _ -> mapOf(key to 1, "b:${to.first},${to.second}" to 0) }
        assertEquals(mapOf("v:0,0" to 1, "b:1,0" to 0), stroke(listOf(0 to 0, 1 to 0), stroke = withMark))
    }
}
