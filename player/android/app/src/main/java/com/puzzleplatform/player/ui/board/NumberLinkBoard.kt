package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.NumberLinkEngine
import kotlin.math.abs

private val GRID_BG = Color.White
private val BORDER = Color(0xFF222222)
private val GRID_LINE = Color(0xFFCCCCCC)
private val PATH_COLOR = Color(0xFF2563EB)
private val TOKEN_FILL = Color.White
private val TOKEN_STROKE = Color(0xFF222222)
private val TOKEN_TEXT = Color(0xFF222222)

/**
 * Compose Canvas renderer for Number Link (puzzle type 17), the analog of
 * frontend/src/components/NumberLinkBoard.tsx.
 *
 * The player draws paths between adjacent cell centers by dragging. A one-finger drag from
 * any cell into an orthogonally-adjacent cell toggles the shared segment: the first toggled
 * segment of a stroke fixes draw-vs-erase (if it was already drawn, the whole stroke
 * erases; otherwise it draws). Drawing is degree-capped — a segment is only added when both
 * endpoint cells have spare capacity (endpoints allow degree 1, other cells degree 2) — so
 * the player can't create crossings or branches. Two fingers pan/zoom via [ZoomableBoard].
 *
 * Paths render as thick blue segments between cell centers; numbered endpoints render as a
 * digit inside a white token on top.
 */
@Composable
fun NumberLinkBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onSetEdge: (key: String, state: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cells = remember(puzzle.id) { NumberLinkEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    // The gesture closures outlive recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values/callback through state.
    val valuesState = rememberUpdatedState(userValues)
    val cellsState = rememberUpdatedState(cells)
    val onSet = rememberUpdatedState(onSetEdge)

    val drag = remember(puzzle.id) { NumberLinkDragState(rows, cols) }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { _, _ -> }, // a plain tap draws nothing; paths need a drag
        onDrawStart = { cell -> drag.start(cell) },
        onDrawTo = { cell ->
            drag.moveTo(cell, cellsState.value, valuesState.value) { key, st -> onSet.value(key, st) }
        },
        onDrawEnd = { drag.end() },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))
        val values = valuesState.value

        // Inner grid lines (thin). Outer border drawn thicker below.
        val gridW = 1.dp.toPx()
        for (r in 1 until rows) {
            drawLine(GRID_LINE, Offset(0f, r * cell), Offset(boardW, r * cell), gridW)
        }
        for (c in 1 until cols) {
            drawLine(GRID_LINE, Offset(c * cell, 0f), Offset(c * cell, boardH), gridW)
        }

        // Drawn path segments (under the tokens). Segment centers sit at cell centers.
        val pathW = cell * 0.14f
        for (r in 0 until rows) {
            for (c in 0 until cols - 1) {
                if (values[NumberLinkEngine.hKey(r, c)] == NumberLinkEngine.SEGMENT) {
                    drawLine(
                        PATH_COLOR,
                        Offset((c + 0.5f) * cell, (r + 0.5f) * cell),
                        Offset((c + 1.5f) * cell, (r + 0.5f) * cell),
                        pathW,
                        cap = StrokeCap.Round,
                    )
                }
            }
        }
        for (r in 0 until rows - 1) {
            for (c in 0 until cols) {
                if (values[NumberLinkEngine.vKey(r, c)] == NumberLinkEngine.SEGMENT) {
                    drawLine(
                        PATH_COLOR,
                        Offset((c + 0.5f) * cell, (r + 0.5f) * cell),
                        Offset((c + 0.5f) * cell, (r + 1.5f) * cell),
                        pathW,
                        cap = StrokeCap.Round,
                    )
                }
            }
        }

        // Outer border on top of grid lines.
        val borderW = 2.dp.toPx()
        drawLine(BORDER, Offset(0f, 0f), Offset(boardW, 0f), borderW)
        drawLine(BORDER, Offset(0f, boardH), Offset(boardW, boardH), borderW)
        drawLine(BORDER, Offset(0f, 0f), Offset(0f, boardH), borderW)
        drawLine(BORDER, Offset(boardW, 0f), Offset(boardW, boardH), borderW)

        // Numbered endpoint tokens on top of paths.
        val tokenRadius = cell * 0.36f
        val tokenStrokeW = cell * 0.06f
        for (r in 0 until rows) {
            for (c in 0 until cells[r].size) {
                val v = cells[r][c]
                if (v <= 0) continue
                val cx = (c + 0.5f) * cell
                val cy = (r + 0.5f) * cell
                drawCircle(TOKEN_FILL, tokenRadius, Offset(cx, cy))
                drawCircle(TOKEN_STROKE, tokenRadius, Offset(cx, cy), style = androidx.compose.ui.graphics.drawscope.Stroke(tokenStrokeW))
                drawToken(v, cx, cy, cell)
            }
        }
    }
}

/** Draw a (possibly multi-digit) endpoint number centered at (cx, cy). */
private fun DrawScope.drawToken(value: Int, cx: Float, cy: Float, cell: Float) {
    val textSize = cell * (if (value >= 10) 0.36f else 0.44f)
    val paint = android.graphics.Paint().apply {
        color = TOKEN_TEXT.toArgb()
        this.textSize = textSize
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy - (fm.ascent + fm.descent) / 2, paint)
}

/**
 * Tracks a single draw/erase stroke (port of NumberLinkBoard.tsx pointer handlers). Each
 * step toggles the segment between the last cell and the newly-entered adjacent cell. The
 * first toggled segment fixes the mode: if it was already drawn, the stroke erases; else it
 * draws. Draw steps are degree-capped so no crossing/branch can be created; a blocked draw
 * leaves the anchor in place so a later legal move from the same cell can still proceed.
 */
private class NumberLinkDragState(private val rows: Int, private val cols: Int) {
    private var last: Pair<Int, Int>? = null
    // null = undecided, true = erasing, false = drawing.
    private var erasing: Boolean? = null

    fun start(cell: Pair<Int, Int>?) {
        last = cell
        erasing = null
    }

    fun moveTo(
        cell: Pair<Int, Int>?,
        cells: List<List<Int>>,
        values: Map<String, Int>,
        set: (String, Int) -> Unit,
    ) {
        if (cell == null) return
        val from = last ?: run { last = cell; return }
        if (cell == from) return
        val dr = cell.first - from.first
        val dc = cell.second - from.second
        if (abs(dr) + abs(dc) != 1) {
            // Non-adjacent jump (fast drag): re-anchor without drawing.
            last = cell
            return
        }

        // Identify the shared segment key between `from` and `cell`.
        val key = when {
            dc == 1 -> NumberLinkEngine.hKey(from.first, from.second)
            dc == -1 -> NumberLinkEngine.hKey(from.first, cell.second)
            dr == 1 -> NumberLinkEngine.vKey(from.first, from.second)
            else -> NumberLinkEngine.vKey(cell.first, from.second)
        }
        val edgeVal = values[key] ?: NumberLinkEngine.EMPTY

        if (erasing == null) erasing = edgeVal == NumberLinkEngine.SEGMENT

        if (erasing == true) {
            if (edgeVal == NumberLinkEngine.SEGMENT) set(key, NumberLinkEngine.EMPTY)
            last = cell
            return
        }

        // Draw mode: only add if both cells have spare degree capacity.
        if (edgeVal == NumberLinkEngine.EMPTY) {
            val e = NumberLinkEngine.edges(cells, values)
            val maxFrom = if ((cells.getOrNull(from.first)?.getOrNull(from.second) ?: 0) > 0) 1 else 2
            val maxCell = if ((cells.getOrNull(cell.first)?.getOrNull(cell.second) ?: 0) > 0) 1 else 2
            if (NumberLinkEngine.degreeOf(e, from.first, from.second, rows, cols) >= maxFrom ||
                NumberLinkEngine.degreeOf(e, cell.first, cell.second, rows, cols) >= maxCell
            ) {
                // Blocked: keep the anchor so a later legal move can retry.
                return
            }
            set(key, NumberLinkEngine.SEGMENT)
        }
        last = cell
    }

    fun end() {
        last = null
        erasing = null
    }
}
