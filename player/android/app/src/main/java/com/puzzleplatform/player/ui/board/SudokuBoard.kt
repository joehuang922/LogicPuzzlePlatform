package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.SudokuEngine

private const val SIZE = 9

private val GRID_BG = Color.White
private val LINE = Color.Black
private val HINT_COLOR = Color.Black
private val USER_COLOR = Color(0xFF888888)
private val NOTE_COLOR = Color(0xFF999999)
private val CONFLICT_COLOR = Color(0xFFD32F2F)
private val SELECT_FILL = Color(0x9963A4FF)
private val PEER_FILL = Color(0x33BBDEFB)

/**
 * Compose Canvas renderer for Sudoku, the analog of
 * frontend/src/components/SudokuBoard.tsx.
 *
 * Draws a 9x9 grid (thin cell / medium box / thick border lines), hint values in
 * black, player entries in grey (red when [liveValidate] and in conflict), and
 * highlights the selected cell + its row/col/box peers. Tapping a non-hint cell
 * selects it; the caller renders a [DigitBar] to enter values.
 *
 * Rendering + tap hit-testing run through [ZoomableBoard]. A 9x9 grid fits at the
 * max cell size on a phone, so there's no zoom range and it behaves like a plain
 * fit-to-width board today; the plumbing is shared so larger variants (should the
 * size ever relax) get pinch/pan for free.
 */
@Composable
fun SudokuBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    liveValidate: Boolean,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val hints = remember(puzzle.id) { SudokuEngine.parseHints(puzzle) }
    val conflicts = if (liveValidate) SudokuEngine.findConflicts(puzzle, userValues) else emptySet()

    ZoomableBoard(
        cols = SIZE,
        rows = SIZE,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            if (hints[row][col] > 0) return@ZoomableBoard // hints are locked
            val key = "$col,$row"
            onSelectCell(if (selectedCell == key) null else key)
        },
    ) { cell ->
        val boardSize = SIZE * cell
        drawRect(color = GRID_BG, size = androidx.compose.ui.geometry.Size(boardSize, boardSize))

        // Highlight selected cell + peers.
        selectedCell?.let { key ->
            val (selCol, selRow) = key.split(",").map { it.toInt() }
            drawPeerHighlights(selCol, selRow, cell)
            drawCellFill(selCol, selRow, cell, SELECT_FILL)
        }

        // Grid lines (thin=1, box=2, border=3 dp scaled to px).
        val thin = 1.dp.toPx()
        val medium = 2.dp.toPx()
        val thick = 3.dp.toPx()
        for (i in 0..SIZE) {
            val stroke = when {
                i == 0 || i == SIZE -> thick
                i % 3 == 0 -> medium
                else -> thin
            }
            val p = i * cell
            drawLine(LINE, Offset(0f, p), Offset(boardSize, p), stroke)
            drawLine(LINE, Offset(p, 0f), Offset(p, boardSize), stroke)
        }

        // Values.
        val textSize = cell * 0.55f
        val noteTextSize = cell / 3f * 0.8f
        for (row in 0 until SIZE) {
            for (col in 0 until SIZE) {
                val key = "$col,$row"
                val hint = hints[row][col]
                val value: Int
                val color: Color
                if (hint > 0) {
                    value = hint
                    color = if (conflicts.contains(key)) CONFLICT_COLOR else HINT_COLOR
                } else {
                    val entered = userValues[key] ?: 0
                    if (entered <= 0) {
                        // Empty cell: render pencil marks in a fixed 3x3 sub-layout
                        // (1 2 3 / 4 5 6 / 7 8 9).
                        for (digit in 1..9) {
                            if (userValues["n:$key:$digit"] == 1) {
                                drawNote(digit, col, row, cell, noteTextSize)
                            }
                        }
                        continue
                    }
                    value = entered
                    color = if (conflicts.contains(key)) CONFLICT_COLOR else USER_COLOR
                }
                drawDigit(value, col, row, cell, textSize, color, bold = hint > 0)
            }
        }
    }
}

/** Draw a single pencil-mark digit at its fixed 3x3 sub-cell within cell (col,row). */
private fun DrawScope.drawNote(digit: Int, col: Int, row: Int, cell: Float, textSize: Float) {
    val paint = android.graphics.Paint().apply {
        this.color = NOTE_COLOR.toArgb()
        this.textSize = textSize
        this.textAlign = android.graphics.Paint.Align.CENTER
        this.isAntiAlias = true
        this.typeface = android.graphics.Typeface.DEFAULT
    }
    val third = cell / 3f
    val sub = digit - 1
    val cx = col * cell + ((sub % 3) + 0.5f) * third
    val fm = paint.fontMetrics
    val cy = row * cell + (sub / 3 + 0.5f) * third - (fm.ascent + fm.descent) / 2
    drawContext.canvas.nativeCanvas.drawText(digit.toString(), cx, cy, paint)
}

private fun DrawScope.drawCellFill(col: Int, row: Int, cell: Float, color: Color) {
    drawRect(
        color = color,
        topLeft = Offset(col * cell + 1, row * cell + 1),
        size = androidx.compose.ui.geometry.Size(cell - 2, cell - 2),
    )
}

private fun DrawScope.drawPeerHighlights(selCol: Int, selRow: Int, cell: Float) {
    for (c in 0 until SIZE) if (c != selCol) drawCellFill(c, selRow, cell, PEER_FILL)
    for (r in 0 until SIZE) if (r != selRow) drawCellFill(selCol, r, cell, PEER_FILL)
    val boxCol = selCol / 3 * 3
    val boxRow = selRow / 3 * 3
    for (r in boxRow until boxRow + 3) {
        for (c in boxCol until boxCol + 3) {
            if (r != selRow || c != selCol) drawCellFill(c, r, cell, PEER_FILL)
        }
    }
}

private fun DrawScope.drawDigit(
    value: Int,
    col: Int,
    row: Int,
    cell: Float,
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
    val cx = col * cell + cell / 2
    // Vertically center: baseline offset by half the text height.
    val fm = paint.fontMetrics
    val cy = row * cell + cell / 2 - (fm.ascent + fm.descent) / 2
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy, paint)
}
