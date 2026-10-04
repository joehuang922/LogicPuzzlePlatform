package com.puzzleplatform.player.ui.board

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pure wall-snapping math for Fillomino's WALL mode: a fractional tap (in cell units)
 * maps to the nearest interior grid line, or null near a border. Uses a 3x3 grid.
 */
class FillominoWallSnapTest {

    private val ROWS = 3
    private val COLS = 3

    @Test
    fun snapsToNearestHorizontalInteriorLine() {
        // Tap just below the line between row 0 and row 1 (y=1), inside column 2.
        assertEquals("h:0,2", wallKeyAt(fx = 2.4f, fy = 1.05f, rows = ROWS, cols = COLS))
    }

    @Test
    fun snapsToNearestVerticalInteriorLine() {
        // Tap just right of the line between col 1 and col 2 (x=2), inside row 0.
        assertEquals("v:0,1", wallKeyAt(fx = 2.05f, fy = 0.6f, rows = ROWS, cols = COLS))
    }

    @Test
    fun prefersWhicheverLineIsCloser() {
        // Near the (1,1) grid intersection but clearly closer to the vertical line.
        assertEquals("v:0,0", wallKeyAt(fx = 1.02f, fy = 0.7f, rows = ROWS, cols = COLS))
        // ...and clearly closer to the horizontal line.
        assertEquals("h:0,0", wallKeyAt(fx = 0.7f, fy = 1.02f, rows = ROWS, cols = COLS))
    }

    @Test
    fun returnsNullNearOuterBorder() {
        // Nearest lines are both borders (top-left corner) -> no wall to toggle.
        assertNull(wallKeyAt(fx = 0.1f, fy = 0.1f, rows = ROWS, cols = COLS))
        // Nearest horizontal line is the bottom border (y=3); nearest vertical is also
        // the right border (x=3).
        assertNull(wallKeyAt(fx = 2.95f, fy = 2.95f, rows = ROWS, cols = COLS))
    }
}
