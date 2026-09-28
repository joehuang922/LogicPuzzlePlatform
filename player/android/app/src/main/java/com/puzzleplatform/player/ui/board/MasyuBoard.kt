package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.MasyuEngine
import kotlin.math.abs

private val GRID_BG = Color.White
private val BORDER = Color(0xFF222222)
private val GRID_LINE = Color(0xFFBBBBBB)
private val CIRCLE_DARK = Color(0xFF222222)
private val SEGMENT = Color(0xFF888888)
private val ERROR_COLOR = Color(0xFFDD3333)

/**
 * Compose Canvas renderer for Masyu (puzzle type 7), the analog of
 * frontend/src/components/MasyuBoard.tsx.
 *
 * Unlike the digit boards there's no cell selection or DigitBar: the player draws
 * a single closed loop by dragging one finger between adjacent cell centers, and
 * each drag toggles the segment (edge) it crosses. The first crossing of a gesture
 * decides whether the whole gesture draws or erases (matching the web board), so
 * dragging along an existing line rubs it out and dragging over blank cells draws.
 *
 * Rendering, hit-testing and pan/zoom run through [ZoomableBoard]: one finger draws,
 * two fingers pan/pinch-zoom, so large (e.g. 17x17) Masyu boards stay legible on a
 * phone without the pan fighting the drawing drag.
 *
 * White circles (hollow) must be passed straight through with a turn in a neighbor;
 * black circles (filled) must be turned on with straight segments either side. When
 * [liveValidate] is on, circles whose rule is already broken and the segments of a
 * premature closed loop are tinted red (see [MasyuEngine.analyze]).
 */
@Composable
fun MasyuBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    liveValidate: Boolean,
    onSetEdge: (key: String, on: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cells = remember(puzzle.id) { MasyuEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    val analysis = if (liveValidate) MasyuEngine.analyze(puzzle, userValues) else null
    val circleErrors = analysis?.circleErrors ?: emptySet()
    val loopSegments = analysis?.loopSegments ?: emptySet()

    // The draw closure needs the freshest values to decide draw-vs-erase per gesture.
    val valuesState = rememberUpdatedState(userValues)
    val onSet = rememberUpdatedState(onSetEdge)

    // Per-gesture drawing state, driven by ZoomableBoard's (col,row) callbacks.
    val drag = remember(puzzle.id) { MasyuDragState() }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { _, _ -> }, // Masyu has no tap-to-select
        onDrawStart = { cell -> drag.start(cell) },
        onDrawEnd = { drag.end() },
        onDrawTo = { cell -> drag.moveTo(cell, valuesState.value) { key, on -> onSet.value(key, on) } },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        // Inner grid lines (dashed, light).
        val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.11f, cell * 0.08f))
        for (r in 1 until rows) {
            val y = r * cell
            drawLine(GRID_LINE, Offset(0f, y), Offset(boardW, y), cell * 0.02f, pathEffect = dash)
        }
        for (c in 1 until cols) {
            val x = c * cell
            drawLine(GRID_LINE, Offset(x, 0f), Offset(x, boardH), cell * 0.02f, pathEffect = dash)
        }
        // Outer border.
        drawRect(BORDER, topLeft = Offset(0f, 0f), size = Size(boardW, boardH), style = Stroke(width = cell * 0.06f))

        val radius = cell * 0.3f
        val circleStroke = cell * 0.06f
        for (r in 0 until rows) {
            for (c in 0 until cells[r].size) {
                val kind = cells[r][c]
                if (kind == MasyuEngine.EMPTY) continue
                val cx = (c + 0.5f) * cell
                val cy = (r + 0.5f) * cell
                val bad = circleErrors.contains("$r,$c")
                val stroke = if (bad) ERROR_COLOR else CIRCLE_DARK
                if (kind == MasyuEngine.WHITE) {
                    drawCircle(GRID_BG, radius, Offset(cx, cy))
                    drawCircle(stroke, radius, Offset(cx, cy), style = Stroke(width = circleStroke))
                } else {
                    drawCircle(if (bad) ERROR_COLOR else CIRCLE_DARK, radius, Offset(cx, cy))
                }
            }
        }

        // Drawn segments, on top of circles.
        val segWidth = cell * 0.09f
        val values = valuesState.value
        for (r in 0 until rows) {
            for (c in 0 until cols - 1) {
                if (values[MasyuEngine.hKey(r, c)] != 1) continue
                val color = if (loopSegments.contains("h:$r,$c")) ERROR_COLOR else SEGMENT
                val y = (r + 0.5f) * cell
                drawLine(color, Offset((c + 0.5f) * cell, y), Offset((c + 1.5f) * cell, y), segWidth, cap = StrokeCap.Round)
            }
        }
        for (r in 0 until rows - 1) {
            for (c in 0 until cols) {
                if (values[MasyuEngine.vKey(r, c)] != 1) continue
                val color = if (loopSegments.contains("v:$r,$c")) ERROR_COLOR else SEGMENT
                val x = (c + 0.5f) * cell
                drawLine(color, Offset(x, (r + 0.5f) * cell), Offset(x, (r + 1.5f) * cell), segWidth, cap = StrokeCap.Round)
            }
        }
    }
}

/**
 * Tracks a single drag gesture: the last cell the finger was over and whether this
 * gesture is drawing or erasing (fixed by the first edge it crosses, matching the
 * web board). Each adjacent-cell crossing toggles exactly one edge.
 */
private class MasyuDragState {
    private var last: Pair<Int, Int>? = null
    private var erase: Boolean? = null // null until the first crossing decides

    fun start(cell: Pair<Int, Int>?) {
        last = cell
        erase = null
    }

    fun end() {
        last = null
        erase = null
    }

    fun moveTo(cell: Pair<Int, Int>?, values: Map<String, Int>, setEdge: (String, Boolean) -> Unit) {
        if (cell == null) return
        val prev = last
        if (prev == null) { last = cell; return }
        if (cell == prev) return
        // ZoomableBoard gives (col, row); Masyu edge keys are (row, col)-anchored.
        val dc = cell.first - prev.first
        val dr = cell.second - prev.second
        if (abs(dr) + abs(dc) != 1) { last = cell; return } // not orthogonally adjacent

        val key = when {
            dc == 1 -> MasyuEngine.hKey(prev.second, prev.first)
            dc == -1 -> MasyuEngine.hKey(prev.second, cell.first)
            dr == 1 -> MasyuEngine.vKey(prev.second, prev.first)
            else -> MasyuEngine.vKey(cell.second, prev.first)
        }
        val present = values[key] == 1
        if (erase == null) erase = present
        setEdge(key, erase != true)
        last = cell
    }
}
