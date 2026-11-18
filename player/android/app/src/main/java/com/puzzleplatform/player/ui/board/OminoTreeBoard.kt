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
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.OminoTreeEngine

private val LINE = Color(0xFF111111)
private val DASH_LINE = Color(0xFF888888)
private val ARROW_FILL = Color(0xFF9A9A9A)
private val ERROR = Color(0xFFD32F2F)

// A block arrow pointing right, centred on the origin, in cell units (as on web).
private val ARROW_POINTS = listOf(
    -0.27f to -0.09f, 0.04f to -0.09f, 0.04f to -0.2f, 0.27f to 0f, 0.04f to 0.2f, 0.04f to 0.09f, -0.27f to 0.09f,
)
private val ROTATION = mapOf("right" to 0f, "down" to 90f, "left" to 180f, "up" to 270f)

/**
 * Compose Canvas renderer for Omino Tree (puzzle type 38), the analog of
 * frontend/src/components/OminoTreeBoard.tsx.
 *
 * Input is a single gesture, as in Double Choco: a tap snaps to the nearest interior grid
 * line ([wallKeyAt]) and toggles the wall there. Two fingers pan/zoom via [ZoomableBoard].
 * With [liveValidate] on, a number whose block is too small is ringed red and an arrow
 * between two complete blocks that don't grow by one cell turns red.
 *
 * The Admin review editor passes [onEditTap]: a tap then reports its fractional cell
 * coordinates (x = column, y = row) for setting a number or cycling an arrow, and walls
 * aren't toggled. [selectedCell] ("col,row") outlines the cell being edited.
 */
@Composable
fun OminoTreeBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onSetEdge: (key: String, on: Boolean) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onEditTap: ((x: Float, y: Float) -> Unit)? = null,
    selectedCell: String? = null,
) {
    val board = remember(puzzle.id, puzzle.canonRepr) { OminoTreeEngine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows < 1 || cols < 1) return

    val valuesState = rememberUpdatedState(userValues)
    val onSet = rememberUpdatedState(onSetEdge)
    val onEdit = rememberUpdatedState(onEditTap)
    val errors = remember(board, userValues, liveValidate) {
        if (liveValidate) OminoTreeEngine.liveErrors(board, userValues) else null
    }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { _, _ -> },
        onTapPrecise = { fx, fy ->
            val edit = onEdit.value
            if (edit != null) {
                edit(fx, fy)
                return@ZoomableBoard
            }
            val key = wallKeyAt(fx, fy, rows, cols) ?: return@ZoomableBoard
            onSet.value(key, valuesState.value[key] != 1)
        },
    ) { cell ->
        drawRect(Color.White, Offset.Zero, Size(cols * cell, rows * cell))

        board.arrows.forEachIndexed { i, a ->
            val (dr, dc) = OminoTreeEngine.STEP[a.dir] ?: return@forEachIndexed
            val x = (a.c + 0.5f + dc / 2f) * cell
            val y = (a.r + 0.5f + dr / 2f) * cell
            val path = Path().apply {
                ARROW_POINTS.forEachIndexed { j, (px, py) ->
                    if (j == 0) moveTo(px * cell, py * cell) else lineTo(px * cell, py * cell)
                }
                close()
            }
            translate(x, y) {
                rotate(ROTATION[a.dir] ?: 0f, pivot = Offset.Zero) {
                    drawPath(path, if (errors?.arrows?.contains(i) == true) ERROR else ARROW_FILL)
                }
            }
        }

        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val n = board.number(r, c)
                if (n <= 0) continue
                val bad = errors?.numbers?.contains("$r,$c") == true
                if (bad) {
                    drawCircle(ERROR, cell * 0.3f, Offset((c + 0.5f) * cell, (r + 0.5f) * cell), style = Stroke(2.dp.toPx()))
                }
                drawNumber(n, c, r, cell, if (bad) ERROR else LINE)
            }
        }

        val thin = 1.dp.toPx()
        val thick = 3.5.dp.toPx()
        val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.08f, cell * 0.06f))
        for (r in 1 until rows) {
            for (c in 0 until cols) {
                val wall = userValues[OminoTreeEngine.hKey(r - 1, c)] == 1
                drawLine(
                    if (wall) LINE else DASH_LINE,
                    Offset(c * cell, r * cell),
                    Offset((c + 1) * cell, r * cell),
                    strokeWidth = if (wall) thick else thin,
                    pathEffect = if (wall) null else dash,
                )
            }
        }
        for (c in 1 until cols) {
            for (r in 0 until rows) {
                val wall = userValues[OminoTreeEngine.vKey(r, c - 1)] == 1
                drawLine(
                    if (wall) LINE else DASH_LINE,
                    Offset(c * cell, r * cell),
                    Offset(c * cell, (r + 1) * cell),
                    strokeWidth = if (wall) thick else thin,
                    pathEffect = if (wall) null else dash,
                )
            }
        }
        drawRect(LINE, Offset.Zero, Size(cols * cell, rows * cell), style = Stroke(thick))
        drawCellSelection(selectedCell, cell)
    }
}

/** A (possibly multi-digit) number centred in cell (col, row). */
private fun DrawScope.drawNumber(value: Int, col: Int, row: Int, cell: Float, color: Color) {
    val paint = android.graphics.Paint().apply {
        this.color = color.toArgb()
        textSize = cell * if (value >= 10) 0.42f else 0.55f
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
    }
    val fm = paint.fontMetrics
    val cy = row * cell + cell / 2 - (fm.ascent + fm.descent) / 2
    drawContext.canvas.nativeCanvas.drawText(value.toString(), col * cell + cell / 2, cy, paint)
}
