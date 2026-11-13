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
import com.puzzleplatform.player.puzzle.ClueGridDraft
import com.puzzleplatform.player.puzzle.HellGolfAuthoring

private val MINI_BG = Color.White
private val MINI_LINE = Color(0xFFBBBBBB)
private val MINI_LAKE = Color(0xFF9CA3AF)
private val MINI_GOAL = Color(0xFF374151)
private val MINI_BALL = Color(0xFF2563EB)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive preview of a Hell Golf for an Admin batch tile: lakes, goals (H)
 * and numbered balls as the parser read them, framed in red when [hasProblems].
 */
@Composable
fun HellGolfMiniBoard(
    draft: ClueGridDraft,
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
        for (r in 0 until rows) for (c in 0 until cols) {
            if (draft.cellAt(c, r) == HellGolfAuthoring.LAKE) {
                drawRect(MINI_LAKE, Offset(left + c * cell, top + r * cell), Size(cell, cell))
            }
        }
        val thin = 0.5.dp.toPx()
        for (r in 0..rows) drawLine(MINI_LINE, Offset(left, top + r * cell), Offset(left + cols * cell, top + r * cell), thin)
        for (c in 0..cols) drawLine(MINI_LINE, Offset(left + c * cell, top), Offset(left + c * cell, top + rows * cell), thin)

        val paint = android.graphics.Paint().apply {
            textSize = cell * 0.55f
            textAlign = android.graphics.Paint.Align.CENTER
            isAntiAlias = true
            isFakeBoldText = true
        }
        val baseline = -(paint.fontMetrics.ascent + paint.fontMetrics.descent) / 2
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val v = draft.cellAt(c, r)
                val cx = left + (c + 0.5f) * cell
                val cy = top + (r + 0.5f) * cell
                val text = when {
                    v == HellGolfAuthoring.GOAL -> {
                        paint.color = MINI_GOAL.toArgb()
                        "H"
                    }
                    v > 0 -> {
                        drawCircle(MINI_BALL, radius = cell * 0.4f, center = Offset(cx, cy), style = Stroke(cell * 0.08f))
                        paint.color = MINI_BALL.toArgb()
                        v.toString()
                    }
                    else -> continue
                }
                drawContext.canvas.nativeCanvas.drawText(text, cx, cy + baseline, paint)
            }
        }
        if (hasProblems) {
            drawRect(MINI_PROBLEM, Offset(left, top), Size(cols * cell, rows * cell), style = Stroke(3.dp.toPx()))
        }
    }
}
