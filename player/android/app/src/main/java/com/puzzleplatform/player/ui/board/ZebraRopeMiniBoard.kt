package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.ZebraRopeEngine

private val MINI_BG = Color.White
private val MINI_LINE = Color(0xFFBBBBBB)
private val MINI_ROPE = Color(0xFF777777)
private val MINI_OUTLINE = Color(0xFF222222)
private val MINI_PROBLEM = Color(0xFFDD3333)
private val MINI_CIRCLE_FILL = listOf(Color.White, Color(0xFF111111), Color(0xFFAAAAAA))

/**
 * A tiny, non-interactive zebra rope preview for an Admin batch tile: the parsed grid, its
 * ropes and circles, framed in red when [hasProblems].
 */
@Composable
fun ZebraRopeMiniBoard(
    draft: ZebraRopeEngine.Board,
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

        for (rope in draft.ropes) {
            val path = Path()
            rope.forEachIndexed { j, (r, c) ->
                val x = left + (c + 0.5f) * cell
                val y = top + (r + 0.5f) * cell
                if (j == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            drawPath(path, MINI_ROPE, style = Stroke(maxOf(1.5f, cell * 0.16f), cap = StrokeCap.Round, join = StrokeJoin.Round))
        }

        val radius = cell * 0.2f
        val ring = maxOf(1f, cell * 0.06f)
        for (circle in draft.circles) {
            val center = Offset(left + circle.dc / 2f * cell, top + circle.dr / 2f * cell)
            drawCircle(MINI_CIRCLE_FILL.getOrElse(circle.color) { Color.White }, radius, center)
            drawCircle(MINI_OUTLINE, radius, center, style = Stroke(ring))
        }
        if (hasProblems) {
            drawRect(MINI_PROBLEM, Offset(left, top), Size(cols * cell, rows * cell), style = Stroke(3.dp.toPx()))
        }
    }
}
