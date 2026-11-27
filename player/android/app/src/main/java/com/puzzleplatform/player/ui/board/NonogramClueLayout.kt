package com.puzzleplatform.player.ui.board

/** Coordinates start switched on for boards whose longer side is above this. */
const val NONOGRAM_COORDINATES_DEFAULT_ABOVE = 40

/** Whether a board starts with coordinates on: its longer side is past 40. */
fun nonogramCoordinatesDefault(rows: Int, cols: Int): Boolean = maxOf(rows, cols) > NONOGRAM_COORDINATES_DEFAULT_ABOVE

/**
 * Pure layout math for the Nonogram board's clue bands and coordinates, kept free of
 * Android types so it runs in JVM unit tests. Text widths come in "em": a number's
 * advance width at text size 1 (measure at any size and divide by it), so a layout
 * scales with the text size it picks.
 */
object NonogramClueLayout {
    /** Space between neighbouring numbers on a row clue, in em. */
    const val ROW_GAP_EM = 0.6f
    /** Space kept between a row clue and either edge of its band, in em. */
    const val ROW_EDGE_EM = 0.3f
    /** Column clues stack vertically: one number per [COL_SLOT_EM] of text size. */
    const val COL_SLOT_EM = 1.15f
    /** Share of the band a column clue may fill (keeps the top number off the edge). */
    const val COL_USABLE = 0.94f
    /** Share of a cell's width a column-clue number (or row-clue height) may take. */
    const val CROSS_FILL = 0.9f

    /** A laid-out clue line: its text size and each number's center along the line. */
    class Line(val textSize: Float, val centers: FloatArray)

    /**
     * Row clue laid out right-aligned against [band]'s inner edge (x = [band]). Each
     * number takes its own measured width plus a fixed em gap, so a run of two-digit
     * numbers never runs together ("12 13 4 5 21", not "12134521"); a line too long for
     * the band shrinks the text — gaps shrink with it but never close. [maxSize] caps the
     * size (the zoom-derived size, and the row height so rows don't overlap).
     */
    fun row(widthsEm: FloatArray, maxSize: Float, band: Float): Line {
        val n = widthsEm.size
        if (n == 0) return Line(maxSize, FloatArray(0))
        val totalEm = widthsEm.sum() + ROW_GAP_EM * (n - 1) + ROW_EDGE_EM * 2
        val size = minOf(maxSize, band / totalEm)
        val centers = FloatArray(n)
        var right = band - ROW_EDGE_EM * size
        for (i in n - 1 downTo 0) {
            val w = widthsEm[i] * size
            centers[i] = right - w / 2
            right -= w + ROW_GAP_EM * size
        }
        return Line(size, centers)
    }

    /**
     * Column clue stacked bottom-aligned against the band's inner edge (y = [band]).
     * The text also fits the column's width: the widest number takes at most
     * [CROSS_FILL] of [cell], so neighbouring columns' two-digit numbers don't touch.
     */
    fun col(widthsEm: FloatArray, maxSize: Float, cell: Float, band: Float): Line {
        val n = widthsEm.size
        val widest = widthsEm.maxOrNull() ?: 0f
        var size = maxSize
        if (widest > 0f) size = minOf(size, cell * CROSS_FILL / widest)
        if (n > 0) size = minOf(size, band * COL_USABLE / (n * COL_SLOT_EM))
        val slot = size * COL_SLOT_EM
        return Line(size, FloatArray(n) { i -> band - (n - i - 0.5f) * slot })
    }

    /**
     * Spacing of the coordinate labels: every 5th line (the thick separators), or every
     * 10th, 20th, ... when the cells are too small for labels [labelExtent] long (plus a
     * little air) to sit 5 lines apart.
     */
    fun labelStep(cell: Float, labelExtent: Float): Int {
        var step = 5
        while (step * cell < labelExtent * 1.3f && step < 10_000) step *= 2
        return step
    }

    /**
     * A coordinate label at line [line] (between cells [line] and [line] + 1, 0-based):
     * [fromStart] lines before it, [fromEnd] after it. Each is null at the board edge
     * it would count from (no "0" sticking off the board).
     */
    data class Label(val line: Int, val fromStart: Int?, val fromEnd: Int?)

    /**
     * Labels along a board [count] cells long: both edges, plus every [labelStep]th line
     * in between, counting both ways (5 | 65 on a 70-long board). A line too close to
     * the far edge for its label to clear the edge's is left out.
     */
    fun labels(count: Int, cell: Float, labelExtent: Float): List<Label> {
        if (count <= 0) return emptyList()
        val step = labelStep(cell, labelExtent)
        val inner = (step until count step step).filter { (count - it) * cell >= labelExtent * 1.3f }
        return buildList {
            add(Label(0, null, count))
            for (line in inner) add(Label(line, line, count - line))
            add(Label(count, count, null))
        }
    }
}
