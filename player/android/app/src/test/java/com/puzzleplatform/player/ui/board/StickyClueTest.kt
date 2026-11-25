package com.puzzleplatform.player.ui.board

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Sticky placement of Irregular Nonogram clue blocks along one line. View is 0..400px;
 * a 3-number clue at 40px cells is 120px deep in place, 90px when pinned (shrunk).
 */
class StickyClueTest {

    private val VIEW = 400f
    private val NATURAL = 120f
    private val PINNED = 90f

    private fun start(segStart: Float, segEnd: Float) =
        StickyClue.pin(true, NATURAL, PINNED, segStart, segEnd, 0f, VIEW)

    private fun end(segStart: Float, segEnd: Float) =
        StickyClue.pin(false, NATURAL, PINNED, segStart, segEnd, 0f, VIEW)

    @Test
    fun startClue_inView_staysInPlace() {
        assertNull(start(120f, 320f)) // clue at 0..120, exactly in view
    }

    @Test
    fun startClue_offLeft_pinsToLeftEdge() {
        assertEquals(0f, start(100f, 300f)!!, 0.01f)
        assertEquals(0f, start(-200f, 300f)!!, 0.01f) // segment start scrolled away too
    }

    @Test
    fun startClue_slidesOffWithItsSegment() {
        // Pinned block can't pass the segment's far end: 50 - 90 = -40.
        assertEquals(-40f, start(-200f, 50f)!!, 0.01f)
        assertNull(start(-300f, 0f)) // segment gone, block gone
    }

    @Test
    fun endClue_inView_staysInPlace() {
        assertNull(end(80f, 280f)) // clue at 280..400
    }

    @Test
    fun endClue_offRight_pinsToRightEdge() {
        assertEquals(VIEW - PINNED, end(100f, 300f)!!, 0.01f)
        assertEquals(VIEW - PINNED, end(100f, 700f)!!, 0.01f)
    }

    @Test
    fun endClue_slidesOffWithItsSegment() {
        assertEquals(350f, end(350f, 700f)!!, 0.01f)
        assertNull(end(400f, 700f))
    }
}
