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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.LRingEngine
import com.puzzleplatform.player.puzzle.LRingRules
import com.puzzleplatform.player.puzzle.MasyuEngine

private val GRID_BG = Color.White
private val BORDER = Color(0xFF222222)
private val GRID_LINE = Color(0xFFBBBBBB)
private val ARROW = Color(0xFF222222)
private val SEGMENT = Color(0xFF888888)
private val ERROR_COLOR = Color(0xFFDD3333)
private val SELECT_FILL = Color(0xFFE0E8FF)

/**
 * Compose Canvas renderer for L-Ring (puzzle type 33), the analog of
 * frontend/src/components/LRingBoard.tsx.
 *
 * Drawing is Masyu's ([MasyuDragState]): one finger drags between neighbouring cell
 * centres, and the first edge crossed decides whether the gesture draws or erases. Two
 * fingers pan/zoom via [ZoomableBoard]. Arrows sit under the loop; when [liveValidate]
 * is on, an arrow whose L can no longer work ([LRingRules.arrowState] BAD) is red.
 *
 * The Admin review editor passes [onTapCell] to select a cell and [selectedCell]
 * ("col,row") to highlight it.
 */
@Composable
fun LRingBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    liveValidate: Boolean,
    onSetEdge: (key: String, on: Boolean) -> Unit,
    modifier: Modifier = Modifier,
    onTapCell: (col: Int, row: Int) -> Unit = { _, _ -> },
    selectedCell: String? = null,
) {
    // Keyed on the canon too: the Admin review editor changes it under a stable id.
    val cells = remember(puzzle.id, puzzle.canonRepr) { LRingEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    val valuesState = rememberUpdatedState(userValues)
    val onSet = rememberUpdatedState(onSetEdge)
    val onTap = rememberUpdatedState(onTapCell)
    val selectedState = rememberUpdatedState(selectedCell)
    val drag = remember(puzzle.id) { MasyuDragState() }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> onTap.value(col, row) }, // play has no tap; the Admin editor selects
        onDrawStart = { cell -> drag.start(cell) },
        onDrawEnd = { drag.end() },
        onDrawTo = { cell -> drag.moveTo(cell, valuesState.value) { key, on -> onSet.value(key, on) } },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        val values = valuesState.value
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))
        selectedState.value?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }?.let { (c, r) ->
            drawRect(SELECT_FILL, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
        }

        // Dashed inner grid lines, like the print.
        val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.11f, cell * 0.08f))
        for (r in 1 until rows) drawLine(GRID_LINE, Offset(0f, r * cell), Offset(boardW, r * cell), cell * 0.02f, pathEffect = dash)
        for (c in 1 until cols) drawLine(GRID_LINE, Offset(c * cell, 0f), Offset(c * cell, boardH), cell * 0.02f, pathEffect = dash)

        // Arrows, under the loop.
        val edges = if (liveValidate) MasyuEngine.edges(cells, values) else null
        for (r in 0 until rows) {
            for (c in 0 until cells[r].size) {
                val v = cells[r][c]
                if (!LRingRules.isArrow(v)) continue
                val bad = edges != null && LRingRules.arrowState(cells, edges, r, c) == LRingRules.ArrowState.BAD
                drawLRingArrow(v, Offset((c + 0.5f) * cell, (r + 0.5f) * cell), cell * 0.72f, if (bad) ERROR_COLOR else ARROW)
            }
        }

        val segWidth = cell * 0.1f
        for (r in 0 until rows) {
            for (c in 0 until cols - 1) {
                if (values[MasyuEngine.hKey(r, c)] != 1) continue
                val y = (r + 0.5f) * cell
                drawLine(SEGMENT, Offset((c + 0.5f) * cell, y), Offset((c + 1.5f) * cell, y), segWidth, cap = StrokeCap.Round)
            }
        }
        for (r in 0 until rows - 1) {
            for (c in 0 until cols) {
                if (values[MasyuEngine.vKey(r, c)] != 1) continue
                val x = (c + 0.5f) * cell
                drawLine(SEGMENT, Offset(x, (r + 0.5f) * cell), Offset(x, (r + 1.5f) * cell), segWidth, cap = StrokeCap.Round)
            }
        }

        drawRect(BORDER, topLeft = Offset(0f, 0f), size = Size(boardW, boardH), style = Stroke(width = cell * 0.06f))
    }
}

/**
 * A bold filled arrow for code [code] (1 up, 2 right, 3 down, 4 left) centred at
 * [center] in a box of side [size]; matches lRingArrow.tsx. Shared by the board, the mini
 * board and the editor's arrow picker.
 */
fun DrawScope.drawLRingArrow(code: Int, center: Offset, size: Float, color: Color = ARROW) {
    if (!LRingRules.isArrow(code)) return
    val s = size / 2
    val (x, y) = center
    val path = Path().apply {
        moveTo(x, y - s)
        lineTo(x + s * 0.85f, y - s * 0.05f)
        lineTo(x + s * 0.32f, y - s * 0.05f)
        lineTo(x + s * 0.32f, y + s)
        lineTo(x - s * 0.32f, y + s)
        lineTo(x - s * 0.32f, y - s * 0.05f)
        lineTo(x - s * 0.85f, y - s * 0.05f)
        close()
    }
    rotate((code - 1) * 90f, pivot = center) { drawPath(path, color) }
}
