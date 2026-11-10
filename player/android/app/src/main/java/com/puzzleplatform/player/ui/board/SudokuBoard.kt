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

private val GRID_BG = Color.White
private val LINE = Color.Black
private val HINT_COLOR = Color.Black
private val USER_COLOR = Color(0xFF888888)
private val NOTE_COLOR = Color(0xFF999999)
private val CONFLICT_COLOR = Color(0xFFD32F2F)
private val SELECT_FILL = Color(0x9963A4FF)
private val PEER_FILL = Color(0x33BBDEFB)
// Hint highlight (docs/auto-solve): the next cell to fill, in amber.
private val HINT_FOCUS_FILL = Color(0xFFFFF59D)

/**
 * Compose Canvas renderer for Sudoku, the analog of
 * frontend/src/components/SudokuBoard.tsx.
 *
 * Draws an N x N grid (thin cell / medium room / thick border lines; rooms are
 * roomWidth x roomHeight, 3x3 on a 9x9, up to 30x30), hint values in black, player
 * entries in grey (red when [liveValidate] and in conflict), and highlights the
 * selected cell + its row/col/room peers. Tapping a non-hint cell selects it; the
 * caller renders a [DigitBar] to enter values.
 *
 * Rendering + tap hit-testing run through [ZoomableBoard]. A 9x9 grid fits at the
 * max cell size on a phone, so it behaves like a plain fit-to-width board; a 16x16
 * to 30x30 board gets pinch-zoom and pan.
 */
@Composable
fun SudokuBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    liveValidate: Boolean,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    modifier: Modifier = Modifier,
    // The hinted next cell ("col,row"), or null when no hint is shown.
    hintCell: String? = null,
) {
    val hints = remember(puzzle.id) { SudokuEngine.parseHints(puzzle) }
    val dims = remember(puzzle.id) { SudokuEngine.dims(puzzle) }
    val n = dims.size
    val conflicts = if (liveValidate) SudokuEngine.findConflicts(puzzle, userValues) else emptySet()

    ZoomableBoard(
        cols = n,
        rows = n,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            if (hints[row][col] > 0) return@ZoomableBoard // hints are locked
            val key = "$col,$row"
            onSelectCell(if (selectedCell == key) null else key)
        },
    ) { cell ->
        val boardSize = n * cell
        drawRect(color = GRID_BG, size = androidx.compose.ui.geometry.Size(boardSize, boardSize))

        // Hint highlight, drawn under the selection/peer layer so a selected cell still
        // reads as selected.
        hintCell?.toColRow()?.let { (c, r) -> drawCellFill(c, r, cell, HINT_FOCUS_FILL) }

        // Highlight selected cell + peers.
        selectedCell?.let { key ->
            val (selCol, selRow) = key.split(",").map { it.toInt() }
            drawPeerHighlights(selCol, selRow, cell, dims)
            drawCellFill(selCol, selRow, cell, SELECT_FILL)
        }

        // Grid lines (thin=1, room=2, border=3 dp scaled to px): vertical room lines
        // every roomWidth columns, horizontal every roomHeight rows.
        val thin = 1.dp.toPx()
        val medium = 2.dp.toPx()
        val thick = 3.dp.toPx()
        fun stroke(i: Int, room: Int) = when {
            i == 0 || i == n -> thick
            i % room == 0 -> medium
            else -> thin
        }
        for (i in 0..n) {
            val p = i * cell
            drawLine(LINE, Offset(0f, p), Offset(boardSize, p), stroke(i, dims.roomHeight))
            drawLine(LINE, Offset(p, 0f), Offset(p, boardSize), stroke(i, dims.roomWidth))
        }

        // Values.
        val textSize = cell * 0.55f
        for (row in 0 until n) {
            for (col in 0 until n) {
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
                        // Empty cell: render pencil marks laid out like a room (3x3 on a
                        // 9x9: 1 2 3 / 4 5 6 / 7 8 9; roomWidth x roomHeight above).
                        for (digit in 1..n) {
                            if (userValues["n:$key:$digit"] == 1) {
                                drawNote(digit, col, row, cell, dims)
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

/** Parse a "col,row" cell key into a (col, row) pair, or null if malformed. */
private fun String.toColRow(): Pair<Int, Int>? {
    val parts = split(",")
    if (parts.size != 2) return null
    val col = parts[0].toIntOrNull() ?: return null
    val row = parts[1].toIntOrNull() ?: return null
    return col to row
}

/** Draw a single pencil-mark digit at its room-shaped sub-cell within cell (col,row). */
private fun DrawScope.drawNote(digit: Int, col: Int, row: Int, cell: Float, dims: SudokuEngine.Dims) {
    val slotW = cell / dims.roomWidth
    val slotH = cell / dims.roomHeight
    val paint = android.graphics.Paint().apply {
        this.color = NOTE_COLOR.toArgb()
        this.textSize = minOf(slotH * 0.8f, slotW * if (digit > 9) 0.8f else 1.3f)
        this.textAlign = android.graphics.Paint.Align.CENTER
        this.isAntiAlias = true
        this.typeface = android.graphics.Typeface.DEFAULT
    }
    val sub = digit - 1
    val cx = col * cell + ((sub % dims.roomWidth) + 0.5f) * slotW
    val fm = paint.fontMetrics
    val cy = row * cell + (sub / dims.roomWidth + 0.5f) * slotH - (fm.ascent + fm.descent) / 2
    drawContext.canvas.nativeCanvas.drawText(digit.toString(), cx, cy, paint)
}

private fun DrawScope.drawCellFill(col: Int, row: Int, cell: Float, color: Color) {
    drawRect(
        color = color,
        topLeft = Offset(col * cell + 1, row * cell + 1),
        size = androidx.compose.ui.geometry.Size(cell - 2, cell - 2),
    )
}

private fun DrawScope.drawPeerHighlights(selCol: Int, selRow: Int, cell: Float, dims: SudokuEngine.Dims) {
    val n = dims.size
    for (c in 0 until n) if (c != selCol) drawCellFill(c, selRow, cell, PEER_FILL)
    for (r in 0 until n) if (r != selRow) drawCellFill(selCol, r, cell, PEER_FILL)
    val boxCol = selCol / dims.roomWidth * dims.roomWidth
    val boxRow = selRow / dims.roomHeight * dims.roomHeight
    for (r in boxRow until boxRow + dims.roomHeight) {
        for (c in boxCol until boxCol + dims.roomWidth) {
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
