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
import com.puzzleplatform.player.puzzle.SlalomCell
import com.puzzleplatform.player.puzzle.SlalomDraft

private val MINI_BG = Color.White
private val MINI_LINE = Color(0xFFDDDDDD)
private val MINI_WALL = Color(0xFF333333)
private val MINI_GATE = Color(0xFF666666)
private val MINI_START = Color(0xFF222222)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive slalom preview for an Admin batch tile: walls, gate cells (a bar
 * through the cell center along the gate) and the start circle, framed in red when
 * [hasProblems].
 */
@Composable
fun SlalomMiniBoard(
    draft: SlalomDraft,
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

        val gateW = maxOf(1f, cell * 0.12f)
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val x = left + c * cell
                val y = top + r * cell
                when (draft.cells[r][c]) {
                    SlalomCell.WALL -> drawRect(MINI_WALL, Offset(x, y), Size(cell, cell))
                    SlalomCell.GATE_H -> drawLine(MINI_GATE, Offset(x, y + cell / 2), Offset(x + cell, y + cell / 2), gateW)
                    SlalomCell.GATE_V -> drawLine(MINI_GATE, Offset(x + cell / 2, y), Offset(x + cell / 2, y + cell), gateW)
                    SlalomCell.EMPTY -> Unit
                }
            }
        }
        draft.start?.let { (r, c) ->
            if (draft.inGrid(c, r)) {
                drawCircle(
                    MINI_START,
                    cell * 0.35f,
                    Offset(left + (c + 0.5f) * cell, top + (r + 0.5f) * cell),
                    style = Stroke(maxOf(1f, cell * 0.1f)),
                )
            }
        }
        if (hasProblems) {
            drawRect(MINI_PROBLEM, Offset(left, top), Size(cols * cell, rows * cell), style = Stroke(3.dp.toPx()))
        }
    }
}
