package com.puzzleplatform.player.ui.board

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NonogramClueLayoutTest {

    // Bold digits are ~0.55em wide; two-digit numbers ~1.1em.
    private val ONE = 0.55f
    private val TWO = 1.1f

    @Test
    fun row_fitsAtFullSize_rightAligned() {
        val line = NonogramClueLayout.row(floatArrayOf(ONE, TWO), maxSize = 30f, band = 400f)
        assertEquals(30f, line.textSize, 0.01f)
        // Last number ends an edge margin short of the band's inner edge.
        assertEquals(400f - NonogramClueLayout.ROW_EDGE_EM * 30f - TWO * 30f / 2, line.centers[1], 0.01f)
    }

    @Test
    fun row_longTwoDigitRun_shrinksButKeepsGaps() {
        // "12 13 4 5 21" and more: far too long for the band at full size.
        val widths = floatArrayOf(TWO, TWO, ONE, ONE, TWO, TWO, TWO, ONE, TWO, TWO, TWO, ONE)
        val band = 300f
        val line = NonogramClueLayout.row(widths, maxSize = 34f, band = band)
        assertTrue(line.textSize < 34f)
        for (i in 0 until widths.size - 1) {
            val rightEdge = line.centers[i] + widths[i] * line.textSize / 2
            val nextLeft = line.centers[i + 1] - widths[i + 1] * line.textSize / 2
            assertEquals(NonogramClueLayout.ROW_GAP_EM * line.textSize, nextLeft - rightEdge, 0.01f)
        }
        // Whole line stays inside the band.
        assertTrue(line.centers[0] - widths[0] * line.textSize / 2 >= -0.01f)
        assertTrue(line.centers.last() + widths.last() * line.textSize / 2 <= band + 0.01f)
    }

    @Test
    fun col_twoDigitNumberFitsColumnWidth() {
        val line = NonogramClueLayout.col(floatArrayOf(TWO, ONE), maxSize = 34f, cell = 20f, band = 300f)
        assertTrue(TWO * line.textSize <= 20f * NonogramClueLayout.CROSS_FILL + 0.01f)
    }

    @Test
    fun col_bottomAligned_and_fitsBand() {
        val n = 30
        val line = NonogramClueLayout.col(FloatArray(n) { ONE }, maxSize = 34f, cell = 60f, band = 200f)
        val slot = line.textSize * NonogramClueLayout.COL_SLOT_EM
        assertEquals(200f - slot / 2, line.centers[n - 1], 0.01f)
        assertTrue(line.centers[0] - slot / 2 >= 200f * (1 - NonogramClueLayout.COL_USABLE) - 0.01f)
    }

    @Test
    fun labels_everyFifthLine_widenWhenZoomedOut() {
        assertEquals(5, NonogramClueLayout.labelStep(cell = 40f, labelExtent = 20f))
        assertEquals(10, NonogramClueLayout.labelStep(cell = 4f, labelExtent = 20f))
        assertEquals(listOf(5, 10, 15), NonogramClueLayout.labelLines(17, 5))
        assertEquals(listOf(10, 20), NonogramClueLayout.labelLines(20, 10))
    }

    @Test
    fun label_atFarEdge_slidesInside() {
        assertEquals(100f, NonogramClueLayout.labelCenter(5, 20f, 50, 16f), 0.01f)
        assertEquals(1000f - 8f, NonogramClueLayout.labelCenter(50, 20f, 50, 16f), 0.01f)
    }

    @Test
    fun labelsDefault_onlyAboveForty() {
        assertFalse(nonogramLabelsDefault(40, 30))
        assertTrue(nonogramLabelsDefault(20, 45))
    }
}
