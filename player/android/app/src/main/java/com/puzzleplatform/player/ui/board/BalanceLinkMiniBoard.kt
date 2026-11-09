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
import com.puzzleplatform.player.puzzle.BalanceLinkRules
import com.puzzleplatform.player.puzzle.ClueGridDraft

private val MINI_BG = Color.White
private val MINI_LINE = Color(0xFFBBBBBB)
private val MINI_BLACK = Color(0xFF333333)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive balance link preview for an Admin batch tile: black cells and
 * symbols, framed in red when [hasProblems].
 */
@Composable
fun BalanceLinkMiniBoard(
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
        val thin = 0.5.dp.toPx()
        for (r in 0..rows) drawLine(MINI_LINE, Offset(left, top + r * cell), Offset(left + cols * cell, top + r * cell), thin)
        for (c in 0..cols) drawLine(MINI_LINE, Offset(left + c * cell, top), Offset(left + c * cell, top + rows * cell), thin)
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val v = draft.cellAt(c, r)
                val o = Offset(left + c * cell, top + r * cell)
                when {
                    v == BalanceLinkRules.BLACK -> drawRect(MINI_BLACK, o, Size(cell, cell))
                    BalanceLinkRules.isSymbol(v) ->
                        drawBalanceSymbol(v, Offset(o.x + cell / 2, o.y + cell / 2), cell * 0.36f, 0.75.dp.toPx())
                }
            }
        }
        if (hasProblems) {
            drawRect(MINI_PROBLEM, Offset(left, top), Size(cols * cell, rows * cell), style = Stroke(3.dp.toPx()))
        }
    }
}
