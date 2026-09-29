package com.puzzleplatform.player.ui.board

/**
 * Zoom/pan math for the Nonogram board's sticky-hint (frozen-pane) layout, factored
 * out of the composable so it can be unit-tested on the JVM. It is the rectangular
 * cousin of [BoardTransform]: the clue bands are drawn at a fixed pixel depth around
 * the grid, so the grid's drawing area is a rectangle ([gridW] x [gridH]) rather than
 * the whole square viewport, and each axis clamps independently.
 *
 * Coordinates: the full canvas is [bandW] + [gridW] wide and [bandH] + [gridH] tall.
 * The grid is drawn at ([bandW], [bandH]) offset by ([panX], [panY]); the row-clue
 * band is pinned to x in [0, bandW] and pans only vertically (so row r's clue always
 * tracks row r), the column-clue band is pinned to y in [0, bandH] and pans only
 * horizontally, and the ([bandW] x [bandH]) corner is static.
 *
 * [cellPx] is shared by both axes (cells are square). Panning keeps the board from
 * being dragged entirely out of the grid area; a board that already fits is centered.
 */
class NonogramTransform(
    val cols: Int,
    val rows: Int,
    val gridW: Float,
    val gridH: Float,
    val bandW: Float,
    val bandH: Float,
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
        // Fit the whole board inside the (rectangular) grid area.
        val fitAll = minOf(
            if (cols > 0) gridW / cols else gridW,
            if (rows > 0) gridH / rows else gridH,
        )
        minCell = minOf(fitAll, maxCellPx)
        maxCell = maxCellPx.coerceAtLeast(minCell)
        cellPx = fitAll.coerceAtLeast(autoCellPx).coerceIn(minCell, maxCell)
        panX = BoardTransform.clampAxis(0f, cols * cellPx, gridW)
        panY = BoardTransform.clampAxis(0f, rows * cellPx, gridH)
    }

    /** True when there's a real zoom range (a board that fits at max cell has none). */
    val zoomable: Boolean get() = maxCell - minCell > 0.5f

    /** True when cells are big enough to reliably tap/paint. */
    val entryEnabled: Boolean get() = cellPx >= entryFloorPx

    /**
     * Apply a pinch/drag about ([centroidX], [centroidY]) in canvas coordinates,
     * keeping the point under the fingers fixed, then translate by the drag. The
     * centroid is converted to grid-local space (minus the band offsets) so zoom
     * anchors correctly under the fingers.
     */
    fun transform(centroidX: Float, centroidY: Float, panDx: Float, panDy: Float, zoomChange: Float) {
        val newCell = (cellPx * zoomChange).coerceIn(minCell, maxCell)
        val ratio = newCell / cellPx
        val gx = centroidX - bandW
        val gy = centroidY - bandH
        val nx = gx - (gx - panX) * ratio + panDx
        val ny = gy - (gy - panY) * ratio + panDy
        cellPx = newCell
        panX = BoardTransform.clampAxis(nx, cols * newCell, gridW)
        panY = BoardTransform.clampAxis(ny, rows * newCell, gridH)
    }

    /**
     * Map a point in canvas coordinates to a (col, row), or null if it falls outside
     * the grid region (e.g. over a clue band) or entry is disabled (cells too small).
     */
    fun cellAt(x: Float, y: Float): Pair<Int, Int>? {
        if (!entryEnabled) return null
        if (x < bandW || y < bandH) return null // over a band, not the grid
        val col = ((x - bandW - panX) / cellPx).toInt()
        val row = ((y - bandH - panY) / cellPx).toInt()
        return if (col in 0 until cols && row in 0 until rows) col to row else null
    }
}
