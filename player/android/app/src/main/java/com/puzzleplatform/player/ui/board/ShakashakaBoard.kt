package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.ShakashakaEngine

// Colors match the web ShakashakaBoard: near-black clue cells and triangles on white.
private val WHITE_BG = Color.White
private val BLACK_FILL = Color(0xFF222222)
private val LINE_COLOR = Color(0xFF333333)
private val MARK_COLOR = Color(0xFF666666)

/**
 * Compose Canvas renderer for Shakashaka (puzzle type 11), the analog of
 * frontend/src/components/ShakashakaBoard.tsx.
 *
 * Black cells (some numbered) are fixed; each white cell takes a half-cell black
 * triangle or a dot mark. A tap picks the triangle by the quadrant tapped (its right
 * angle sits in that corner) and [ShakashakaEngine.nextState] decides the result:
 * empty -> triangle, other triangle -> this one, same triangle -> dot, dot -> empty.
 * [onPutValue] receives "col,row" -> state (0 clears). Two fingers pan/zoom via
 * [ZoomableBoard].
 *
 * The Admin review editor passes [onTapCell] to select a cell and [selectedCell]
 * ("col,row") to highlight it.
 */
@Composable
fun ShakashakaBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onPutValue: (key: String, value: Int) -> Unit,
    modifier: Modifier = Modifier,
    onTapCell: (col: Int, row: Int) -> Unit = { _, _ -> },
    selectedCell: String? = null,
) {
    // Keyed on the canon too: the Admin review editor changes it under a stable id.
    val cells = remember(puzzle.id, puzzle.canonRepr) { ShakashakaEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    // The tap closure outlives a recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values/callback through state.
    val valuesState = rememberUpdatedState(userValues)
    val onPut = rememberUpdatedState(onPutValue)
    val onTap = rememberUpdatedState(onTapCell)
    val selectedState = rememberUpdatedState(selectedCell)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> onTap.value(col, row) }, // play places by quadrant; the Admin editor selects
        onTapPrecise = { fc, fr ->
            val col = fc.toInt()
            val row = fr.toInt()
            if (col in 0 until cols && row in 0 until rows &&
                ShakashakaEngine.isWhiteCell(cells, row, col)
            ) {
                val key = ShakashakaEngine.cellKey(col, row)
                val current = valuesState.value[key] ?: ShakashakaEngine.UNSET
                val quadrant = ShakashakaEngine.quadrant(fc - col, fr - row)
                onPut.value(key, ShakashakaEngine.nextState(current, quadrant))
            }
        },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(WHITE_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val x = c * cell
                val y = r * cell
                if (!ShakashakaEngine.isWhiteCell(cells, r, c)) {
                    drawRect(BLACK_FILL, topLeft = Offset(x, y), size = Size(cell, cell))
                    val clue = cells[r].getOrNull(c) ?: continue
                    if (clue in 0..4) drawClue(clue, c, r, cell)
                    continue
                }
                when (val s = valuesState.value[ShakashakaEngine.cellKey(c, r)] ?: ShakashakaEngine.UNSET) {
                    in ShakashakaEngine.TRI_TL..ShakashakaEngine.TRI_BR -> drawPath(trianglePath(s, x, y, cell), BLACK_FILL)
                    ShakashakaEngine.MARK -> drawCircle(
                        MARK_COLOR,
                        radius = cell * 0.11f,
                        center = Offset(x + cell / 2, y + cell / 2),
                    )
                }
            }
        }

        // Gridlines: dashed interior, solid outer border (web style).
        val thin = 1.dp.toPx()
        val thick = 2.5.dp.toPx()
        val dash = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx()))
        for (r in 0..rows) {
            val isBorder = r == 0 || r == rows
            drawLine(
                LINE_COLOR,
                Offset(0f, r * cell),
                Offset(boardW, r * cell),
                strokeWidth = if (isBorder) thick else thin,
                cap = StrokeCap.Square,
                pathEffect = if (isBorder) null else dash,
            )
        }
        for (c in 0..cols) {
            val isBorder = c == 0 || c == cols
            drawLine(
                LINE_COLOR,
                Offset(c * cell, 0f),
                Offset(c * cell, boardH),
                strokeWidth = if (isBorder) thick else thin,
                cap = StrokeCap.Square,
                pathEffect = if (isBorder) null else dash,
            )
        }

        drawCellSelection(selectedState.value, cell)
    }
}

/** The half-cell triangle for [state], its right angle in the named corner. */
private fun trianglePath(state: Int, x: Float, y: Float, size: Float): Path {
    val x1 = x + size
    val y1 = y + size
    val pts = when (state) {
        ShakashakaEngine.TRI_TL -> listOf(x to y, x1 to y, x to y1)
        ShakashakaEngine.TRI_TR -> listOf(x to y, x1 to y, x1 to y1)
        ShakashakaEngine.TRI_BL -> listOf(x to y, x to y1, x1 to y1)
        else -> listOf(x1 to y, x to y1, x1 to y1)
    }
    return Path().apply {
        moveTo(pts[0].first, pts[0].second)
        lineTo(pts[1].first, pts[1].second)
        lineTo(pts[2].first, pts[2].second)
        close()
    }
}

/** Draw a white clue number centered in black cell (col, row). */
private fun DrawScope.drawClue(value: Int, col: Int, row: Int, cell: Float) {
    val paint = android.graphics.Paint().apply {
        this.color = Color.White.toArgb()
        this.textSize = cell * 0.5f
        this.textAlign = android.graphics.Paint.Align.CENTER
        this.isAntiAlias = true
        this.typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val cx = col * cell + cell / 2
    val fm = paint.fontMetrics
    val cy = row * cell + cell / 2 - (fm.ascent + fm.descent) / 2
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy, paint)
}
