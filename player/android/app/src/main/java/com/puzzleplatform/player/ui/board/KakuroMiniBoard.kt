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
import com.puzzleplatform.player.puzzle.KakuroDraft
import com.puzzleplatform.player.puzzle.KakuroEngine

private val MINI_WHITE = Color.White
private val MINI_CLUE = Color(0xFF333333)
private val MINI_LINE = Color(0xFF888888)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive kakuro preview for an Admin batch tile: the parsed grid's
 * clue (dark) and white cells, framed in red when [hasProblems]. Sums are too small
 * to read at tile size, so they're left to the review.
 */
@Composable
fun KakuroMiniBoard(
    draft: KakuroDraft,
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

        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val color = if (draft.cells[r][c] is KakuroEngine.Cell.Clue) MINI_CLUE else MINI_WHITE
                drawRect(color, Offset(left + c * cell, top + r * cell), Size(cell, cell))
            }
        }
        val thin = 0.5.dp.toPx()
        for (r in 0..rows) drawLine(MINI_LINE, Offset(left, top + r * cell), Offset(left + cols * cell, top + r * cell), thin)
        for (c in 0..cols) drawLine(MINI_LINE, Offset(left + c * cell, top), Offset(left + c * cell, top + rows * cell), thin)
        if (hasProblems) {
            drawRect(MINI_PROBLEM, Offset(left, top), Size(cols * cell, rows * cell), style = Stroke(3.dp.toPx()))
        }
    }
}
