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
import com.puzzleplatform.player.puzzle.SlitherlinkEngine
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

private val GRID_BG = Color.White
private val DOT = Color(0xFF333333)
private val LINE_COLOR = Color(0xFF111111)
private val CROSS_COLOR = Color(0xFFBBBBBB)
private val CLUE_COLOR = Color(0xFF222222)

/**
 * Compose Canvas renderer for Slitherlink (puzzle type 5), the analog of
 * frontend/src/components/SlitherlinkBoard.tsx.
 *
 * The player draws a single closed loop along the grid lines between dots. There's no
 * cell selection or DigitBar and no mode toggle: tapping near an edge cycles its state
 * empty -> line -> cross -> empty, exactly like the web board. The tap snaps to the
 * nearest grid line (via [ZoomableBoard]'s fractional tap), so a thin edge never has to
 * be hit precisely.
 *
 * Lines are solid dark segments; crosses are light-gray X marks (a "no edge here" aid).
 * Dots are drawn at every intersection and clue numbers (0-3) centered in their cells.
 * Rendering and pan/zoom run through [ZoomableBoard].
 */
@Composable
fun SlitherlinkBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onCycleEdge: (key: String, next: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cells = remember(puzzle.id) { SlitherlinkEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    // The tap closure outlives recomposition (ZoomableBoard's pointerInput doesn't restart
    // when these change), so read the freshest values/callback through state.
    val valuesState = rememberUpdatedState(userValues)
    val onCycle = rememberUpdatedState(onCycleEdge)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { _, _ -> }, // Slitherlink has no cell selection
        onTapPrecise = { fx, fy ->
            val key = edgeKeyAt(fx, fy, rows, cols) ?: return@ZoomableBoard
            val next = ((valuesState.value[key] ?: 0) + 1) % 3
            onCycle.value(key, next)
        },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        val lineWidth = cell * 0.07f
        val crossArm = cell * 0.16f
        val crossWidth = cell * 0.04f
        val values = valuesState.value

        // Horizontal segments: grid-line row r (y = r*cell), spanning col c..c+1.
        for (r in 0..rows) {
            val y = r * cell
            for (c in 0 until cols) {
                when (values[SlitherlinkEngine.hKey(r, c)]) {
                    SlitherlinkEngine.LINE -> drawLine(
                        LINE_COLOR,
                        Offset(c * cell, y),
                        Offset((c + 1) * cell, y),
                        lineWidth,
                        cap = StrokeCap.Round,
                    )
                    SlitherlinkEngine.CROSS -> drawCross((c + 0.5f) * cell, y, crossArm, crossWidth)
                }
            }
        }
        // Vertical segments: grid-line col c (x = c*cell), spanning row r..r+1.
        for (r in 0 until rows) {
            for (c in 0..cols) {
                val x = c * cell
                when (values[SlitherlinkEngine.vKey(r, c)]) {
                    SlitherlinkEngine.LINE -> drawLine(
                        LINE_COLOR,
                        Offset(x, r * cell),
                        Offset(x, (r + 1) * cell),
                        lineWidth,
                        cap = StrokeCap.Round,
                    )
                    SlitherlinkEngine.CROSS -> drawCross(x, (r + 0.5f) * cell, crossArm, crossWidth)
                }
            }
        }

        // Dots at every intersection, on top of segments.
        val dotRadius = cell * 0.06f
        for (r in 0..rows) {
            for (c in 0..cols) {
                drawCircle(DOT, dotRadius, Offset(c * cell, r * cell))
            }
        }

        // Clue numbers centered in their cells.
        for (r in 0 until rows) {
            for (c in 0 until cells[r].size) {
                val clue = cells[r][c]
                if (clue < 0) continue
                drawClue(clue, c, r, cell)
            }
        }
    }
}

/** Draw a light-gray X centered at (cx, cy). */
private fun DrawScope.drawCross(cx: Float, cy: Float, arm: Float, width: Float) {
    drawLine(CROSS_COLOR, Offset(cx - arm, cy - arm), Offset(cx + arm, cy + arm), width, cap = StrokeCap.Round)
    drawLine(CROSS_COLOR, Offset(cx + arm, cy - arm), Offset(cx - arm, cy + arm), width, cap = StrokeCap.Round)
}

/** Draw a single-digit clue centered in cell (col, row). */
private fun DrawScope.drawClue(value: Int, col: Int, row: Int, cell: Float) {
    val paint = android.graphics.Paint().apply {
        color = CLUE_COLOR.toArgb()
        textSize = cell * 0.5f
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val cx = col * cell + cell / 2
    val fm = paint.fontMetrics
    val cy = row * cell + cell / 2 - (fm.ascent + fm.descent) / 2
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy, paint)
}

/**
 * Snap a fractional tap (in cell units) to the nearest grid-line edge and return its
 * userValues key, or null if the tap can't be resolved. A horizontal edge sits on
 * grid-line row `hLine` (0..rows, borders included) spanning column `floor(fx)`; a
 * vertical edge on grid-line col `vLine` (0..cols) spanning row `floor(fy)`. The tap
 * picks whichever grid line it's closer to.
 */
internal fun edgeKeyAt(fx: Float, fy: Float, rows: Int, cols: Int): String? {
    val hLine = fy.roundToInt().coerceIn(0, rows)
    val vLine = fx.roundToInt().coerceIn(0, cols)
    val dH = abs(fy - hLine) // distance to nearest horizontal grid line
    val dV = abs(fx - vLine) // distance to nearest vertical grid line
    return if (dH <= dV) {
        val c = floor(fx).toInt().coerceIn(0, cols - 1)
        SlitherlinkEngine.hKey(hLine, c)
    } else {
        val r = floor(fy).toInt().coerceIn(0, rows - 1)
        SlitherlinkEngine.vKey(r, vLine)
    }
}
