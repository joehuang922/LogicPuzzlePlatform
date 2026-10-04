package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import com.puzzleplatform.player.puzzle.FillominoEngine
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

/** Which input a tap performs: enter a number in a cell, or toggle a room wall. */
enum class FillominoMode { NUMBER, WALL }

private val GRID_BG = Color.White
private val LINE = Color.Black
private val CLUE_COLOR = Color(0xFF111111)
private val USER_COLOR = Color(0xFF2563EB)
private val SELECT_FILL = Color(0xFFE0E8FF)

/**
 * Compose Canvas renderer for Fillomino (puzzle type 14), the analog of
 * frontend/src/components/FillominoBoard.tsx.
 *
 * Fillomino needs two kinds of input, so unlike the other boards it has an explicit
 * [mode] toggle (rendered as chips by the caller):
 *  - NUMBER: tap a non-clue cell to select it; the caller shows a [DigitBar] to
 *    enter a (possibly multi-digit) room number. Clue cells are locked.
 *  - WALL: tap near an interior grid line to toggle the room wall on it. The tap
 *    snaps to the nearest interior line (via [ZoomableBoard]'s fractional tap), so a
 *    thin line never has to be hit precisely; there's no cell selection in this mode.
 *
 * Clues are drawn bold black, player numbers blue; drawn walls and the outer border
 * are solid/thick, the remaining cell separators thin and dashed (mirroring the web
 * board). Rendering and pan/zoom run through [ZoomableBoard].
 */
@Composable
fun FillominoBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    mode: FillominoMode,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onSetEdge: (key: String, on: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cells = remember(puzzle.id) { FillominoEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    // The gesture closures below outlive a recomposition (ZoomableBoard's pointerInput
    // doesn't restart when these change), so read the freshest values through state.
    val modeState = rememberUpdatedState(mode)
    val selectedState = rememberUpdatedState(selectedCell)
    val valuesState = rememberUpdatedState(userValues)
    val onSelect = rememberUpdatedState(onSelectCell)
    val onSet = rememberUpdatedState(onSetEdge)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            if (modeState.value != FillominoMode.NUMBER) return@ZoomableBoard
            if ((cells.getOrNull(row)?.getOrNull(col) ?: 0) > 0) return@ZoomableBoard // clue locked
            val key = FillominoEngine.cellKey(col, row)
            onSelect.value(if (selectedState.value == key) null else key)
        },
        onTapPrecise = { fx, fy ->
            if (modeState.value != FillominoMode.WALL) return@ZoomableBoard
            val key = wallKeyAt(fx, fy, rows, cols) ?: return@ZoomableBoard
            onSet.value(key, valuesState.value[key] != 1)
        },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        // Selected-cell highlight (NUMBER mode only; selection is cleared on switch).
        if (mode == FillominoMode.NUMBER) {
            selectedCell?.toCellColRow()?.let { (c, r) ->
                drawRect(SELECT_FILL, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
            }
        }

        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()
        val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.075f, cell * 0.075f))

        // Horizontal lines: line index r (y = r*cell), one segment per column.
        for (r in 0..rows) {
            val isBorder = r == 0 || r == rows
            for (c in 0 until cols) {
                val isWall = !isBorder && userValues[FillominoEngine.hKey(r - 1, c)] == 1
                val solid = isBorder || isWall
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
                val isWall = !isBorder && userValues[FillominoEngine.vKey(r, c - 1)] == 1
                val solid = isBorder || isWall
                drawLine(
                    LINE,
                    Offset(c * cell, r * cell),
                    Offset(c * cell, (r + 1) * cell),
                    strokeWidth = if (solid) thick else thin,
                    pathEffect = if (solid) null else dash,
                )
            }
        }

        // Numbers on top: clues bold black, player entries blue; font shrinks for
        // multi-digit room sizes so e.g. "12" still fits one cell.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val clue = cells.getOrNull(r)?.getOrNull(c) ?: 0
                val value: Int
                val color: Color
                val bold: Boolean
                if (clue > 0) {
                    value = clue; color = CLUE_COLOR; bold = true
                } else {
                    val entered = userValues[FillominoEngine.cellKey(c, r)] ?: 0
                    if (entered <= 0) continue
                    value = entered; color = USER_COLOR; bold = false
                }
                drawNumber(value, c, r, cell, color, bold)
            }
        }
    }
}

/**
 * Snap a fractional tap (in cell units) to the nearest interior grid line and return
 * the wall key to toggle, or null when the tap is nearest a border (no wall there).
 * A horizontal line at y = L is wall `h[L-1][col]`; a vertical line at x = L is
 * `v[row][L-1]`.
 */
internal fun wallKeyAt(fx: Float, fy: Float, rows: Int, cols: Int): String? {
    val hLine = fy.roundToInt()
    val vLine = fx.roundToInt()
    val dH = abs(fy - hLine)
    val dV = abs(fx - vLine)
    val hInterior = hLine in 1 until rows
    val vInterior = vLine in 1 until cols
    return when {
        hInterior && (!vInterior || dH <= dV) -> {
            val c = floor(fx).toInt().coerceIn(0, cols - 1)
            FillominoEngine.hKey(hLine - 1, c)
        }
        vInterior -> {
            val r = floor(fy).toInt().coerceIn(0, rows - 1)
            FillominoEngine.vKey(r, vLine - 1)
        }
        else -> null
    }
}

/** Parse a "c:col,row" selection key into (col, row), or null if malformed. */
private fun String.toCellColRow(): Pair<Int, Int>? {
    if (!startsWith("c:")) return null
    val parts = removePrefix("c:").split(",")
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
