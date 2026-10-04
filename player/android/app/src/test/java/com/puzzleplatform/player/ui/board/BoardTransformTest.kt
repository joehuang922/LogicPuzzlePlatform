package com.puzzleplatform.player.ui.board

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Zoom/pan math for the shared board viewport. Uses round numbers so the geometry
 * is easy to follow: a 1080px-wide viewport, 40px max cell, 28px auto-zoom target,
 * 24px entry floor (the px equivalents of the dp constants at density 1x).
 */
class BoardTransformTest {

    private val VP = 1080f
    private val MAX = 40f
    private val AUTO = 28f
    private val FLOOR = 24f

    private fun make(cols: Int, rows: Int) = BoardTransform(cols, rows, VP, MAX, AUTO, FLOOR)

    // -- initial fit --------------------------------------------------------

    @Test
    fun smallBoard_fitsAtMaxCell_noZoomRange() {
        // 9x9 in a 1080px viewport would fit-all at 120px, capped to the 40px max.
        val t = make(9, 9)
        assertEquals(40f, t.cellPx, 0.01f)
        assertEquals(40f, t.minCell, 0.01f)
        assertEquals(40f, t.maxCell, 0.01f)
        assertFalse(t.zoomable)
        assertTrue(t.entryEnabled)
        // Board (360px) smaller than viewport -> centered.
        assertEquals((1080f - 360f) / 2f, t.panX, 0.01f)
    }

    @Test
    fun largeBoard_autoZoomsToAutoCell_anchoredTopLeft() {
        // 30x30: fit-all cell = 1080/30 = 36px, which is >= the 28px auto target,
        // so it opens fully fitted (36px), top-left, and can still zoom in to 40px.
        val t = make(30, 30)
        assertEquals(36f, t.cellPx, 0.01f)
        assertEquals(36f, t.minCell, 0.01f)
        assertEquals(40f, t.maxCell, 0.01f)
        assertTrue(t.zoomable)
        // Board (1080px) fills the viewport exactly -> pan pinned at 0.
        assertEquals(0f, t.panX, 0.01f)
        assertEquals(0f, t.panY, 0.01f)
        assertTrue(t.entryEnabled)
    }

    @Test
    fun veryLargeBoard_autoZoomKeepsCellsAtLeastAuto() {
        // 60x60: fit-all cell = 18px (below the 28 auto target), so it opens zoomed
        // to 28px, anchored top-left, with cells above the entry floor.
        val t = make(60, 60)
        assertEquals(28f, t.cellPx, 0.01f)
        assertEquals(18f, t.minCell, 0.01f) // zooming all the way out fits the board
        assertEquals(40f, t.maxCell, 0.01f)
        assertEquals(0f, t.panX, 0.01f) // top-left
        assertTrue(t.entryEnabled)
    }

    // -- entry floor --------------------------------------------------------

    @Test
    fun entryDisabledWhenZoomedOutBelowFloor() {
        val t = make(60, 60) // min cell 18px < 24px floor
        // Zoom all the way out (large pinch-out about the origin).
        t.transform(0f, 0f, 0f, 0f, 0.01f)
        assertEquals(18f, t.cellPx, 0.01f)
        assertFalse(t.entryEnabled)
        assertNull(t.cellAt(10f, 10f)) // taps ignored while too small
    }

    // -- zoom clamps --------------------------------------------------------

    @Test
    fun zoomInStopsAtMaxCell() {
        val t = make(30, 30)
        t.transform(540f, 540f, 0f, 0f, 100f) // huge zoom-in
        assertEquals(40f, t.cellPx, 0.01f)
    }

    @Test
    fun zoomOutStopsAtMinCellAndRecenters() {
        val t = make(60, 60)
        t.transform(0f, 0f, 0f, 0f, 0.0001f) // zoom fully out
        assertEquals(18f, t.cellPx, 0.01f)
        // At min cell the board (1080px) exactly fills the viewport -> pan 0.
        assertEquals(0f, t.panX, 0.01f)
    }

    // -- centroid-anchored zoom --------------------------------------------

    @Test
    fun zoomKeepsPointUnderCentroidFixed() {
        val t = make(60, 60) // starts at 28px cell, pan (0,0)
        // The board point under viewport (200,300) before zoom:
        val bxBefore = (200f - t.panX) / t.cellPx
        val byBefore = (300f - t.panY) / t.cellPx
        t.transform(200f, 300f, 0f, 0f, 40f / 28f) // zoom 28 -> 40 about (200,300)
        assertEquals(40f, t.cellPx, 0.01f)
        // Same board point should still sit under (200,300) (within clamp tolerance).
        val bxAfter = (200f - t.panX) / t.cellPx
        val byAfter = (300f - t.panY) / t.cellPx
        assertEquals(bxBefore, bxAfter, 0.02f)
        assertEquals(byBefore, byAfter, 0.02f)
    }

    // -- pan clamp ----------------------------------------------------------

    @Test
    fun panCannotDragBoardOffScreen() {
        val t = make(60, 60)
        t.transform(0f, 0f, 0f, 0f, 40f / 28f) // zoom in to 40px -> board 2400px
        // Drag far right/down; pan is clamped so the board still covers the viewport.
        t.transform(540f, 540f, 100000f, 100000f, 1f)
        assertTrue(t.panX <= 0f)
        assertTrue(t.panX >= VP - t.cols * t.cellPx)
        // Drag far left/up.
        t.transform(540f, 540f, -100000f, -100000f, 1f)
        assertTrue(t.panX <= 0f)
        assertEquals(VP - t.cols * t.cellPx, t.panX, 0.01f)
    }

    // -- tap mapping --------------------------------------------------------

    @Test
    fun cellAtMapsViewportTapToGridCellUnderZoomAndPan() {
        val t = make(60, 60) // 28px cell, pan (0,0)
        assertEquals(0 to 0, t.cellAt(5f, 5f))
        assertEquals(1 to 0, t.cellAt(30f, 5f)) // second column at 28..56
        assertEquals(0 to 1, t.cellAt(5f, 30f))
        // After a pan, the same viewport point maps to a different cell.
        t.transform(540f, 540f, -56f, 0f, 1f) // shift board left by ~2 cells worth
        val cell = t.cellAt(5f, 5f)
        assertEquals(2, cell?.first) // now column 2 sits at the left edge
    }

    @Test
    fun cellAtReturnsNullOutsideGrid() {
        val t = make(9, 9) // 40px cell, board centered (360px) in 1080px
        // Left margin (before the board starts) is empty space.
        assertNull(t.cellAt(1f, 540f))
    }

    // -- fractional tap mapping (Fillomino wall snapping) ------------------

    @Test
    fun fractionalCellAtGivesSubCellPosition() {
        val t = make(60, 60) // 28px cell, pan (0,0)
        // 42px is 1.5 cells across -> the interior line between col 1 and col 2.
        val (col, row) = t.fractionalCellAt(42f, 14f)!!
        assertEquals(1.5f, col, 0.01f)
        assertEquals(0.5f, row, 0.01f)
    }

    @Test
    fun fractionalCellAtIncludesFarBorder() {
        val t = make(9, 9) // 40px cell, board centered at panX = 360
        // A tap exactly on the right border maps to col == cols (9.0), still in-bounds.
        val (col, _) = t.fractionalCellAt(t.panX + 9 * 40f, t.panY + 40f)!!
        assertEquals(9f, col, 0.01f)
    }

    @Test
    fun fractionalCellAtReturnsNullOutsideGrid() {
        val t = make(9, 9)
        assertNull(t.fractionalCellAt(1f, 540f)) // left margin, before the board
    }
}
