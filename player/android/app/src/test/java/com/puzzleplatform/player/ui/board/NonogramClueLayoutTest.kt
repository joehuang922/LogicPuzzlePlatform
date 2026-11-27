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
    fun labelStep_everyFifthLine_widenWhenZoomedOut() {
        assertEquals(5, NonogramClueLayout.labelStep(cell = 40f, labelExtent = 20f))
        assertEquals(10, NonogramClueLayout.labelStep(cell = 4f, labelExtent = 20f))
    }

    @Test
    fun labels_countBothWays_withEdgesOneSided() {
        val labels = NonogramClueLayout.labels(count = 15, cell = 40f, labelExtent = 20f)
        assertEquals(
            listOf(
                NonogramClueLayout.Label(0, null, 15),
                NonogramClueLayout.Label(5, 5, 10),
                NonogramClueLayout.Label(10, 10, 5),
                NonogramClueLayout.Label(15, 15, null),
            ),
            labels,
        )
    }

    @Test
    fun labels_lineTooCloseToFarEdge_isLeftOut() {
        // 72 cells at 10px: line 70 is 20px from the edge, too close for a 30px label.
        val lines = NonogramClueLayout.labels(count = 72, cell = 10f, labelExtent = 30f).map { it.line }
        assertEquals(listOf(0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 72), lines)
    }

    @Test
    fun coordinatesDefault_onlyAboveForty() {
        assertFalse(nonogramCoordinatesDefault(40, 30))
        assertTrue(nonogramCoordinatesDefault(20, 45))
    }
}
