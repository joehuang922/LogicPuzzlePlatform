package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.CountryRoadEngine

private val MINI_BG = Color.White
private val MINI_LINE = Color(0xFFCCCCCC)
private val MINI_WALL = Color(0xFF222222)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive Country Road preview for an Admin batch tile: rooms and numbers,
 * framed in red when [hasProblems].
 */
@Composable
fun CountryRoadMiniBoard(
    draft: CountryRoadEngine.Board,
    hasProblems: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 104.dp,
) {
    Canvas(modifier.size(size)) {
        val rows = draft.rows
        val cols = draft.cols
        if (rows < 1 || cols < 1) return@Canvas
        val box = minOf(this.size.width, this.size.height)
        val step = box / maxOf(rows, cols)
        val left = (box - step * cols) / 2
        val top = (box - step * rows) / 2
        val wall = maxOf(1.5f, step * 0.1f)

        drawRect(MINI_BG, Offset.Zero, Size(box, box))
        for (r in 0 until rows - 1) for (c in 0 until cols) {
            val w = draft.wallBelow(r, c)
            drawLine(if (w) MINI_WALL else MINI_LINE, Offset(left + c * step, top + (r + 1) * step),
                Offset(left + (c + 1) * step, top + (r + 1) * step), if (w) wall else 1f)
        }
        for (r in 0 until rows) for (c in 0 until cols - 1) {
            val w = draft.wallRight(r, c)
            drawLine(if (w) MINI_WALL else MINI_LINE, Offset(left + (c + 1) * step, top + r * step),
                Offset(left + (c + 1) * step, top + (r + 1) * step), if (w) wall else 1f)
        }
        drawRect(MINI_WALL, Offset(left, top), Size(cols * step, rows * step), style = Stroke(wall))
        val paint = android.graphics.Paint().apply {
            color = MINI_WALL.toArgb()
            textSize = step * 0.6f
            textAlign = android.graphics.Paint.Align.CENTER
            isAntiAlias = true
        }
        for (r in 0 until rows) for (c in 0 until cols) {
            val g = draft.number(r, c)
            if (g > 0) {
                val cy = top + r * step + step / 2 - (paint.fontMetrics.ascent + paint.fontMetrics.descent) / 2
                drawContext.canvas.nativeCanvas.drawText(g.toString(), left + c * step + step / 2, cy, paint)
            }
        }
        if (hasProblems) drawRect(MINI_PROBLEM, Offset.Zero, Size(box, box), style = Stroke(3.dp.toPx()))
    }
}
