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
import com.puzzleplatform.player.puzzle.MinusRoomEngine

private val LINE = Color(0xFF111111)
private val THIN_LINE = Color(0xFFBBBBBB)
private val GIVEN = Color(0xFF111111)
private val PLAYER = Color(0xFF2563EB)
private val SELECT_FILL = Color(0xFFE0E8FF)
private val ERROR = Color(0xFFD32F2F)
private val ERROR_FILL = Color(0xFFFDE8E8)
private val EDGE_SELECT = Color(0xFF4A90D9)

/**
 * Compose Canvas renderer for Minus Room (puzzle type 39), the analog of
 * frontend/src/components/MinusRoomBoard.tsx.
 *
 * As Ripple Effect: a tap selects a non-given cell and the play screen's [DigitBar]
 * (1..max) enters its number. Givens are bold black, player numbers blue; room walls
 * thick, other lines thin gray; circled differences sit on their edges over the lines.
 * With [liveValidate] on, cells of a broken block or 2x2 are tinted red and a wrong
 * circle is ringed red.
 *
 * The Admin review editor passes [onEditTap]: every tap then reports its fractional cell
 * coordinates (x = column, y = row) instead, and [selectedCell] ("col,row") or
 * [selectedEdge] (doubled coordinates) is outlined.
 */
@Composable
fun MinusRoomBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onEditTap: ((x: Float, y: Float) -> Unit)? = null,
    selectedEdge: Pair<Int, Int>? = null,
) {
    val board = remember(puzzle.id, puzzle.canonRepr) { MinusRoomEngine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows < 1 || cols < 1) return

    val selectedState = rememberUpdatedState(selectedCell)
    val onSelect = rememberUpdatedState(onSelectCell)
    val onEdit = rememberUpdatedState(onEditTap)
    val errors = remember(board, userValues, liveValidate) {
        if (liveValidate) MinusRoomEngine.liveErrors(board, userValues) else null
    }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            if (onEdit.value != null || board.given(row, col) > 0) return@ZoomableBoard
            val key = MinusRoomEngine.cellKey(col, row)
            onSelect.value(if (selectedState.value == key) null else key)
        },
        onTapPrecise = { fx, fy -> onEdit.value?.invoke(fx, fy) },
    ) { cell ->
        drawRect(Color.White, Offset.Zero, Size(cols * cell, rows * cell))
        for (r in 0 until rows) for (c in 0 until cols) {
            if (errors?.cells?.contains("$r,$c") == true) drawRect(ERROR_FILL, Offset(c * cell, r * cell), Size(cell, cell))
        }
        selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }?.let { (c, r) ->
            drawRect(SELECT_FILL, Offset(c * cell, r * cell), Size(cell, cell))
        }

        for (r in 0 until rows) for (c in 0 until cols) {
            val given = board.given(r, c)
            val value = if (given > 0) given else (userValues[MinusRoomEngine.cellKey(c, r)] ?: 0).takeIf { it in 1..board.max } ?: 0
            if (value == 0) continue
            val bad = errors?.cells?.contains("$r,$c") == true
            drawCenteredText(value.toString(), (c + 0.5f) * cell, (r + 0.5f) * cell, cell * 0.5f, if (bad) ERROR else if (given > 0) GIVEN else PLAYER, given > 0)
        }

        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()
        for (r in 0 until rows - 1) for (c in 0 until cols) {
            val wall = board.wallBelow(r, c)
            drawLine(if (wall) LINE else THIN_LINE, Offset(c * cell, (r + 1) * cell), Offset((c + 1) * cell, (r + 1) * cell),
                strokeWidth = if (wall) thick else thin, cap = if (wall) StrokeCap.Square else StrokeCap.Butt)
        }
        for (r in 0 until rows) for (c in 0 until cols - 1) {
            val wall = board.wallRight(r, c)
            drawLine(if (wall) LINE else THIN_LINE, Offset((c + 1) * cell, r * cell), Offset((c + 1) * cell, (r + 1) * cell),
                strokeWidth = if (wall) thick else thin, cap = if (wall) StrokeCap.Square else StrokeCap.Butt)
        }
        drawRect(LINE, Offset.Zero, Size(cols * cell, rows * cell), style = Stroke(thick))

        selectedEdge?.let { (dr, dc) ->
            drawCircle(EDGE_SELECT, cell * 0.27f, Offset((dc / 2f + 0.5f) * cell, (dr / 2f + 0.5f) * cell), style = Stroke(3.dp.toPx()))
        }
        board.circles.forEachIndexed { i, k ->
            val center = Offset((k.dc / 2f + 0.5f) * cell, (k.dr / 2f + 0.5f) * cell)
            val wrong = errors?.circles?.contains(i) == true
            drawCircle(Color.White, cell * 0.18f, center)
            drawCircle(if (wrong) ERROR else LINE, cell * 0.18f, center, style = Stroke(if (wrong) 2.5.dp.toPx() else 1.3.dp.toPx()))
            drawCenteredText(k.value.toString(), center.x, center.y, cell * 0.26f, if (wrong) ERROR else LINE, false)
        }
    }
}

private fun DrawScope.drawCenteredText(text: String, cx: Float, cy: Float, size: Float, color: Color, bold: Boolean) {
    val paint = android.graphics.Paint().apply {
        this.color = color.toArgb()
        textSize = size
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
        if (bold) typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(text, cx, cy - (fm.ascent + fm.descent) / 2, paint)
}
