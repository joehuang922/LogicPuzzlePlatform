package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.TentaishowAuthoring
import com.puzzleplatform.player.puzzle.TentaishowDraft

private val MINI_BG = Color.White
private val MINI_LINE = Color(0xFFBBBBBB)
private val MINI_FRAME = Color(0xFF222222)
private val MINI_DOT_OPEN = Color.White
private val MINI_DOT_FILLED = Color(0xFF111111)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive tentaishow preview for an Admin batch tile: the parsed grid and
 * its open and filled dots, framed in red when [hasProblems].
 */
@Composable
fun TentaishowMiniBoard(
    draft: TentaishowDraft,
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
        for (r in 1 until rows) drawLine(MINI_LINE, Offset(left, top + r * cell), Offset(left + cols * cell, top + r * cell), thin)
        for (c in 1 until cols) drawLine(MINI_LINE, Offset(left + c * cell, top), Offset(left + c * cell, top + rows * cell), thin)
        drawRect(MINI_FRAME, Offset(left, top), Size(cols * cell, rows * cell), style = Stroke(1.5.dp.toPx()))

        val radius = cell * 0.2f
        val ring = maxOf(1f, cell * 0.06f)
        for (dot in draft.dots) {
            val center = Offset(left + dot.dc / 2f * cell, top + dot.dr / 2f * cell)
            drawCircle(if (dot.color == TentaishowAuthoring.FILLED) MINI_DOT_FILLED else MINI_DOT_OPEN, radius, center)
            drawCircle(MINI_FRAME, radius, center, style = Stroke(ring))
        }
        if (hasProblems) {
            drawRect(MINI_PROBLEM, Offset(left, top), Size(cols * cell, rows * cell), style = Stroke(3.dp.toPx()))
        }
    }
}
