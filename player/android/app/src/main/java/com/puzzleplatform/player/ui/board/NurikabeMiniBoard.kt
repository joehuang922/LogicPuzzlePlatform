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
import com.puzzleplatform.player.puzzle.NurikabeAuthoring
import com.puzzleplatform.player.puzzle.NurikabeDraft

private val MINI_BG = Color(0xFFEEEEEE)
private val MINI_LINE = Color(0xFFAAAAAA)
private val MINI_CLUE = Color(0xFF222222)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive nurikabe preview for an Admin batch tile: the parsed grid and
 * its island clues, framed in red when [hasProblems].
 */
@Composable
fun NurikabeMiniBoard(
    draft: NurikabeDraft,
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
        val thin = 0.5.dp.toPx()
        for (r in 0..rows) drawLine(MINI_LINE, Offset(left, top + r * cell), Offset(left + cols * cell, top + r * cell), thin)
        for (c in 0..cols) drawLine(MINI_LINE, Offset(left + c * cell, top), Offset(left + c * cell, top + rows * cell), thin)

        val paint = android.graphics.Paint().apply {
            color = MINI_CLUE.toArgb()
            textSize = cell * 0.6f
            textAlign = android.graphics.Paint.Align.CENTER
            isAntiAlias = true
        }
        val baseline = -(paint.fontMetrics.ascent + paint.fontMetrics.descent) / 2
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val v = draft.cells[r][c]
                if (v == NurikabeAuthoring.BLANK) continue
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
