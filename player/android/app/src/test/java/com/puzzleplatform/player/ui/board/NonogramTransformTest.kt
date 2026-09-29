package com.puzzleplatform.player.ui.board

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Zoom/pan math for the Nonogram sticky-hint layout. The canvas is 1080px square;
 * the clue bands are 200px deep, so the grid drawing area is an 880px x 880px
 * rectangle offset by (200,200). Max cell 40px, auto target 26px, entry floor 18px.
 */
class NonogramTransformTest {

    private val CANVAS = 1080f
    private val BAND = 200f
    private val GRID = CANVAS - BAND // 880
    private val MAX = 40f
    private val AUTO = 26f
    private val FLOOR = 18f

    private fun make(cols: Int, rows: Int) =
        NonogramTransform(cols, rows, GRID, GRID, BAND, BAND, MAX, AUTO, FLOOR)

    // -- initial fit --------------------------------------------------------

    @Test
    fun smallBoard_fitsAtMaxCell_centeredInGridArea() {
        // 10x10 would fit-all at 88px, capped to the 40px max -> no zoom range.
        val t = make(10, 10)
        assertEquals(40f, t.cellPx, 0.01f)
        assertFalse(t.zoomable)
        assertTrue(t.entryEnabled)
        // Board (400px) smaller than the 880px grid area -> centered within it.
        assertEquals((GRID - 400f) / 2f, t.panX, 0.01f)
    }

    @Test
    fun largeBoard_fitsInsideRectangularGridArea() {
        // 25x25: fit-all cell = 880/25 = 35.2px (>= 26 auto), opens fully fitted.
        val t = make(25, 25)
        assertEquals(35.2f, t.cellPx, 0.01f)
        assertEquals(35.2f, t.minCell, 0.01f)
        assertEquals(40f, t.maxCell, 0.01f)
        assertTrue(t.zoomable)
        assertEquals(0f, t.panX, 0.01f) // board fills grid area -> pinned
        assertTrue(t.entryEnabled)
    }

    // -- hit-testing accounts for the band offset ---------------------------

    @Test
    fun cellAt_returnsNullOverBands() {
        val t = make(25, 25)
        assertNull(t.cellAt(10f, 10f))    // corner
        assertNull(t.cellAt(500f, 50f))   // top (column-clue) band
        assertNull(t.cellAt(50f, 500f))   // left (row-clue) band
    }

    @Test
    fun cellAt_mapsGridPointsOffsetByBand() {
        val t = make(25, 25) // 35.2px cell, pan (0,0), grid starts at (200,200)
        // Just inside the grid origin -> cell (0,0).
        assertEquals(0 to 0, t.cellAt(BAND + 2f, BAND + 2f))
        // One cell right/down.
        assertEquals(1 to 0, t.cellAt(BAND + 40f, BAND + 2f))
        assertEquals(0 to 1, t.cellAt(BAND + 2f, BAND + 40f))
    }

    // -- pan clamp keeps the grid covering its area -------------------------

    @Test
    fun panCannotDragBoardOffGridArea() {
        val t = make(25, 25)
        t.transform(BAND + 10f, BAND + 10f, 0f, 0f, 40f / 35.2f) // zoom in -> board 1000px
        t.transform(BAND + 10f, BAND + 10f, 100000f, 100000f, 1f) // drag far
        assertTrue(t.panX <= 0f)
        assertTrue(t.panX >= GRID - t.cols * t.cellPx)
    }

    // -- centroid-anchored zoom (in canvas coords) --------------------------

    @Test
    fun zoomKeepsCanvasPointUnderCentroidFixed() {
        val t = make(25, 25)
        val px = 500f
        val py = 600f
        // Grid-local board coordinate under the canvas centroid before zoom.
        val bxBefore = (px - BAND - t.panX) / t.cellPx
        val byBefore = (py - BAND - t.panY) / t.cellPx
        t.transform(px, py, 0f, 0f, 40f / t.cellPx)
        assertEquals(40f, t.cellPx, 0.01f)
        val bxAfter = (px - BAND - t.panX) / t.cellPx
        val byAfter = (py - BAND - t.panY) / t.cellPx
        assertEquals(bxBefore, bxAfter, 0.05f)
        assertEquals(byBefore, byAfter, 0.05f)
    }

    // -- entry floor --------------------------------------------------------

    @Test
    fun entryDisabledWhenCellsTooSmall() {
        // 60x60: fit-all = 880/60 ≈ 14.67px, below the 18px floor.
        val t = make(60, 60)
        t.transform(BAND, BAND, 0f, 0f, 0.001f) // zoom fully out
        assertFalse(t.entryEnabled)
        assertNull(t.cellAt(BAND + 5f, BAND + 5f))
    }
}
