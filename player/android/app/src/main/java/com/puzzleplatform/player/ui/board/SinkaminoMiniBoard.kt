package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.SinkaminoGrid
import com.puzzleplatform.player.puzzle.SinkaminoRules

private val MINI_BG = Color.White
private val MINI_LINE = Color(0xFFAAAAAA)
private val MINI_BLACK = Color(0xFF333333)
private val MINI_INK = Color(0xFF222222)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive sinkamino preview for an Admin batch tile: black cells, given
 * squares and the arrow trails, framed in red when [hasProblems].
 */
@Composable
fun SinkaminoMiniBoard(
    draft: SinkaminoGrid,
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
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val o = Offset(left + c * cell, top + r * cell)
                when (draft.cellAt(r, c)) {
                    SinkaminoRules.BLACK -> drawRect(MINI_BLACK, o, Size(cell, cell))
                    SinkaminoRules.GIVEN -> drawRect(
                        MINI_INK, Offset(o.x + cell * 0.25f, o.y + cell * 0.25f), Size(cell * 0.5f, cell * 0.5f),
                        style = Stroke(0.75.dp.toPx()),
                    )
                }
            }
        }
        val thin = 0.5.dp.toPx()
        for (r in 0..rows) drawLine(MINI_LINE, Offset(left, top + r * cell), Offset(left + cols * cell, top + r * cell), thin)
        for (c in 0..cols) drawLine(MINI_LINE, Offset(left + c * cell, top), Offset(left + c * cell, top + rows * cell), thin)
        for (trail in draft.arrows) {
            if (trail.size < 2) continue
            val path = Path()
            trail.forEachIndexed { i, (r, c) ->
                val x = left + (c + 0.5f) * cell
                val y = top + (r + 0.5f) * cell
                if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            drawPath(path, MINI_INK, style = Stroke(1.dp.toPx()))
            val (hr, hc) = trail.last()
            drawCircle(MINI_INK, radius = cell * 0.18f, center = Offset(left + (hc + 0.5f) * cell, top + (hr + 0.5f) * cell))
        }
        if (hasProblems) {
            drawRect(MINI_PROBLEM, Offset(left, top), Size(cols * cell, rows * cell), style = Stroke(3.dp.toPx()))
        }
    }
}
