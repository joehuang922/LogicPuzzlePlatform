package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.YajilixEngine

private val MINI_BG = Color.White
private val MINI_LINE = Color(0xFFCCCCCC)
private val MINI_BORDER = Color(0xFF222222)
private val MINI_PROBLEM = Color(0xFFDD3333)

/** A tiny, non-interactive Yajilix preview for an Admin batch tile: grid and clues, framed red when [hasProblems]. */
@Composable
fun YajilixMiniBoard(
    draft: YajilixEngine.Board,
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
        for (i in 1 until rows) drawLine(MINI_LINE, Offset(left, top + i * step), Offset(left + cols * step, top + i * step), 1f)
        for (i in 1 until cols) drawLine(MINI_LINE, Offset(left + i * step, top), Offset(left + i * step, top + rows * step), 1f)
        drawRect(MINI_BORDER, Offset(left, top), Size(cols * step, rows * step), style = Stroke(maxOf(1.5f, step * 0.08f)))
        translate(left, top) {
            for (r in 0 until rows) for (c in 0 until cols) {
                draft.clue(r, c)?.let { drawClue(it, r, c, step, MINI_BORDER) }
            }
        }
        if (hasProblems) drawRect(MINI_PROBLEM, Offset.Zero, Size(box, box), style = Stroke(3.dp.toPx()))
    }
}
