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
import com.puzzleplatform.player.puzzle.SlitherlinkAuthoring
import com.puzzleplatform.player.puzzle.SlitherlinkDraft

private val MINI_BG = Color.White
private val MINI_DOT = Color(0xFF888888)
private val MINI_CLUE = Color(0xFF222222)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive slitherlink preview for an Admin batch tile: the parsed grid's
 * dots and clue digits, framed in red when [hasProblems].
 */
@Composable
fun SlitherlinkMiniBoard(
    draft: SlitherlinkDraft,
    hasProblems: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 104.dp,
) {
    Canvas(modifier.size(size)) {
        val rows = draft.rows
        val cols = draft.cols
        if (rows <= 0 || cols <= 0) return@Canvas
        val box = minOf(this.size.width, this.size.height)
        val cell = box / maxOf(rows, cols)
        val left = (box - cell * cols) / 2
        val top = (box - cell * rows) / 2

        drawRect(MINI_BG, Offset(left, top), Size(cols * cell, rows * cell))
        val dot = maxOf(cell * 0.06f, 0.6.dp.toPx())
        for (r in 0..rows) {
            for (c in 0..cols) drawCircle(MINI_DOT, dot, Offset(left + c * cell, top + r * cell))
        }

        val paint = android.graphics.Paint().apply {
            color = MINI_CLUE.toArgb()
            textSize = cell * 0.7f
            textAlign = android.graphics.Paint.Align.CENTER
            isAntiAlias = true
        }
        val baseline = -(paint.fontMetrics.ascent + paint.fontMetrics.descent) / 2
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val v = draft.cells[r][c]
                if (v == SlitherlinkAuthoring.BLANK) continue
                drawContext.canvas.nativeCanvas.drawText(
                    v.toString(),
                    left + (c + 0.5f) * cell,
                    top + (r + 0.5f) * cell + baseline,
                    paint,
                )
            }
        }
        if (hasProblems) {
            drawRect(MINI_PROBLEM, Offset(left, top), Size(cols * cell, rows * cell), style = Stroke(3.dp.toPx()))
        }
    }
}
