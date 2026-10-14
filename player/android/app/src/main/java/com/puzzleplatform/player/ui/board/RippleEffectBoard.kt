package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.RippleEffectEngine

private val GRID_BG = Color.White
private val CLUE_BG = Color(0xFFF1F1F1)
private val LINE = Color.Black
private val THIN_LINE = Color(0xFFBBBBBB)
private val CLUE_COLOR = Color(0xFF111111)
private val USER_COLOR = Color(0xFF2563EB)
private val SELECT_FILL = Color(0xFFE0E8FF)

/**
 * Compose Canvas renderer for Ripple Effect (puzzle type 25), the analog of
 * frontend/src/components/RippleEffectBoard.tsx.
 *
 * The room partition is fixed in the canon, so — unlike Fillomino — there's no wall
 * mode: a tap just selects a non-clue cell, and the caller shows a [DigitBar] to
 * enter a (possibly multi-digit) value. Clue cells are locked and shown on a grey
 * ground in bold black; player entries are blue. Thick lines are the canon room
 * borders plus the perimeter; interior cell separators are thin grey. Rendering and
 * pan/zoom run through [ZoomableBoard].
 */
@Composable
fun RippleEffectBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cells = remember(puzzle.id) { RippleEffectEngine.parseCells(puzzle) }
    val edges = remember(puzzle.id) { RippleEffectEngine.parseEdges(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    // The tap closure outlives a recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values through state.
    val selectedState = rememberUpdatedState(selectedCell)
    val onSelect = rememberUpdatedState(onSelectCell)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            if ((cells.getOrNull(row)?.getOrNull(col) ?: 0) > 0) return@ZoomableBoard // clue locked
            val key = RippleEffectEngine.cellKey(col, row)
            onSelect.value(if (selectedState.value == key) null else key)
        },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        // Clue cells sit on a grey ground; the selected cell is tinted on top.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if ((cells.getOrNull(r)?.getOrNull(c) ?: 0) > 0) {
                    drawRect(CLUE_BG, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
                }
            }
        }
        selectedCell?.toCellColRow()?.let { (c, r) ->
            drawRect(SELECT_FILL, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
        }

        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()

        // Horizontal lines: line index r (y = r*cell), one segment per column. A line is
        // thick on the perimeter or where the canon marks a room border below cell[r-1][c].
        for (r in 0..rows) {
            val isBorder = r == 0 || r == rows
            for (c in 0 until cols) {
                val isRoomEdge = !isBorder && edges.h[r - 1][c] == 1
                val thickLine = isBorder || isRoomEdge
                drawLine(
                    if (thickLine) LINE else THIN_LINE,
                    Offset(c * cell, r * cell),
                    Offset((c + 1) * cell, r * cell),
                    strokeWidth = if (thickLine) thick else thin,
                )
            }
        }
        // Vertical lines: line index c (x = c*cell), one segment per row.
        for (c in 0..cols) {
            val isBorder = c == 0 || c == cols
            for (r in 0 until rows) {
                val isRoomEdge = !isBorder && edges.v[r][c - 1] == 1
                val thickLine = isBorder || isRoomEdge
                drawLine(
                    if (thickLine) LINE else THIN_LINE,
                    Offset(c * cell, r * cell),
                    Offset(c * cell, (r + 1) * cell),
                    strokeWidth = if (thickLine) thick else thin,
                )
            }
        }

        // Numbers on top: clues bold black, player entries blue; font shrinks for
        // multi-digit values so e.g. "12" still fits one cell.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val clue = cells.getOrNull(r)?.getOrNull(c) ?: 0
                val value: Int
                val color: Color
                val bold: Boolean
                if (clue > 0) {
                    value = clue; color = CLUE_COLOR; bold = true
                } else {
                    val entered = userValues[RippleEffectEngine.cellKey(c, r)] ?: 0
                    if (entered <= 0) continue
                    value = entered; color = USER_COLOR; bold = false
                }
                drawNumber(value, c, r, cell, color, bold)
            }
        }
    }
}

/** Parse a "col,row" selection key into (col, row), or null if malformed. */
private fun String.toCellColRow(): Pair<Int, Int>? {
    val parts = split(",")
    if (parts.size != 2) return null
    val col = parts[0].toIntOrNull() ?: return null
    val row = parts[1].toIntOrNull() ?: return null
    return col to row
}

/** Draw a (possibly multi-digit) number centered in cell (col, row). */
private fun DrawScope.drawNumber(value: Int, col: Int, row: Int, cell: Float, color: Color, bold: Boolean) {
    val digits = value.toString().length
    val textSize = cell * when {
        digits <= 1 -> 0.5f
        digits == 2 -> 0.38f
        else -> 0.28f
    }
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
    val fm = paint.fontMetrics
    val cy = row * cell + cell / 2 - (fm.ascent + fm.descent) / 2
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy, paint)
}
