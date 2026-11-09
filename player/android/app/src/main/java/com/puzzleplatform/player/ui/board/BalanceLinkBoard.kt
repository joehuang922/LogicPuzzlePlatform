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
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.BalanceLinkRules
import com.puzzleplatform.player.puzzle.NumberLinkEngine
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

private val GRID_BG = Color.White
private val BORDER = Color(0xFF222222)
private val GRID_LINE = Color(0xFFBBBBBB)
private val BLACK_FILL = Color(0xFF333333)
private val PATH_COLOR = Color(0xFF2563EB)
// A line joining two matching symbols that isn't symmetric.
private val UNBALANCED_COLOR = Color(0xFFDC2626)
private val INK = Color(0xFF222222)

/**
 * Compose Canvas renderer for Balance Link (puzzle type 32), the analog of
 * frontend/src/components/BalanceLinkBoard.tsx.
 *
 * Lines are drawn as on Number Link — a one-finger drag between cell centres, sharing
 * [PathDragState] — with the segment cap set by [BalanceLinkRules.capacity]: black cells
 * take none and symbols one, so a line can't enter a black cell or run through a symbol.
 * A tap clears the segments touching the tapped cell, unless the caller passes
 * [onTapCell] (the Admin editor selects the cell instead). A line that joins two matching
 * symbols but isn't symmetric is drawn red. Two fingers pan/zoom via [ZoomableBoard].
 */
@Composable
fun BalanceLinkBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onSetEdge: (key: String, state: Int) -> Unit,
    modifier: Modifier = Modifier,
    onTapCell: ((col: Int, row: Int) -> Unit)? = null,
    selectedCell: String? = null,
) {
    // Keyed on the canon too: the Admin editor changes it under a stable id.
    val cells = remember(puzzle.id, puzzle.canonRepr) { NumberLinkEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    // The gesture closures outlive recomposition, so read the freshest state through these.
    val valuesState = rememberUpdatedState(userValues)
    val cellsState = rememberUpdatedState(cells)
    val onSet = rememberUpdatedState(onSetEdge)
    val onTap = rememberUpdatedState(onTapCell)
    val selectedState = rememberUpdatedState(selectedCell)

    val drag = remember(puzzle.id) {
        PathDragState(rows, cols) { cs, r, c -> BalanceLinkRules.capacity(cs.getOrNull(r)?.getOrNull(c) ?: 0) }
    }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            val custom = onTap.value
            if (custom != null) {
                custom(col, row)
            } else {
                // Clear the segments touching the tapped cell.
                val v = valuesState.value
                val r = row
                val c = col
                for (key in listOf(
                    NumberLinkEngine.hKey(r, c - 1), NumberLinkEngine.hKey(r, c),
                    NumberLinkEngine.vKey(r - 1, c), NumberLinkEngine.vKey(r, c),
                )) {
                    if (v[key] == NumberLinkEngine.SEGMENT) onSet.value(key, NumberLinkEngine.EMPTY)
                }
            }
        },
        // ZoomableBoard reports cells as (col, row); the drag state works in (row, col).
        onDrawStart = { cell -> drag.start(cell?.let { (c, r) -> r to c }) },
        onDrawTo = { cell ->
            drag.moveTo(cell?.let { (c, r) -> r to c }, cellsState.value, valuesState.value) { key, st ->
                onSet.value(key, st)
            }
        },
        onDrawEnd = { drag.end() },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))
        val values = valuesState.value

        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (cells[r].getOrNull(c) == BalanceLinkRules.BLACK) {
                    drawRect(BLACK_FILL, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
                }
            }
        }

        // Dashed inner grid lines, like the print.
        val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.1f, cell * 0.07f))
        val gridW = 1.dp.toPx()
        for (r in 1 until rows) drawLine(GRID_LINE, Offset(0f, r * cell), Offset(boardW, r * cell), gridW, pathEffect = dash)
        for (c in 1 until cols) drawLine(GRID_LINE, Offset(c * cell, 0f), Offset(c * cell, boardH), gridW, pathEffect = dash)

        // Segments of matched but unbalanced lines, keyed like userValues.
        val edges = NumberLinkEngine.edges(cells, values)
        val red = HashSet<String>()
        for (line in BalanceLinkRules.traceLines(cells, edges)) {
            if (!line.matched || line.balanced) continue
            for (i in 1 until line.points.size) {
                val (r0, c0) = line.points[i - 1]
                val (r1, c1) = line.points[i]
                red.add(if (r0 == r1) NumberLinkEngine.hKey(r0, minOf(c0, c1)) else NumberLinkEngine.vKey(minOf(r0, r1), c0))
            }
        }
        val pathW = cell * 0.14f
        for (r in 0 until rows) {
            for (c in 0 until cols - 1) {
                val key = NumberLinkEngine.hKey(r, c)
                if (values[key] == NumberLinkEngine.SEGMENT) {
                    drawLine(
                        if (key in red) UNBALANCED_COLOR else PATH_COLOR,
                        Offset((c + 0.5f) * cell, (r + 0.5f) * cell), Offset((c + 1.5f) * cell, (r + 0.5f) * cell),
                        pathW, cap = StrokeCap.Round,
                    )
                }
            }
        }
        for (r in 0 until rows - 1) {
            for (c in 0 until cols) {
                val key = NumberLinkEngine.vKey(r, c)
                if (values[key] == NumberLinkEngine.SEGMENT) {
                    drawLine(
                        if (key in red) UNBALANCED_COLOR else PATH_COLOR,
                        Offset((c + 0.5f) * cell, (r + 0.5f) * cell), Offset((c + 0.5f) * cell, (r + 1.5f) * cell),
                        pathW, cap = StrokeCap.Round,
                    )
                }
            }
        }

        val borderW = 2.dp.toPx()
        drawRect(BORDER, topLeft = Offset(0f, 0f), size = Size(boardW, boardH), style = Stroke(borderW))

        // Symbols on top of the lines.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val v = cells[r].getOrNull(c) ?: 0
                if (BalanceLinkRules.isSymbol(v)) {
                    drawBalanceSymbol(v, Offset((c + 0.5f) * cell, (r + 0.5f) * cell), cell * 0.32f, 1.5.dp.toPx())
                }
            }
        }

        drawCellSelection(selectedState.value, cell)
    }
}

private fun starPath(center: Offset, outer: Float, inner: Float, tips: Int): Path = Path().apply {
    for (i in 0 until tips * 2) {
        val rad = if (i % 2 == 0) outer else inner
        val a = -PI / 2 + i * PI / tips
        val x = center.x + rad * cos(a).toFloat()
        val y = center.y + rad * sin(a).toFloat()
        if (i == 0) moveTo(x, y) else lineTo(x, y)
    }
    close()
}

/**
 * Draw the Balance Link symbol [code] centred at [center] within radius [r]: filled for a
 * black symbol, white with an outline otherwise. Shared by the board, the mini board and
 * the editor's shape picker; matches balanceLinkSymbols.tsx.
 */
fun DrawScope.drawBalanceSymbol(code: Int, center: Offset, r: Float, strokePx: Float) {
    val (x, y) = center
    val path = when (BalanceLinkRules.shapeOf(code)) {
        1 -> null
        2 -> Path().apply {
            val s = r * 0.75f
            addRect(androidx.compose.ui.geometry.Rect(x - s, y - s, x + s, y + s))
        }
        3 -> Path().apply { moveTo(x, y - r); lineTo(x + r, y); lineTo(x, y + r); lineTo(x - r, y); close() }
        4 -> Path().apply { moveTo(x, y - r); lineTo(x + r * 0.95f, y + r * 0.7f); lineTo(x - r * 0.95f, y + r * 0.7f); close() }
        5 -> Path().apply { moveTo(x, y + r); lineTo(x + r * 0.95f, y - r * 0.7f); lineTo(x - r * 0.95f, y - r * 0.7f); close() }
        6 -> starPath(Offset(x, y + r * 0.08f), r, r * 0.42f, 5)
        7 -> starPath(center, r, r * 0.32f, 4)
        else -> null
    }
    val fill = if (BalanceLinkRules.isBlackSymbol(code)) INK else Color.White
    if (path == null) {
        drawCircle(fill, r * 0.9f, center)
        drawCircle(INK, r * 0.9f, center, style = Stroke(strokePx))
    } else {
        drawPath(path, fill)
        drawPath(path, INK, style = Stroke(strokePx))
    }
}
