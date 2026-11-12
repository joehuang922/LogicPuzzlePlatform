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
import com.puzzleplatform.player.puzzle.SkeletonRules

private val MINI_CELL = Color(0xFF555555)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive Skeleton Puzzle preview for an Admin batch tile: the cells as
 * dark squares, framed in red when [hasProblems].
 */
@Composable
fun SkeletonPuzzleMiniBoard(
    draft: SkeletonRules.Board,
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
        val gap = maxOf(0.5f, cell * 0.08f)
        for (r in 0 until rows) for (c in 0 until cols) {
            if (draft.cells[r][c] == 1) {
                drawRect(MINI_CELL, Offset(left + c * cell + gap / 2, top + r * cell + gap / 2), Size(cell - gap, cell - gap))
            }
        }
        if (hasProblems) {
            drawRect(MINI_PROBLEM, Offset(left, top), Size(cols * cell, rows * cell), style = Stroke(3.dp.toPx()))
        }
    }
}
