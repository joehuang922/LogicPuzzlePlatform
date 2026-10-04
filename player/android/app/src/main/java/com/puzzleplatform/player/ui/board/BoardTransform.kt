package com.puzzleplatform.player.ui.board

/**
 * Pure zoom/pan math for [ZoomableBoard], factored out of the composable so the
 * gesture behavior can be unit-tested on the JVM (no emulator, no multitouch
 * simulation). All sizes are in pixels; the board is a cols x rows grid drawn at
 * [cellPx] per cell inside a square viewport of side [viewportPx], offset by
 * ([panX], [panY]) from the viewport's top-left.
 *
 * Zoom model:
 *  - [minCell] fits the whole board in the viewport (may be below [entryFloorPx]
 *    for large grids — viewing/panning still work, entry is disabled);
 *  - [maxCell] is the largest cell (zoom-in stop);
 *  - the initial cell auto-zooms to at least [autoCellPx], anchored top-left.
 */
class BoardTransform(
    val cols: Int,
    val rows: Int,
    val viewportPx: Float,
    maxCellPx: Float,
    autoCellPx: Float,
    private val entryFloorPx: Float,
) {
    val minCell: Float
    val maxCell: Float

    var cellPx: Float
        private set
    var panX: Float
        private set
    var panY: Float
        private set

    init {
        val fitAll = viewportPx / maxOf(cols, rows)
        minCell = minOf(fitAll, maxCellPx)
        maxCell = maxCellPx.coerceAtLeast(minCell)
        cellPx = fitAll.coerceAtLeast(autoCellPx).coerceIn(minCell, maxCell)
        panX = clampAxis(0f, cols * cellPx, viewportPx)
        panY = clampAxis(0f, rows * cellPx, viewportPx)
    }

    /** True when there's a real zoom range (a board that fits at max cell has none). */
    val zoomable: Boolean get() = maxCell - minCell > 0.5f

    /** True when cells are big enough to reliably tap-to-enter. */
    val entryEnabled: Boolean get() = cellPx >= entryFloorPx

    /**
     * Apply a pinch/drag: scale toward [zoomChange] about [centroidX]/[centroidY]
     * (keeping the point under the fingers fixed), then translate by the drag.
     */
    fun transform(centroidX: Float, centroidY: Float, panDx: Float, panDy: Float, zoomChange: Float) {
        val newCell = (cellPx * zoomChange).coerceIn(minCell, maxCell)
        val ratio = newCell / cellPx
        val nx = centroidX - (centroidX - panX) * ratio + panDx
        val ny = centroidY - (centroidY - panY) * ratio + panDy
        cellPx = newCell
        panX = clampAxis(nx, cols * newCell, viewportPx)
        panY = clampAxis(ny, rows * newCell, viewportPx)
    }

    /**
     * Map a tap at viewport coordinates to a (col, row), or null if it falls
     * outside the grid or entry is disabled (cells too small).
     */
    fun cellAt(x: Float, y: Float): Pair<Int, Int>? {
        if (!entryEnabled) return null
        val col = ((x - panX) / cellPx).toInt()
        val row = ((y - panY) / cellPx).toInt()
        return if (col in 0 until cols && row in 0 until rows) col to row else null
    }

    /**
     * Map a tap to *fractional* board coordinates in cell units — e.g. (1.5, 2.0) is
     * the top edge of cell (col 1, row 2). Returns null outside the grid or when entry
     * is disabled. Lets a board decide a sub-cell target (which grid line a tap is
     * nearest) that the integer [cellAt] can't express; the whole closed range
     * [0, cols] x [0, rows] is in-bounds so taps on the far border still map.
     */
    fun fractionalCellAt(x: Float, y: Float): Pair<Float, Float>? {
        if (!entryEnabled) return null
        val col = (x - panX) / cellPx
        val row = (y - panY) / cellPx
        return if (col in 0f..cols.toFloat() && row in 0f..rows.toFloat()) col to row else null
    }

    companion object {
        /**
         * Clamp one axis of the pan offset: center the board when it's smaller than
         * the viewport, otherwise keep it within bounds so it can't be dragged
         * completely off-screen.
         */
        fun clampAxis(pan: Float, boardSize: Float, viewport: Float): Float =
            if (boardSize <= viewport) (viewport - boardSize) / 2f
            else pan.coerceIn(viewport - boardSize, 0f)
    }
}
