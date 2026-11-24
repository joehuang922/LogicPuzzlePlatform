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
import com.puzzleplatform.player.puzzle.PicturesqueMazeEngine

private val MINI_BG = Color.White
private val MINI_WALL = Color(0xFF444444)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive picturesque maze preview for an Admin batch tile: the parsed
 * walls (border included, openings left open), framed in red when [hasProblems].
 */
@Composable
fun PicturesqueMazeMiniBoard(
    draft: PicturesqueMazeEngine.Board,
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
        val walls = Path()
        fun seg(x1: Int, y1: Int, x2: Int, y2: Int) {
            walls.moveTo(left + x1 * cell, top + y1 * cell)
            walls.lineTo(left + x2 * cell, top + y2 * cell)
        }
        for (r in 0 until rows - 1) for (c in 0 until cols) if (draft.wallsH.getOrNull(r)?.getOrNull(c) == 1) seg(c, r + 1, c + 1, r + 1)
        for (r in 0 until rows) for (c in 0 until cols - 1) if (draft.wallsV.getOrNull(r)?.getOrNull(c) == 1) seg(c + 1, r, c + 1, r + 1)
        fun isOpening(side: String, i: Int) =
            (draft.entrance.side == side && draft.entrance.index == i) || (draft.exit.side == side && draft.exit.index == i)
        for (c in 0 until cols) {
            if (!isOpening("top", c)) seg(c, 0, c + 1, 0)
            if (!isOpening("bottom", c)) seg(c, rows, c + 1, rows)
        }
        for (r in 0 until rows) {
            if (!isOpening("left", r)) seg(0, r, 0, r + 1)
            if (!isOpening("right", r)) seg(cols, r, cols, r + 1)
        }
        drawPath(walls, MINI_WALL, style = Stroke(maxOf(0.6f, cell * 0.2f)))
        if (hasProblems) {
            drawRect(MINI_PROBLEM, Offset(left, top), Size(cols * cell, rows * cell), style = Stroke(3.dp.toPx()))
        }
    }
}
