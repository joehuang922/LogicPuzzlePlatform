package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.DoubleChocoEngine

private val LINE = Color.Black
private val WHITE_CELL = Color.White

/** The web board's #ccc for gray cells: a given cell color, not player shading. */
private val GRAY_CELL = Color(0xFFCCCCCC)

/**
 * Compose Canvas renderer for Double Choco (puzzle type 4), the analog of
 * frontend/src/components/DoubleChocoBoard.tsx.
 *
 * Input is a single gesture: tap near an interior grid line to toggle the border on it.
 * The tap snaps to the nearest interior line (the same [wallKeyAt] snap Fillomino and
 * Tentaishow use — all three key borders "h:r,c"/"v:r,c"), so a thin line never has to
 * be hit precisely. Two fingers pan/zoom via [ZoomableBoard].
 *
 * Rendering mirrors the web board: white and gray cells from the canon, bold black
 * clues, dashed thin separators, and thick solid borders and outline.
 */
@Composable
fun DoubleChocoBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onSetEdge: (key: String, on: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val board = remember(puzzle.id) { DoubleChocoEngine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows == 0 || cols == 0) return

    // Gesture closures outlive recomposition (ZoomableBoard's pointerInput doesn't restart
    // when these change), so read the freshest values/callback through state.
    val valuesState = rememberUpdatedState(userValues)
    val onSet = rememberUpdatedState(onSetEdge)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { _, _ -> },
        onTapPrecise = { fx, fy ->
            val key = wallKeyAt(fx, fy, rows, cols) ?: return@ZoomableBoard
            onSet.value(key, valuesState.value[key] != 1)
        },
    ) { cell ->
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                drawRect(
                    if (board.cells[r][c].gray) GRAY_CELL else WHITE_CELL,
                    topLeft = Offset(c * cell, r * cell),
                    size = Size(cell, cell),
                )
            }
        }
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val number = board.cells[r][c].number
                if (number > 0) drawClue(number, c, r, cell)
            }
        }

        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()
        val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.075f, cell * 0.075f))

        // Horizontal lines: line index r (y = r*cell), one segment per column.
        for (r in 0..rows) {
            val isBorder = r == 0 || r == rows
            for (c in 0 until cols) {
                val solid = isBorder || userValues[DoubleChocoEngine.hKey(r - 1, c)] == 1
                drawLine(
                    LINE,
                    Offset(c * cell, r * cell),
                    Offset((c + 1) * cell, r * cell),
                    strokeWidth = if (solid) thick else thin,
                    pathEffect = if (solid) null else dash,
                )
            }
        }
        // Vertical lines: line index c (x = c*cell), one segment per row.
        for (c in 0..cols) {
            val isBorder = c == 0 || c == cols
            for (r in 0 until rows) {
                val solid = isBorder || userValues[DoubleChocoEngine.vKey(r, c - 1)] == 1
                drawLine(
                    LINE,
                    Offset(c * cell, r * cell),
                    Offset(c * cell, (r + 1) * cell),
                    strokeWidth = if (solid) thick else thin,
                    pathEffect = if (solid) null else dash,
                )
            }
        }
    }
}

/** Draw a bold black (possibly multi-digit) clue centered in cell (col, row). */
private fun DrawScope.drawClue(value: Int, col: Int, row: Int, cell: Float) {
    val digits = value.toString().length
    val paint = android.graphics.Paint().apply {
        color = LINE.toArgb()
        textSize = cell * when {
            digits <= 1 -> 0.5f
            digits == 2 -> 0.38f
            else -> 0.28f
        }
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val cx = col * cell + cell / 2
    val fm = paint.fontMetrics
    val cy = row * cell + cell / 2 - (fm.ascent + fm.descent) / 2
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy, paint)
}
