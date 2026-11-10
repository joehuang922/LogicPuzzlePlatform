package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.ChocoBananaEngine

// No rooms, so the shade is the web board's chocolate brown with white clues on it.
private val GRID_BG = Color.White
private val LINE_THIN = Color(0xFF555555)
private val LINE_THICK = Color.Black
internal val CHOCO_SHADE = Color(0xFF5A3A22)
private val SHADE_TEXT = Color.White
private val NUM_COLOR = Color(0xFF222222)
private val MARK_COLOR = Color(0xFFBBBBBB)

/**
 * Compose Canvas renderer for Choco Banana (puzzle type 16), the analog of
 * frontend/src/components/ChocoBananaBoard.tsx. A shade/mark puzzle: a tap on any cell,
 * clues included, goes to [onTapCell] (PlayViewModel.tapShadeCell cycles empty -> shaded
 * -> marked -> empty). Shaded cells are chocolate brown, marked cells get a small grey dot.
 *
 * The Admin review editor passes [onTapCell] to select a cell and [selectedCell]
 * ("col,row") to outline it.
 */
@Composable
fun ChocoBananaBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
    selectedCell: String? = null,
) {
    // Keyed on the canon too: the Admin review editor changes it under a stable id.
    val cells = remember(puzzle.id, puzzle.canonRepr) { ChocoBananaEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    val valuesState = rememberUpdatedState(userValues)
    val onTap = rememberUpdatedState(onTapCell)
    val selectedState = rememberUpdatedState(selectedCell)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> onTap.value(col, row) },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        val values = valuesState.value
        fun stateAt(c: Int, r: Int) = values[ChocoBananaEngine.cellKey(c, r)] ?: ChocoBananaEngine.UNKNOWN
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        for (r in 0 until rows) for (c in 0 until cols) {
            if (stateAt(c, r) == ChocoBananaEngine.SHADED) {
                drawRect(CHOCO_SHADE, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
            }
        }

        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()
        for (r in 0..rows) {
            val border = r == 0 || r == rows
            drawLine(if (border) LINE_THICK else LINE_THIN, Offset(0f, r * cell), Offset(boardW, r * cell), if (border) thick else thin, cap = StrokeCap.Square)
        }
        for (c in 0..cols) {
            val border = c == 0 || c == cols
            drawLine(if (border) LINE_THICK else LINE_THIN, Offset(c * cell, 0f), Offset(c * cell, boardH), if (border) thick else thin, cap = StrokeCap.Square)
        }

        for (r in 0 until rows) for (c in 0 until cols) {
            val center = Offset((c + 0.5f) * cell, (r + 0.5f) * cell)
            val state = stateAt(c, r)
            val clue = cells[r].getOrNull(c) ?: 0
            if (state == ChocoBananaEngine.MARKED && clue <= 0) drawCircle(MARK_COLOR, radius = cell * 0.11f, center = center)
            if (clue > 0) {
                if (state == ChocoBananaEngine.MARKED) drawCircle(MARK_COLOR, radius = cell * 0.42f, center = center, style = Stroke(1.5.dp.toPx()))
                drawCenteredNumber(clue, center, cell, if (state == ChocoBananaEngine.SHADED) SHADE_TEXT else NUM_COLOR)
            }
        }
        drawCellSelection(selectedState.value, cell)
    }
}

/** A bold (possibly multi-digit) number centred at [center] in a cell of side [cell]. */
internal fun DrawScope.drawCenteredNumber(value: Int, center: Offset, cell: Float, color: Color) {
    val text = value.toString()
    val paint = android.graphics.Paint().apply {
        this.color = color.toArgb()
        textSize = cell * when (text.length) {
            1 -> 0.5f
            2 -> 0.42f
            else -> 0.32f
        }
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(text, center.x, center.y - (fm.ascent + fm.descent) / 2, paint)
}
