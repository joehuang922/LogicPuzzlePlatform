package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.KakuroEngine

private val GRID_BG = Color.White
private val LINE = Color.Black
private val CLUE_BG = Color(0xFF333333)
private val CLUE_DIAG = Color(0xFF555555)
private val CLUE_TEXT = Color.White
private val CLUE_ERROR = Color(0xFFFF6B6B)
private val USER_COLOR = Color(0xFF222222)
private val CONFLICT_COLOR = Color(0xFFCC0000)
private val SELECT_FILL = Color(0xFFE0E8FF)
private val ERROR_FILL = Color(0xFFFFE0E0)

/**
 * Compose Canvas renderer for Kakuro, the analog of
 * frontend/src/components/KakuroBoard.tsx.
 *
 * Draws an m x n grid: clue cells are dark with a diagonal split and up to two
 * sums (right in the upper-right, down in the lower-left); empty cells are white
 * with the player's digit. When [liveValidate] is on, cells/clues in a certain
 * violation are tinted red.
 *
 * Rendering + tap hit-testing run through [ZoomableBoard], which supplies the
 * (possibly zoomed) cell size and handles pinch/pan — so big Kakuro grids stay
 * legible on a phone. Tapping an empty cell selects it; the caller renders a
 * [DigitBar] to enter values.
 */
@Composable
fun KakuroBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    liveValidate: Boolean,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cells = remember(puzzle.id) { KakuroEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    val analysis = if (liveValidate) KakuroEngine.analyze(puzzle, userValues) else null
    val cellErrors = analysis?.cellErrors ?: emptySet()
    val clueErrors = analysis?.clueErrors ?: emptySet()

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            if (cells.getOrNull(row)?.getOrNull(col) is KakuroEngine.Cell.Empty) {
                val key = "$col,$row"
                onSelectCell(if (selectedCell == key) null else key)
            }
        },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(color = GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        val clueTextSize = cell * 0.3f
        val valueTextSize = cell * 0.55f

        for (row in 0 until rows) {
            val rowCells = cells[row]
            for (col in 0 until cols) {
                val x = col * cell
                val y = row * cell
                val c = rowCells.getOrNull(col)
                val key = "$col,$row"
                when (c) {
                    is KakuroEngine.Cell.Clue -> {
                        drawRect(CLUE_BG, topLeft = Offset(x, y), size = Size(cell, cell))
                        drawLine(CLUE_DIAG, Offset(x, y), Offset(x + cell, y + cell), 1f)
                        c.right?.let {
                            val err = clueErrors.contains("$key:right")
                            drawText(it.toString(), x + cell * 0.72f, y + cell * 0.35f, clueTextSize, if (err) CLUE_ERROR else CLUE_TEXT, bold = true)
                        }
                        c.down?.let {
                            val err = clueErrors.contains("$key:down")
                            drawText(it.toString(), x + cell * 0.28f, y + cell * 0.7f, clueTextSize, if (err) CLUE_ERROR else CLUE_TEXT, bold = true)
                        }
                    }
                    is KakuroEngine.Cell.Empty -> {
                        val fill = when {
                            selectedCell == key -> SELECT_FILL
                            cellErrors.contains(key) -> ERROR_FILL
                            else -> null
                        }
                        fill?.let { drawRect(it, topLeft = Offset(x, y), size = Size(cell, cell)) }
                        val v = userValues[key] ?: 0
                        if (v > 0) {
                            val color = if (cellErrors.contains(key)) CONFLICT_COLOR else USER_COLOR
                            drawText(v.toString(), x + cell / 2, y + cell / 2, valueTextSize, color, bold = true)
                        }
                    }
                    null -> {} // ragged row padding
                }
            }
        }

        // Grid lines (thicker outer border).
        val thin = 1f
        val thick = 4f
        for (r in 0..rows) {
            val p = r * cell
            drawLine(LINE, Offset(0f, p), Offset(boardW, p), if (r == 0 || r == rows) thick else thin)
        }
        for (col in 0..cols) {
            val p = col * cell
            drawLine(LINE, Offset(p, 0f), Offset(p, boardH), if (col == 0 || col == cols) thick else thin)
        }
    }
}

/** Draw text centered at (cx, cy). */
private fun DrawScope.drawText(
    text: String,
    cx: Float,
    cy: Float,
    textSize: Float,
    color: Color,
    bold: Boolean,
) {
    val paint = android.graphics.Paint().apply {
        this.color = color.toArgb()
        this.textSize = textSize
        this.textAlign = android.graphics.Paint.Align.CENTER
        this.isAntiAlias = true
        this.typeface = if (bold) {
            android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
        } else {
            android.graphics.Typeface.DEFAULT
        }
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(text, cx, cy - (fm.ascent + fm.descent) / 2, paint)
}
