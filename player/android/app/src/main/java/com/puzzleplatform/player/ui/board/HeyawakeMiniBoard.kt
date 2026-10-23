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
import com.puzzleplatform.player.puzzle.HeyawakeDraft

private val MINI_BG = Color.White
private val MINI_LINE = Color(0xFFBBBBBB)
private val MINI_WALL = Color(0xFF222222)
private val MINI_CLUE = Color(0xFF222222)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive heyawake preview for an Admin batch tile: the draft's walls
 * and clues, framed in red when [hasProblems].
 */
@Composable
fun HeyawakeMiniBoard(
    draft: HeyawakeDraft,
    hasProblems: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 104.dp,
) {
    Canvas(modifier.size(size)) {
        val rows = draft.height
        val cols = draft.width
        if (rows <= 0 || cols <= 0) return@Canvas
        val box = minOf(this.size.width, this.size.height)
        val cell = box / maxOf(rows, cols)
        val left = (box - cell * cols) / 2
        val top = (box - cell * rows) / 2

        drawRect(MINI_BG, Offset(left, top), Size(cols * cell, rows * cell))
        val thin = 0.5.dp.toPx()
        val wall = 1.5.dp.toPx()
        for (r in 0..rows) {
            for (c in 0 until cols) {
                val isWall = r == 0 || r == rows || draft.hWalls[r - 1][c]
                val y = top + r * cell
                drawLine(if (isWall) MINI_WALL else MINI_LINE, Offset(left + c * cell, y), Offset(left + (c + 1) * cell, y), if (isWall) wall else thin)
            }
        }
        for (c in 0..cols) {
            for (r in 0 until rows) {
                val isWall = c == 0 || c == cols || draft.vWalls[r][c - 1]
                val x = left + c * cell
                drawLine(if (isWall) MINI_WALL else MINI_LINE, Offset(x, top + r * cell), Offset(x, top + (r + 1) * cell), if (isWall) wall else thin)
            }
        }

        val paint = android.graphics.Paint().apply {
            color = MINI_CLUE.toArgb()
            textSize = cell * 0.6f
            textAlign = android.graphics.Paint.Align.CENTER
            isAntiAlias = true
        }
        val baseline = -(paint.fontMetrics.ascent + paint.fontMetrics.descent) / 2
        for ((at, clue) in draft.clues) {
            val (r, c) = at
            if (r !in 0 until rows || c !in 0 until cols) continue
            drawContext.canvas.nativeCanvas.drawText(
                clue.toString(),
                left + (c + 0.5f) * cell,
                top + (r + 0.5f) * cell + baseline,
                paint,
            )
        }
        if (hasProblems) {
            drawRect(MINI_PROBLEM, Offset(left, top), Size(cols * cell, rows * cell), style = Stroke(3.dp.toPx()))
        }
    }
}
