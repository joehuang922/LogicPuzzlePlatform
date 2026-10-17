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

private val MINI_BG = Color(0xFFF2F2F2)
private val MINI_LINE = Color(0xFFBBBBBB)
private val MINI_LINE_MAJOR = Color(0xFF333333)
private val MINI_LABEL = Color.Black
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive nonogram preview for an Admin batch tile: the parsed grid's
 * shape (thin cell lines, thicker every 5) with its "rows×cols" size centered on top,
 * framed in red when [hasProblems] (a clue that can't fit, or mismatched clue sums).
 * Clues themselves are too dense to read at tile size, so they're left to the review.
 */
@Composable
fun NonogramMiniBoard(
    rows: Int,
    cols: Int,
    hasProblems: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 104.dp,
) {
    Canvas(modifier.size(size)) {
        if (rows <= 0 || cols <= 0) return@Canvas
        val box = minOf(this.size.width, this.size.height)
        val cell = box / maxOf(rows, cols)
        val w = cell * cols
        val h = cell * rows
        val left = (box - w) / 2
        val top = (box - h) / 2
        drawRect(MINI_BG, Offset(left, top), Size(w, h))

        val thin = 0.5.dp.toPx()
        val thick = 1.dp.toPx()
        for (r in 0..rows) {
            val major = r % 5 == 0 || r == rows
            drawLine(if (major) MINI_LINE_MAJOR else MINI_LINE, Offset(left, top + r * cell), Offset(left + w, top + r * cell), if (major) thick else thin)
        }
        for (c in 0..cols) {
            val major = c % 5 == 0 || c == cols
            drawLine(if (major) MINI_LINE_MAJOR else MINI_LINE, Offset(left + c * cell, top), Offset(left + c * cell, top + h), if (major) thick else thin)
        }
        if (hasProblems) {
            val stroke = 3.dp.toPx()
            drawRect(MINI_PROBLEM, Offset(left, top), Size(w, h), style = Stroke(stroke))
        }

        val paint = android.graphics.Paint().apply {
            color = (if (hasProblems) MINI_PROBLEM else MINI_LABEL).toArgb()
            textSize = box * 0.16f
            textAlign = android.graphics.Paint.Align.CENTER
            isAntiAlias = true
            isFakeBoldText = true
        }
        val halo = android.graphics.Paint(paint).apply {
            color = android.graphics.Color.WHITE
            style = android.graphics.Paint.Style.STROKE
            strokeWidth = box * 0.04f
        }
        val label = "$rows×$cols"
        val fm = paint.fontMetrics
        val cy = box / 2 - (fm.ascent + fm.descent) / 2
        drawContext.canvas.nativeCanvas.drawText(label, box / 2, cy, halo)
        drawContext.canvas.nativeCanvas.drawText(label, box / 2, cy, paint)
    }
}
