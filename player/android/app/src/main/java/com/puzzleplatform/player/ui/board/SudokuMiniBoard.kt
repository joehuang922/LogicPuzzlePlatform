package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.SudokuEngine


private val MINI_BG = Color.White
private val MINI_LINE = Color.Black
private val MINI_DIGIT = Color.Black

/**
 * A tiny, non-interactive sudoku preview (9×9, or N×N with [dims] rooms): just the givens drawn on a white
 * ground with thin cell lines and thicker 3×3 box lines. Unlike the full
 * [SudokuBoard] there's no selection, notes, conflict colouring, or zoom — this is
 * the thumbnail each batch tile shows in the Admin grid.
 *
 * [givens] is the board's player-input map ("col,row" -> digit); 0/absent is blank.
 */
@Composable
fun SudokuMiniBoard(
    givens: Map<String, Int>,
    modifier: Modifier = Modifier,
    dims: SudokuEngine.Dims = SudokuEngine.Dims(),
    size: Dp = 104.dp,
) {
    val n = dims.size
    Canvas(modifier.size(size)) {
        val boardSize = minOf(this.size.width, this.size.height)
        val cell = boardSize / n
        drawRect(color = MINI_BG, size = Size(boardSize, boardSize))

        // Grid lines: thin cell lines, thicker on box/border boundaries.
        val thin = 0.5.dp.toPx()
        val thick = 1.5.dp.toPx()
        for (i in 0..n) {
            val p = i * cell
            drawLine(MINI_LINE, Offset(0f, p), Offset(boardSize, p), if (i % dims.roomHeight == 0) thick else thin)
            drawLine(MINI_LINE, Offset(p, 0f), Offset(p, boardSize), if (i % dims.roomWidth == 0) thick else thin)
        }

        // Givens, centered in each cell.
        val textSize = cell * 0.62f
        for (row in 0 until n) {
            for (col in 0 until n) {
                val value = givens["$col,$row"] ?: 0
                if (value in 1..n) drawMiniDigit(value, col, row, cell, textSize)
            }
        }
    }
}

private fun DrawScope.drawMiniDigit(value: Int, col: Int, row: Int, cell: Float, textSize: Float) {
    val paint = android.graphics.Paint().apply {
        this.color = MINI_DIGIT.toArgb()
        this.textSize = textSize
        this.textAlign = android.graphics.Paint.Align.CENTER
        this.isAntiAlias = true
        this.typeface = android.graphics.Typeface.DEFAULT
    }
    val cx = col * cell + cell / 2
    val fm = paint.fontMetrics
    val cy = row * cell + cell / 2 - (fm.ascent + fm.descent) / 2
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy, paint)
}
