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
import com.puzzleplatform.player.puzzle.MannequinGate2Rules

private val MINI_BG = Color.White
private val MINI_GRID = Color(0xFFBBBBBB)
private val MINI_LINE = Color(0xFF8A8A8A)
private val MINI_BORDER = Color(0xFF222222)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive Mannequin Gate 2 preview for an Admin batch tile: the grid and
 * its gray lines, framed in red when [hasProblems].
 */
@Composable
fun MannequinGate2MiniBoard(
    draft: MannequinGate2Rules.Board,
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
        val origin = Offset((box - cell * cols) / 2, (box - cell * rows) / 2)
        drawRect(MINI_BG, origin, Size(cell * cols, cell * rows))
        for (r in 1 until rows) drawLine(MINI_GRID, Offset(origin.x, origin.y + r * cell), Offset(origin.x + cols * cell, origin.y + r * cell), 1f)
        for (c in 1 until cols) drawLine(MINI_GRID, Offset(origin.x + c * cell, origin.y), Offset(origin.x + c * cell, origin.y + rows * cell), 1f)
        for (line in draft.lines) drawGateLine(line, cell, origin, MINI_LINE, maxOf(1.5f, cell * 0.17f))
        drawRect(
            if (hasProblems) MINI_PROBLEM else MINI_BORDER,
            origin,
            Size(cell * cols, cell * rows),
            style = Stroke(width = if (hasProblems) 3.dp.toPx() else 1.5.dp.toPx()),
        )
    }
}
