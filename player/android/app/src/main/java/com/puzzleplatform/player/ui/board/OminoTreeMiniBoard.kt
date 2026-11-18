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
import com.puzzleplatform.player.puzzle.OminoTreeEngine

private val MINI_BG = Color.White
private val MINI_LINE = Color(0xFFBBBBBB)
private val MINI_OUTLINE = Color(0xFF222222)
private val MINI_ARROW = Color(0xFF8A8A8A)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive omino tree preview for an Admin batch tile: the grid, numbers,
 * and each arrow as a short gray bar across its edge with a dot at the end cell's side,
 * framed in red when [hasProblems].
 */
@Composable
fun OminoTreeMiniBoard(
    draft: OminoTreeEngine.Board,
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

        drawRect(MINI_BG, Offset.Zero, Size(box, box))
        for (r in 1 until rows) drawLine(MINI_LINE, Offset(left, top + r * step), Offset(left + cols * step, top + r * step), 1f)
        for (c in 1 until cols) drawLine(MINI_LINE, Offset(left + c * step, top), Offset(left + c * step, top + rows * step), 1f)
        for (a in draft.arrows) {
            val (dr, dc) = OminoTreeEngine.STEP[a.dir] ?: continue
            val from = Offset(left + (a.c + 0.5f + dc * 0.2f) * step, top + (a.r + 0.5f + dr * 0.2f) * step)
            val to = Offset(left + (a.c + 0.5f + dc * 0.8f) * step, top + (a.r + 0.5f + dr * 0.8f) * step)
            drawLine(MINI_ARROW, from, to, maxOf(1.5f, step * 0.15f))
            drawCircle(MINI_ARROW, maxOf(1.5f, step * 0.13f), to)
        }
        val paint = android.graphics.Paint().apply {
            color = MINI_OUTLINE.toArgb()
            textSize = step * 0.6f
            textAlign = android.graphics.Paint.Align.CENTER
            isAntiAlias = true
        }
        for (r in 0 until rows) for (c in 0 until cols) {
            val n = draft.number(r, c)
            if (n > 0) {
                val cy = top + r * step + step / 2 - (paint.fontMetrics.ascent + paint.fontMetrics.descent) / 2
                drawContext.canvas.nativeCanvas.drawText(n.toString(), left + c * step + step / 2, cy, paint)
            }
        }
        drawRect(MINI_OUTLINE, Offset(left, top), Size(cols * step, rows * step), style = Stroke(maxOf(1f, step * 0.06f)))
        if (hasProblems) drawRect(MINI_PROBLEM, Offset.Zero, Size(box, box), style = Stroke(3.dp.toPx()))
    }
}
